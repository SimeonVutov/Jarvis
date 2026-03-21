"""
App Context Builders

Each optional app that wants to inject information into the AI system prompt
defines a function here. The function receives the database connection and
the user config dict, and returns a plain-text string (or empty string).

The chat route calls only the builders for currently-enabled apps.
Adding a new app with AI context = add one function here + reference it
in the AppDescriptor.context_fn field in app_registry.py.
"""

import datetime
import sqlite3
from backend.crypto import safe_decrypt


def get_fitness_context(con: sqlite3.Connection, user: dict) -> str:
    """Today's and yesterday's fitness data."""
    today = datetime.date.today().isoformat()
    yest  = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    rows = con.execute(
        "SELECT date, calories, weight, workout FROM fitness WHERE date IN (?, ?) ORDER BY date DESC",
        (today, yest),
    ).fetchall()

    if not rows:
        return ""

    lines = ["[FITNESS]"]
    for r in rows:
        label   = "Today" if r["date"] == today else "Yesterday"
        parts   = []
        if r["calories"]: parts.append(f"{r['calories']} kcal")
        if r["weight"]:   parts.append(f"{r['weight']} kg")
        if r["workout"]:  parts.append(f"workout: {safe_decrypt(r['workout'])}")
        if parts:
            lines.append(f"  {label}: {', '.join(parts)}")

    return "\n".join(lines) if len(lines) > 1 else ""


def get_reminders_context(con: sqlite3.Connection, user: dict) -> str:
    """Upcoming reminders — prevents the AI from hallucinating future events."""
    today = datetime.date.today().isoformat()
    rows  = con.execute(
        "SELECT title, due_date FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 8",
        (today,),
    ).fetchall()

    if not rows:
        return ""

    lines = ["[REMINDERS — do not reference events not in this list]"]
    for r in rows:
        lines.append(f"  • {r['due_date']}: {safe_decrypt(r['title'])}")
    return "\n".join(lines)


def get_projects_context(con: sqlite3.Connection, user: dict) -> str:
    """All project names and the content of their text files."""
    proj_rows = con.execute("SELECT id, name, description FROM projects ORDER BY id").fetchall()
    if not proj_rows:
        return ""

    sections = ["[PROJECTS — reference these when the user asks about their files]"]
    for proj in proj_rows:
        name = safe_decrypt(proj["name"])
        desc = safe_decrypt(proj["description"])
        header = f"Project: {name}"
        if desc:
            header += f" — {desc}"
        sections.append(header)

        file_rows = con.execute(
            "SELECT filename, content, is_binary FROM project_files WHERE project_id=?",
            (proj["id"],),
        ).fetchall()

        for f in file_rows:
            fname = safe_decrypt(f["filename"])
            sections.append(f"  File: {fname}")
            if not f["is_binary"]:
                content = safe_decrypt(f["content"])
                snippet = content[:3000]
                if len(content) > 3000:
                    snippet += "\n… [truncated]"
                sections.append(f"  Content:\n{snippet}")

    sections.append(
        "When the user references a project or file by name, use the content above. "
        "Quote exact lines when relevant."
    )
    return "\n".join(sections)


def get_journal_context(con: sqlite3.Connection, user: dict) -> str:
    """Most recent journal entries."""
    rows = con.execute(
        "SELECT ts, content FROM facts ORDER BY id DESC LIMIT 5"
    ).fetchall()

    if not rows:
        return ""

    lines = ["[JOURNAL — recent personal notes]"]
    for r in rows:
        date    = r["ts"][:10]
        content = safe_decrypt(r["content"])[:200]
        lines.append(f"  {date}: {content}")
    return "\n".join(lines)


# ── Dispatcher ───────────────────────────────────────────────────────────────────
# Maps context_fn name → function. Used by the chat route to call builders
# without importing each one by name.

CONTEXT_BUILDERS: dict[str, callable] = {
    "get_fitness_context":   get_fitness_context,
    "get_reminders_context": get_reminders_context,
    "get_projects_context":  get_projects_context,
    "get_journal_context":   get_journal_context,
    "get_calendar_context":  get_calendar_context,
}


def build_app_contexts(
    enabled_app_ids: set[str],
    con: sqlite3.Connection,
    user: dict,
) -> str:
    """
    Calls every enabled app's context builder and joins the results.
    Returns a single string ready to append to the system prompt.
    """
    from backend.app_registry import REGISTRY

    parts = []
    for app in REGISTRY:
        if app.core:
            continue
        if app.id not in enabled_app_ids:
            continue
        if not app.context_fn:
            continue
        fn = CONTEXT_BUILDERS.get(app.context_fn)
        if not fn:
            continue
        try:
            result = fn(con, user)
            if result:
                parts.append(result)
        except Exception:
            pass  # never let a broken app context crash the chat

    return "\n\n".join(parts)


def get_calendar_context(con: sqlite3.Connection, user: dict) -> str:
    """Tasks and events for the configured context window."""
    from backend.routes.calendar import _get_settings, _decode_task, _decode_event, LEVEL_ORDER

    settings   = _get_settings(con)
    days_before = settings.get("context_days_before", 7)
    days_ahead  = settings.get("context_days_ahead",  30)

    today = datetime.date.today()
    start = (today - datetime.timedelta(days=days_before)).isoformat()
    end   = (today + datetime.timedelta(days=days_ahead)).isoformat()

    tasks = con.execute(
        "SELECT * FROM calendar_tasks WHERE date>=? AND date<=? ORDER BY date,start_time NULLS LAST",
        (start, end),
    ).fetchall()
    events = con.execute(
        "SELECT * FROM calendar_events WHERE start_date>=? AND start_date<=? ORDER BY start_date,start_time NULLS LAST",
        (start, end),
    ).fetchall()
    groups = {
        r["id"]: safe_decrypt(r["name"])
        for r in con.execute("SELECT id,name FROM calendar_groups").fetchall()
    }

    if not tasks and not events:
        return ""

    lines = [f"[CALENDAR — tasks and events from {start} to {end}]"]
    today_iso = today.isoformat()

    # Overdue undone tasks
    overdue = [_decode_task(t) for t in tasks if t["date"] < today_iso and not t["done"]]
    if overdue:
        lines.append("OVERDUE (not done):")
        for t in sorted(overdue, key=lambda x: LEVEL_ORDER.get(x["level"], 0), reverse=True):
            lines.append(f"  • [{t['level'].upper()}] {t['title']} — {t['date']} — NOT DONE")

    # Upcoming tasks grouped by date
    upcoming_tasks = [_decode_task(t) for t in tasks if t["date"] >= today_iso]
    if upcoming_tasks:
        lines.append("UPCOMING TASKS:")
        for t in upcoming_tasks:
            status = "DONE" if t["done"] else "not done"
            group  = f" — Group: {groups[t['group_id']]}" if t.get("group_id") and t["group_id"] in groups else ""
            time   = f" at {t['start_time']}" if t.get("start_time") else ""
            lines.append(f"  • [{t['level'].upper()}] {t['title']} — {t['date']}{time} — {status}{group}")

    # Events
    if events:
        lines.append("EVENTS:")
        for e in events:
            ev     = _decode_event(e)
            start_t = f" {ev['start_time']}" if ev.get("start_time") else ""
            end_t   = f"–{ev['end_time']}" if ev.get("end_time") else ""
            lines.append(f"  • [{ev['level'].upper()}] {ev['title']} — {ev['start_date']}{start_t}{end_t}")

    return "\n".join(lines)


def get_calendar_context(con: sqlite3.Connection, user: dict) -> str:
    """
    Tasks and events for the next N days (configurable in calendar settings).
    Includes done status so the AI can answer questions like
    'how many tasks do I have left today?'
    """
    from backend.config import load_config
    cfg          = load_config()
    cal_cfg      = cfg.get("calendar", {})
    days_ahead   = int(cal_cfg.get("ai_context_days", 7))
    p_labels     = cal_cfg.get("priority_labels", {"high":"High","mid":"Medium","low":"Low"})

    today    = datetime.date.today()
    date_end = (today + datetime.timedelta(days=days_ahead)).isoformat()
    today_s  = today.isoformat()

    tasks = con.execute(
        "SELECT title, description, date, start_time, priority, group_id, done "
        "FROM calendar_tasks WHERE date >= ? AND date <= ? ORDER BY date, priority",
        (today_s, date_end),
    ).fetchall()

    events = con.execute(
        "SELECT title, date, start_time, end_time, priority "
        "FROM calendar_events WHERE date >= ? AND date <= ? ORDER BY date, start_time",
        (today_s, date_end),
    ).fetchall()

    if not tasks and not events:
        return ""

    def plabel(p):
        return p_labels.get(p, p.capitalize())

    lines = [f"[CALENDAR — next {days_ahead} days]"]

    # Group tasks by date
    task_by_date: dict = {}
    for t in tasks:
        d = t["date"]
        task_by_date.setdefault(d, []).append(t)

    for date_str, day_tasks in sorted(task_by_date.items()):
        d    = datetime.date.fromisoformat(date_str)
        diff = (d - today).days
        label = "today" if diff == 0 else "tomorrow" if diff == 1 else date_str
        lines.append(f"\nTasks — {label}:")
        done_count = sum(1 for t in day_tasks if t["done"])
        lines.append(f"  {done_count}/{len(day_tasks)} completed")
        for t in day_tasks:
            check = "✓" if t["done"] else "○"
            time  = f" {t['start_time']}" if t["start_time"] else ""
            lines.append(f"  {check} [{plabel(t['priority'])}]{time} {safe_decrypt(t['title'])}")

    # Group events by date
    event_by_date: dict = {}
    for e in events:
        event_by_date.setdefault(e["date"], []).append(e)

    for date_str, day_events in sorted(event_by_date.items()):
        d     = datetime.date.fromisoformat(date_str)
        diff  = (d - today).days
        label = "today" if diff == 0 else "tomorrow" if diff == 1 else date_str
        lines.append(f"\nEvents — {label}:")
        for e in day_events:
            overnight = " (overnight)" if e["end_time"] < e["start_time"] else ""
            lines.append(f"  [{plabel(e['priority'])}] {e['start_time']}–{e['end_time']}{overnight} {safe_decrypt(e['title'])}")

    return "\n".join(lines)


CONTEXT_BUILDERS["get_calendar_context"] = get_calendar_context
