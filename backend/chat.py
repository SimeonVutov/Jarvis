import asyncio
import datetime
import json
from functools import partial
from typing import AsyncGenerator

import ollama
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt
from backend.memory import store_memory, recall_memories
from backend.ai import detect_mode, build_system_prompt, should_web_search, web_search, format_search_results
from backend.config import load_config
from backend.schemas import ChatRequest

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.post("/api/chat")
async def chat(body: ChatRequest):
    _require_auth()

    async def generate() -> AsyncGenerator[str, None]:
        con = get_connection()
        try:
            user = load_config()["user"]
            mode = detect_mode(body.message, body.mode or "general")
            yield f"data: {json.dumps({'type': 'mode', 'mode': mode})}\n\n"

            search_context = ""
            if should_web_search(body.message):
                yield f"data: {json.dumps({'type': 'status', 'text': 'Searching the web…'})}\n\n"
                loop    = asyncio.get_event_loop()
                results = await loop.run_in_executor(None, partial(web_search, body.message))
                search_context = format_search_results(results)

            memories = await asyncio.get_event_loop().run_in_executor(
                None, partial(recall_memories, con, body.message)
            )

            today = datetime.date.today().isoformat()
            reminder_rows = con.execute(
                "SELECT title, due_date FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 5",
                (today,),
            ).fetchall()
            upcoming = [{"title": safe_decrypt(r["title"]), "due_date": r["due_date"]} for r in reminder_rows]

            # Load all projects and their text file contents for AI context
            projects = []
            proj_rows = con.execute(
                "SELECT id, name, description FROM projects ORDER BY id"
            ).fetchall()
            for proj in proj_rows:
                files = []
                file_rows = con.execute(
                    "SELECT filename, mime_type, content, is_binary FROM project_files WHERE project_id=?",
                    (proj["id"],),
                ).fetchall()
                for f in file_rows:
                    fname = safe_decrypt(f["filename"])
                    # Only include text files in context — skip binaries
                    if not f["is_binary"]:
                        files.append({
                            "filename": fname,
                            "content":  safe_decrypt(f["content"]),
                        })
                    else:
                        files.append({"filename": fname, "content": None})
                projects.append({
                    "name":        safe_decrypt(proj["name"]),
                    "description": safe_decrypt(proj["description"]),
                    "files":       files,
                })

            system   = build_system_prompt(mode, memories, search_context, upcoming, user, projects)
            messages = [{"role": "system", "content": system}]

            if body.session_id:
                history = con.execute(
                    "SELECT role,content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 14",
                    (body.session_id,),
                ).fetchall()
                messages.extend([
                    {"role": r["role"], "content": safe_decrypt(r["content"])}
                    for r in reversed(history)
                ])

            messages.append({"role": "user", "content": body.message})

            full_response = ""
            for chunk in ollama.chat(model=state.MODELS[mode], messages=messages, stream=True):
                delta = chunk["message"]["content"]
                full_response += delta
                yield f"data: {json.dumps({'type': 'delta', 'delta': delta})}\n\n"
                await asyncio.sleep(0)

            if full_response:
                sid = body.session_id
                if not sid:
                    cur = con.execute(
                        "INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)",
                        (datetime.date.today().isoformat(), mode, encrypt(body.message[:80])),
                    )
                    con.commit()
                    sid = cur.lastrowid

                ts = datetime.datetime.now().isoformat()
                con.execute(
                    "INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                    (sid, ts, "user", encrypt(body.message), mode),
                )
                con.execute(
                    "INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                    (sid, ts, "assistant", encrypt(full_response), mode),
                )
                row = con.execute("SELECT summary FROM sessions WHERE id=?", (sid,)).fetchone()
                if row and not row["summary"]:
                    con.execute(
                        "UPDATE sessions SET summary=?,mode=? WHERE id=?",
                        (encrypt(body.message[:80]), mode, sid),
                    )
                con.commit()
                store_memory(
                    con, "conversation",
                    f"[{mode}][{datetime.date.today()}] User: {body.message[:300]} Assistant: {full_response[:400]}",
                    tags=mode,
                )
                yield f"data: {json.dumps({'type': 'done', 'session_id': sid, 'mode': mode})}\n\n"

        except asyncio.CancelledError:
            pass  # Client disconnected — stop button was pressed
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            con.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
