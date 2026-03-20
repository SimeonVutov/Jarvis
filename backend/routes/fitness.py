import datetime
from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt
from backend.memory import store_memory
from backend.schemas import FitnessEntry

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/fitness")
async def get_fitness(period: str = "month"):
    _require_auth()
    con    = get_connection()
    today  = datetime.date.today()
    days   = {"week": 7, "month": 30, "year": 365}.get(period, 30)
    cutoff = (today - datetime.timedelta(days=days)).isoformat()
    rows   = con.execute(
        "SELECT * FROM fitness WHERE date>=? ORDER BY date ASC", (cutoff,)
    ).fetchall()
    con.close()
    return [
        {
            **dict(r),
            "workout": safe_decrypt(r["workout"]) if r["workout"] else "",
            "notes":   safe_decrypt(r["notes"])   if r["notes"]   else "",
        }
        for r in rows
    ]


@router.post("/api/fitness")
async def log_fitness(body: FitnessEntry):
    _require_auth()
    con = get_connection()
    con.execute(
        "INSERT OR REPLACE INTO fitness(date,calories,weight,workout,notes) VALUES(?,?,?,?,?)",
        (
            body.date,
            body.calories,
            body.weight,
            encrypt(body.workout) if body.workout else None,
            encrypt(body.notes)   if body.notes   else None,
        ),
    )
    con.commit()
    parts = []
    if body.calories: parts.append(f"{body.calories} kcal")
    if body.weight:   parts.append(f"{body.weight} kg")
    if body.workout:  parts.append(f"workout: {body.workout}")
    if parts:
        store_memory(con, "fitness", f"Fitness {body.date}: {', '.join(parts)}", tags="fitness")
    con.close()
    return {"success": True}
