from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/stats")
async def stats():
    _require_auth()
    con = get_connection()
    usage = con.execute(
        "SELECT tags AS mode, COUNT(*) AS total FROM memories WHERE category='conversation' GROUP BY tags"
    ).fetchall()
    totals = {
        "sessions": con.execute("SELECT COUNT(*) AS c FROM sessions").fetchone()["c"],
        "messages": con.execute("SELECT COUNT(*) AS c FROM messages").fetchone()["c"],
        "journal":  con.execute("SELECT COUNT(*) AS c FROM facts").fetchone()["c"],
        "memories": con.execute("SELECT COUNT(*) AS c FROM memories").fetchone()["c"],
    }
    daily = con.execute("""
        SELECT substr(ts,1,10) AS date, tags AS mode, COUNT(*) AS count
        FROM memories WHERE category='conversation'
        GROUP BY date, mode ORDER BY date DESC LIMIT 60
    """).fetchall()
    con.close()
    return {
        "usage_by_mode": [dict(r) for r in usage],
        "totals":        totals,
        "daily_usage":   [dict(r) for r in daily],
        "models":        state.MODELS,
    }
