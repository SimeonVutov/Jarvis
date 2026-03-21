import datetime
from fastapi import APIRouter, HTTPException
from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt
from backend.schemas import ReminderCreate

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/reminders")
async def get_reminders():
    _require_auth()
    con   = get_connection()
    today = datetime.date.today().isoformat()
    rows  = con.execute(
        "SELECT * FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date", (today,)
    ).fetchall()
    con.close()
    return [
        {**dict(r), "title": safe_decrypt(r["title"]), "description": safe_decrypt(r["description"])}
        for r in rows
    ]


@router.post("/api/reminders")
async def add_reminder(body: ReminderCreate):
    _require_auth()
    con = get_connection()
    cur = con.execute(
        "INSERT INTO reminders(title,due_date,description) VALUES(?,?,?)",
        (encrypt(body.title), body.due_date, encrypt(body.description)),
    )
    con.commit()
    rid = cur.lastrowid
    con.close()
    return {"id": rid, "title": body.title, "due_date": body.due_date, "description": body.description}


@router.patch("/api/reminders/{rid}/done")
async def mark_done(rid: int):
    _require_auth()
    con = get_connection()
    con.execute("UPDATE reminders SET done=1 WHERE id=?", (rid,))
    con.commit()
    con.close()
    return {"done": rid}


@router.delete("/api/reminders/{rid}")
async def delete_reminder(rid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM reminders WHERE id=?", (rid,))
    con.commit()
    con.close()
    return {"deleted": rid}
