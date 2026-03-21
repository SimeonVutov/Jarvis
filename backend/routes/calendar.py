"""
Calendar routes — tasks, events, groups, and per-app settings.

Tasks:   have optional time, duration, group, and a done toggle.
Events:  always have start+end time; end_time < start_time = overnight.
Groups:  belong to tasks only; each has a name and a colour.
Settings: stored in config.json under the "calendar" key.
"""

import datetime
from fastapi import APIRouter, HTTPException, Query

from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt
from backend.config import load_config, save_config
from backend.schemas import (
    CalendarTaskCreate, CalendarTaskUpdate, CalendarTaskDone,
    CalendarEventCreate, CalendarEventUpdate,
    CalendarGroupCreate, CalendarGroupUpdate,
    CalendarSettingsUpdate,
)

router = APIRouter(prefix="/api/calendar")

DEFAULT_SETTINGS = {
    "ai_context_days": 7,
    "priority_labels": {"high": "High", "mid": "Medium", "low": "Low"},
    "priority_colors": {"high": "#ef4444", "mid": "#f59e0b", "low": "#64748b"},
}


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


def _decode_task(row) -> dict:
    d = dict(row)
    d["title"]       = safe_decrypt(d["title"])
    d["description"] = safe_decrypt(d["description"])
    return d


def _decode_event(row) -> dict:
    d = dict(row)
    d["title"]       = safe_decrypt(d["title"])
    d["description"] = safe_decrypt(d["description"])
    return d


def _decode_group(row) -> dict:
    d = dict(row)
    d["name"] = safe_decrypt(d["name"])
    return d


def _date_range(year: int, month: int):
    """Return (date_from, date_to) strings covering the month ±3 days."""
    first = datetime.date(year, month, 1)
    last  = (datetime.date(year, month + 1, 1) if month < 12
             else datetime.date(year + 1, 1, 1)) - datetime.timedelta(days=1)
    return (
        (first - datetime.timedelta(days=3)).isoformat(),
        (last  + datetime.timedelta(days=3)).isoformat(),
    )


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(year: int = Query(...), month: int = Query(...)):
    _require_auth()
    con = get_connection()
    date_from, date_to = _date_range(year, month)
    rows = con.execute(
        "SELECT * FROM calendar_tasks WHERE date >= ? AND date <= ? ORDER BY date, start_time, priority",
        (date_from, date_to),
    ).fetchall()
    con.close()
    return [_decode_task(r) for r in rows]


@router.post("/tasks")
async def create_task(body: CalendarTaskCreate):
    _require_auth()
    ts  = datetime.datetime.now().isoformat()
    con = get_connection()
    cur = con.execute(
        "INSERT INTO calendar_tasks(title,description,date,start_time,duration_minutes,priority,group_id,done,created_at) "
        "VALUES(?,?,?,?,?,?,?,0,?)",
        (encrypt(body.title), encrypt(body.description), body.date,
         body.start_time, body.duration_minutes, body.priority, body.group_id, ts),
    )
    con.commit()
    row = con.execute("SELECT * FROM calendar_tasks WHERE id=?", (cur.lastrowid,)).fetchone()
    con.close()
    return _decode_task(row)


@router.put("/tasks/{tid}")
async def update_task(tid: int, body: CalendarTaskUpdate):
    _require_auth()
    con = get_connection()
    if not con.execute("SELECT id FROM calendar_tasks WHERE id=?", (tid,)).fetchone():
        con.close(); raise HTTPException(404, "Task not found")

    fields: dict = {}
    if body.title            is not None: fields["title"]            = encrypt(body.title)
    if body.description      is not None: fields["description"]      = encrypt(body.description)
    if body.date             is not None: fields["date"]             = body.date
    if body.start_time       is not None: fields["start_time"]       = body.start_time
    if body.duration_minutes is not None: fields["duration_minutes"] = body.duration_minutes
    if body.priority         is not None: fields["priority"]         = body.priority
    if body.group_id         is not None: fields["group_id"]         = body.group_id
    if body.done             is not None: fields["done"]             = int(body.done)

    if fields:
        set_clause = ", ".join(f"{k}=?" for k in fields)
        con.execute(f"UPDATE calendar_tasks SET {set_clause} WHERE id=?",  # nosec B608
                    list(fields.values()) + [tid])
        con.commit()

    row = con.execute("SELECT * FROM calendar_tasks WHERE id=?", (tid,)).fetchone()
    con.close()
    return _decode_task(row)


@router.patch("/tasks/{tid}/done")
async def toggle_task_done(tid: int, body: CalendarTaskDone):
    _require_auth()
    con = get_connection()
    con.execute("UPDATE calendar_tasks SET done=? WHERE id=?", (int(body.done), tid))
    con.commit()
    row = con.execute("SELECT * FROM calendar_tasks WHERE id=?", (tid,)).fetchone()
    con.close()
    if not row: raise HTTPException(404, "Task not found")
    return _decode_task(row)


@router.delete("/tasks/{tid}")
async def delete_task(tid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM calendar_tasks WHERE id=?", (tid,))
    con.commit()
    con.close()
    return {"deleted": tid}


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events")
async def list_events(year: int = Query(...), month: int = Query(...)):
    _require_auth()
    con = get_connection()
    date_from, date_to = _date_range(year, month)
    rows = con.execute(
        "SELECT * FROM calendar_events WHERE date >= ? AND date <= ? ORDER BY date, start_time",
        (date_from, date_to),
    ).fetchall()
    con.close()
    return [_decode_event(r) for r in rows]


@router.post("/events")
async def create_event(body: CalendarEventCreate):
    _require_auth()
    ts  = datetime.datetime.now().isoformat()
    con = get_connection()
    cur = con.execute(
        "INSERT INTO calendar_events(title,description,date,start_time,end_time,priority,created_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (encrypt(body.title), encrypt(body.description), body.date,
         body.start_time, body.end_time, body.priority, ts),
    )
    con.commit()
    row = con.execute("SELECT * FROM calendar_events WHERE id=?", (cur.lastrowid,)).fetchone()
    con.close()
    return _decode_event(row)


@router.put("/events/{eid}")
async def update_event(eid: int, body: CalendarEventUpdate):
    _require_auth()
    con = get_connection()
    if not con.execute("SELECT id FROM calendar_events WHERE id=?", (eid,)).fetchone():
        con.close(); raise HTTPException(404, "Event not found")

    fields: dict = {}
    if body.title       is not None: fields["title"]       = encrypt(body.title)
    if body.description is not None: fields["description"] = encrypt(body.description)
    if body.date        is not None: fields["date"]        = body.date
    if body.start_time  is not None: fields["start_time"]  = body.start_time
    if body.end_time    is not None: fields["end_time"]    = body.end_time
    if body.priority    is not None: fields["priority"]    = body.priority

    if fields:
        set_clause = ", ".join(f"{k}=?" for k in fields)
        con.execute(f"UPDATE calendar_events SET {set_clause} WHERE id=?",  # nosec B608
                    list(fields.values()) + [eid])
        con.commit()

    row = con.execute("SELECT * FROM calendar_events WHERE id=?", (eid,)).fetchone()
    con.close()
    return _decode_event(row)


@router.delete("/events/{eid}")
async def delete_event(eid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM calendar_events WHERE id=?", (eid,))
    con.commit()
    con.close()
    return {"deleted": eid}


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups")
async def list_groups():
    _require_auth()
    con  = get_connection()
    rows = con.execute("SELECT * FROM calendar_groups ORDER BY id").fetchall()
    con.close()
    return [_decode_group(r) for r in rows]


@router.post("/groups")
async def create_group(body: CalendarGroupCreate):
    _require_auth()
    ts  = datetime.datetime.now().isoformat()
    con = get_connection()
    cur = con.execute(
        "INSERT INTO calendar_groups(name,color,created_at) VALUES(?,?,?)",
        (encrypt(body.name), body.color, ts),
    )
    con.commit()
    row = con.execute("SELECT * FROM calendar_groups WHERE id=?", (cur.lastrowid,)).fetchone()
    con.close()
    return _decode_group(row)


@router.put("/groups/{gid}")
async def update_group(gid: int, body: CalendarGroupUpdate):
    _require_auth()
    con = get_connection()
    if body.name  is not None: con.execute("UPDATE calendar_groups SET name=?  WHERE id=?", (encrypt(body.name), gid))
    if body.color is not None: con.execute("UPDATE calendar_groups SET color=? WHERE id=?", (body.color, gid))
    con.commit()
    row = con.execute("SELECT * FROM calendar_groups WHERE id=?", (gid,)).fetchone()
    con.close()
    if not row: raise HTTPException(404, "Group not found")
    return _decode_group(row)


@router.delete("/groups/{gid}")
async def delete_group(gid: int):
    _require_auth()
    con = get_connection()
    con.execute("UPDATE calendar_tasks SET group_id=NULL WHERE group_id=?", (gid,))
    con.execute("DELETE FROM calendar_groups WHERE id=?", (gid,))
    con.commit()
    con.close()
    return {"deleted": gid}


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_calendar_settings():
    cfg = load_config()
    return {**DEFAULT_SETTINGS, **cfg.get("calendar", {})}


@router.put("/settings")
async def update_calendar_settings(body: CalendarSettingsUpdate):
    _require_auth()
    cfg = load_config()
    cal = {**DEFAULT_SETTINGS, **cfg.get("calendar", {})}
    if body.ai_context_days is not None: cal["ai_context_days"] = body.ai_context_days
    if body.priority_labels is not None: cal["priority_labels"] = body.priority_labels
    if body.priority_colors is not None: cal["priority_colors"] = body.priority_colors
    cfg["calendar"] = cal
    save_config(cfg)
    return cal
