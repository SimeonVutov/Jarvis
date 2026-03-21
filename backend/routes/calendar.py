"""
Calendar routes — tasks, events, groups, and settings.
All Pydantic models are defined inline — no dependency on backend.schemas.
"""

import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend import state
from backend.database import get_connection
from backend.crypto import encrypt, safe_decrypt

router = APIRouter()

LEVEL_ORDER = {"high": 4, "mid": 3, "low": 2, "not_important": 1}
DEFAULT_SETTINGS = {"context_days_before": 7, "context_days_ahead": 30}


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title:            str
    description:      str = ""
    date:             str
    start_time:       Optional[str] = None
    duration_minutes: int = 0
    level:            str = "low"
    group_id:         Optional[int] = None

class TaskUpdate(TaskCreate):
    pass

class EventCreate(BaseModel):
    title:       str
    description: str = ""
    start_date:  str
    start_time:  Optional[str] = None
    end_date:    Optional[str] = None
    end_time:    Optional[str] = None
    level:       str = "low"

class EventUpdate(EventCreate):
    pass

class GroupCreate(BaseModel):
    name:  str
    color: str = "#00c8f0"

class SettingsUpdate(BaseModel):
    context_days_before: Optional[int] = None
    context_days_ahead:  Optional[int] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


def _get_settings(con) -> dict:
    rows   = con.execute("SELECT key, value FROM calendar_settings").fetchall()
    result = dict(DEFAULT_SETTINGS)
    for r in rows:
        result[r["key"]] = r["value"]
    return {k: int(str(v).strip("'\"")) for k, v in result.items()}


def _decode_task(row) -> dict:
    d = dict(row)
    d["title"]       = safe_decrypt(d["title"])
    d["description"] = safe_decrypt(d["description"]) if d.get("description") else ""
    return d


def _decode_event(row) -> dict:
    d = dict(row)
    d["title"]       = safe_decrypt(d["title"])
    d["description"] = safe_decrypt(d["description"]) if d.get("description") else ""
    return d


def _decode_group(row) -> dict:
    d = dict(row)
    d["name"] = safe_decrypt(d["name"])
    return d


# ── Month summary ──────────────────────────────────────────────────────────────

@router.get("/api/calendar/month")
async def get_month(year: int, month: int):
    """Returns a summary of tasks and events for an entire month grid."""
    _require_auth()
    con   = get_connection()
    start = f"{year:04d}-{month:02d}-01"
    end   = f"{year+1:04d}-01-01" if month == 12 else f"{year:04d}-{month+1:02d}-01"

    tasks = con.execute(
        "SELECT id,title,date,start_time,level,group_id,done FROM calendar_tasks WHERE date>=? AND date<? ORDER BY date,start_time",
        (start, end),
    ).fetchall()
    events = con.execute(
        "SELECT id,title,start_date,start_time,end_date,level FROM calendar_events WHERE (start_date>=? AND start_date<?) OR (end_date>=? AND end_date<?)",
        (start, end, start, end),
    ).fetchall()
    con.close()

    result: dict = {}
    for t in tasks:
        d = t["date"]
        result.setdefault(d, {"tasks": [], "events": []})
        result[d]["tasks"].append({
            "id": t["id"], "title": safe_decrypt(t["title"]),
            "level": t["level"], "done": bool(t["done"]),
            "start_time": t["start_time"], "group_id": t["group_id"],
        })
    for e in events:
        for date_key in [e["start_date"], e["end_date"]]:
            if not date_key or not (start <= date_key < end):
                continue
            result.setdefault(date_key, {"tasks": [], "events": []})
            result[date_key]["events"].append({
                "id": e["id"], "title": safe_decrypt(e["title"]),
                "level": e["level"], "start_time": e["start_time"],
            })

    for day in result.values():
        day["tasks"].sort(key=lambda x: LEVEL_ORDER.get(x["level"], 0), reverse=True)
        day["events"].sort(key=lambda x: LEVEL_ORDER.get(x["level"], 0), reverse=True)

    return result


# ── Day detail ─────────────────────────────────────────────────────────────────

@router.get("/api/calendar/items")
async def get_day_items(date: str):
    """Full task and event list for a specific date including cross-midnight events."""
    _require_auth()
    con  = get_connection()
    prev = (datetime.date.fromisoformat(date) - datetime.timedelta(days=1)).isoformat()

    tasks = con.execute(
        "SELECT * FROM calendar_tasks WHERE date=? ORDER BY start_time",
        (date,),
    ).fetchall()
    events = con.execute(
        "SELECT * FROM calendar_events WHERE start_date=? OR (end_date=? AND start_date=?)",
        (date, date, prev),
    ).fetchall()
    groups = con.execute("SELECT * FROM calendar_groups").fetchall()
    con.close()

    return {
        "tasks":  [_decode_task(t)  for t in tasks],
        "events": [_decode_event(e) for e in events],
        "groups": [_decode_group(g) for g in groups],
    }


# ── Tasks ──────────────────────────────────────────────────────────────────────

@router.post("/api/calendar/tasks")
async def create_task(body: TaskCreate):
    _require_auth()
    con = get_connection()
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO calendar_tasks(title,description,date,start_time,duration_minutes,level,group_id,done,created_at) VALUES(?,?,?,?,?,?,?,0,?)",
        (encrypt(body.title), encrypt(body.description), body.date, body.start_time,
         body.duration_minutes, body.level, body.group_id, ts),
    )
    con.commit()
    tid = cur.lastrowid
    con.close()
    return {"id": tid, **body.model_dump(), "done": False, "created_at": ts}


@router.put("/api/calendar/tasks/{tid}")
async def update_task(tid: int, body: TaskUpdate):
    _require_auth()
    con = get_connection()
    con.execute(
        "UPDATE calendar_tasks SET title=?,description=?,date=?,start_time=?,duration_minutes=?,level=?,group_id=? WHERE id=?",
        (encrypt(body.title), encrypt(body.description), body.date, body.start_time,
         body.duration_minutes, body.level, body.group_id, tid),
    )
    con.commit()
    con.close()
    return {"success": True}


@router.patch("/api/calendar/tasks/{tid}/done")
async def toggle_task_done(tid: int):
    _require_auth()
    con = get_connection()
    row = con.execute("SELECT done FROM calendar_tasks WHERE id=?", (tid,)).fetchone()
    if not row:
        raise HTTPException(404, "Task not found")
    new_done = 0 if row["done"] else 1
    con.execute("UPDATE calendar_tasks SET done=? WHERE id=?", (new_done, tid))
    con.commit()
    con.close()
    return {"done": bool(new_done)}


@router.delete("/api/calendar/tasks/{tid}")
async def delete_task(tid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM calendar_tasks WHERE id=?", (tid,))
    con.commit()
    con.close()
    return {"deleted": tid}


# ── Events ─────────────────────────────────────────────────────────────────────

@router.post("/api/calendar/events")
async def create_event(body: EventCreate):
    _require_auth()
    con = get_connection()
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO calendar_events(title,description,start_date,start_time,end_date,end_time,level,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (encrypt(body.title), encrypt(body.description), body.start_date, body.start_time,
         body.end_date, body.end_time, body.level, ts),
    )
    con.commit()
    eid = cur.lastrowid
    con.close()
    return {"id": eid, **body.model_dump(), "created_at": ts}


@router.put("/api/calendar/events/{eid}")
async def update_event(eid: int, body: EventUpdate):
    _require_auth()
    con = get_connection()
    con.execute(
        "UPDATE calendar_events SET title=?,description=?,start_date=?,start_time=?,end_date=?,end_time=?,level=? WHERE id=?",
        (encrypt(body.title), encrypt(body.description), body.start_date, body.start_time,
         body.end_date, body.end_time, body.level, eid),
    )
    con.commit()
    con.close()
    return {"success": True}


@router.delete("/api/calendar/events/{eid}")
async def delete_event(eid: int):
    _require_auth()
    con = get_connection()
    con.execute("DELETE FROM calendar_events WHERE id=?", (eid,))
    con.commit()
    con.close()
    return {"deleted": eid}


# ── Groups ─────────────────────────────────────────────────────────────────────

@router.get("/api/calendar/groups")
async def list_groups():
    _require_auth()
    con  = get_connection()
    rows = con.execute("SELECT * FROM calendar_groups ORDER BY id").fetchall()
    con.close()
    return [_decode_group(r) for r in rows]


@router.post("/api/calendar/groups")
async def create_group(body: GroupCreate):
    _require_auth()
    con = get_connection()
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO calendar_groups(name,color,created_at) VALUES(?,?,?)",
        (encrypt(body.name), body.color, ts),
    )
    con.commit()
    gid = cur.lastrowid
    con.close()
    return {"id": gid, "name": body.name, "color": body.color, "created_at": ts}


@router.put("/api/calendar/groups/{gid}")
async def update_group(gid: int, body: GroupCreate):
    _require_auth()
    con = get_connection()
    con.execute("UPDATE calendar_groups SET name=?,color=? WHERE id=?",
                (encrypt(body.name), body.color, gid))
    con.commit()
    con.close()
    return {"success": True}


@router.delete("/api/calendar/groups/{gid}")
async def delete_group(gid: int):
    _require_auth()
    con = get_connection()
    con.execute("UPDATE calendar_tasks SET group_id=NULL WHERE group_id=?", (gid,))
    con.execute("DELETE FROM calendar_groups WHERE id=?", (gid,))
    con.commit()
    con.close()
    return {"deleted": gid}


# ── Settings ───────────────────────────────────────────────────────────────────

@router.get("/api/calendar/settings")
async def get_settings():
    _require_auth()
    con      = get_connection()
    settings = _get_settings(con)
    con.close()
    return settings


@router.put("/api/calendar/settings")
async def update_settings(body: SettingsUpdate):
    _require_auth()
    con = get_connection()
    if body.context_days_before is not None:
        con.execute("INSERT OR REPLACE INTO calendar_settings(key,value) VALUES(?,?)",
                    ("context_days_before", str(int(body.context_days_before))))
    if body.context_days_ahead is not None:
        con.execute("INSERT OR REPLACE INTO calendar_settings(key,value) VALUES(?,?)",
                    ("context_days_ahead", str(int(body.context_days_ahead))))
    con.commit()
    settings = _get_settings(con)
    con.close()
    return settings
