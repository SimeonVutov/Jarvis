from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection
from backend.crypto import safe_decrypt

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/memories")
async def list_memories(q: str = "", category: str = "", limit: int = 60):
    _require_auth()
    con  = get_connection()
    rows = con.execute("SELECT * FROM memories ORDER BY id DESC LIMIT ?", (limit * 5,)).fetchall()
    result = []
    for r in rows:
        content = safe_decrypt(r["content"])
        if q and q.lower() not in content.lower():
            continue
        if category and r["category"] != category:
            continue
        result.append({**dict(r), "content": content[:300]})
        if len(result) >= limit:
            break
    con.close()
    return result


@router.delete("/api/memories/{mid}")
async def delete_memory(mid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM memories WHERE id=?", (mid,))
    con.commit()
    con.close()
    return {"deleted": mid}
