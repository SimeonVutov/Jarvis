import datetime
from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt
from backend.memory import store_memory

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/journal")
async def list_journal(limit: int = 50):
    _require_auth()
    con  = get_connection()
    rows = con.execute("SELECT * FROM facts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    con.close()
    return [{**dict(r), "content": safe_decrypt(r["content"])} for r in rows]


@router.post("/api/journal")
async def add_entry(body: dict):
    _require_auth()
    text  = body.get("content", "").strip()
    topic = body.get("topic", "journal")
    if not text:
        raise HTTPException(400, "content required")
    con = get_connection()
    ts  = datetime.datetime.now().isoformat()
    con.execute("INSERT INTO facts(ts,topic,content) VALUES(?,?,?)", (ts, topic, encrypt(text)))
    con.commit()
    store_memory(con, "journal", text, tags="journal")
    con.close()
    return {"success": True}


@router.delete("/api/journal/{jid}")
async def delete_entry(jid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM facts WHERE id=?", (jid,))
    con.commit()
    con.close()
    return {"deleted": jid}
