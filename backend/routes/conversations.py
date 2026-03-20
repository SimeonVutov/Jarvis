from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection
from backend.crypto import safe_decrypt

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/conversations")
async def list_conversations(limit: int = 60):
    _require_auth()
    con  = get_connection()
    rows = con.execute("""
        SELECT s.id, s.date, s.mode, s.summary, COUNT(m.id) AS msg_count
        FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
        GROUP BY s.id ORDER BY s.id DESC LIMIT ?
    """, (limit,)).fetchall()
    con.close()
    return [{**dict(r), "summary": safe_decrypt(r["summary"]) or "New conversation"} for r in rows]


@router.get("/api/conversations/{sid}")
async def get_conversation(sid: int):
    _require_auth()
    con  = get_connection()
    msgs = con.execute(
        "SELECT role,content,ts,mode FROM messages WHERE session_id=? ORDER BY id", (sid,)
    ).fetchall()
    con.close()
    return [
        {"role": m["role"], "content": safe_decrypt(m["content"]), "ts": m["ts"], "mode": m["mode"]}
        for m in msgs
    ]


@router.delete("/api/conversations/{sid}")
async def delete_conversation(sid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM messages WHERE session_id=?", (sid,))
    con.execute("DELETE FROM sessions WHERE id=?", (sid,))
    con.commit()
    con.close()
    return {"deleted": sid}
