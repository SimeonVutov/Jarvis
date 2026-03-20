import base64
import sqlite3
from fastapi import APIRouter, HTTPException
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from backend import state
from backend.config import load_config, get_db_path
from backend.crypto import load_or_create_salt, derive_key
from backend.database import get_connection, ensure_tables
from backend.memory import init_chroma
from backend.schemas import UnlockRequest

router = APIRouter()


@router.get("/api/status")
async def status():
    return {"unlocked": state.UNLOCKED, "user": load_config()["user"].get("name", "User")}


@router.post("/api/unlock")
async def unlock(body: UnlockRequest):
    salt = load_or_create_salt()
    key  = derive_key(body.password, salt)

    if get_db_path().exists():
        try:
            con = sqlite3.connect(get_db_path())
            row = con.execute("SELECT content FROM memories ORDER BY id LIMIT 1").fetchone()
            con.close()
            if row:
                raw = base64.b64decode(row[0].encode())
                AESGCM(key).decrypt(raw[:12], raw[12:], None)
        except Exception:
            raise HTTPException(401, "Wrong password")

    state.KEY      = key
    state.UNLOCKED = True
    state.MODELS   = load_config()["models"]

    init_chroma()
    con = get_connection()
    ensure_tables(con)
    con.close()

    return {"success": True, "user": load_config()["user"].get("name", "User")}


@router.post("/api/lock")
async def lock():
    state.KEY      = b""
    state.UNLOCKED = False
    return {"success": True}
