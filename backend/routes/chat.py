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
from backend.app_context import build_app_contexts
from backend.app_registry import REGISTRY, tags_for_enabled_apps
from backend.config import load_config
from backend.schemas import ChatRequest

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


def _get_enabled_app_ids(cfg: dict | None = None) -> set[str]:
    if cfg is None:
        cfg = load_config()
    stored = cfg.get("apps", {})
    enabled = set()
    for app in REGISTRY:
        if app.core or stored.get(app.id, {}).get("enabled", True):
            enabled.add(app.id)
    return enabled


@router.post("/api/chat")
async def chat(body: ChatRequest):
    _require_auth()

    async def generate() -> AsyncGenerator[str, None]:
        con = get_connection()
        try:
            cfg  = load_config()
            user = cfg["user"]
            mode = detect_mode(body.message, body.mode or "general")
            yield f"data: {json.dumps({'type': 'mode', 'mode': mode})}\n\n"

            # Web search
            search_context = ""
            if should_web_search(body.message):
                yield f"data: {json.dumps({'type': 'status', 'text': 'Searching the web…'})}\n\n"
                results = await asyncio.get_event_loop().run_in_executor(
                    None, partial(web_search, body.message)
                )
                search_context = format_search_results(results)

            # Only recall memories from enabled apps
            enabled_ids   = _get_enabled_app_ids(cfg)
            allowed_tags  = tags_for_enabled_apps(enabled_ids)
            memories      = await asyncio.get_event_loop().run_in_executor(
                None, partial(recall_memories, con, body.message, 6, allowed_tags)
            )

            # Build context blocks from each enabled app.
            # build_app_contexts opens its own DB connection — safe across threads.
            app_context = await asyncio.get_event_loop().run_in_executor(
                None, lambda: build_app_contexts(enabled_ids, None, user)
            )

            system   = build_system_prompt(mode, memories, search_context, app_context, user)
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
            pass
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            con.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/debug/system-prompt")
async def debug_system_prompt():
    """DEV ONLY — returns the exact system prompt that would be built for the next chat."""
    _require_auth()
    import traceback
    con = get_connection()
    try:
        cfg          = load_config()
        user         = cfg["user"]
        enabled_ids  = _get_enabled_app_ids(cfg)
        try:
            app_context = build_app_contexts(enabled_ids, con, user)
        except Exception as e:
            app_context = f"ERROR building app_context: {traceback.format_exc()}"
        system = build_system_prompt("general", [], "", app_context, user)
        return {
            "enabled_ids":   list(enabled_ids),
            "app_context":   app_context,
            "system_prompt": system,
        }
    finally:
        con.close()
