"""
App Context Builders

Each optional app that wants to inject information into the AI system prompt
defines a function here. The function receives the database connection and
the user config dict, and returns a plain-text string (or empty string).

The chat route calls only the builders for currently-enabled apps.
Adding a new app with AI context = add one function here + register it in
CONTEXT_BUILDERS below + set context_fn in app_registry.py.
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
        label = "Today" if r["date"] == today else "Yesterday"
        parts = []
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
        name   = safe_decrypt(proj["name"])
        desc   = safe_decrypt(proj["description"])
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


def get_calendar_context(con: sqlite3.Connection, user: dict) -> str:
    """
    Tasks and events for the configured context window (days_before..today..days_ahead).
    Inlined to avoid importing from backend.routes at context-build time.
    """
    LEVEL_ORDER = {"high": 4, "mid": 3, "low": 2, "not_important": 1}

    # Read settings from DB (fall back to defaults if table empty)
    rows        = con.execute("SELECT key, value FROM calendar_settings").fetchall()
    cfg         = {"context_days_before": 7, "context_days_ahead": 30}
    for r in rows:
        cfg[r["key"]] = int(r["value"])
    days_before = cfg.get("context_days_before", 7)
    days_ahead  = cfg.get("context_days_ahead",  30)

    today     = datetime.date.today()
    today_iso = today.isoformat()
    start     = (today - datetime.timedelta(days=days_before)).isoformat()
    end       = (today + datetime.timedelta(days=days_ahead)).isoformat()

    tasks = con.execute(
        "SELECT * FROM calendar_tasks WHERE date>=? AND date<=? ORDER BY date, start_time",
        (start, end),
    ).fetchall()
    events = con.execute(
        "SELECT * FROM calendar_events WHERE start_date>=? AND start_date<=? ORDER BY start_date, start_time",
        (start, end),
    ).fetchall()
    groups = {
        r["id"]: safe_decrypt(r["name"])
        for r in con.execute("SELECT id, name FROM calendar_groups").fetchall()
    }

    if not tasks and not events:
        return ""

    lines = [f"[CALENDAR — {start} to {end}  |  {days_before} days back, {days_ahead} days ahead]"]

    # Overdue undone tasks
    overdue = [t for t in tasks if t["date"] < today_iso and not t["done"]]
    if overdue:
        lines.append("OVERDUE (not done):")
        for t in sorted(overdue, key=lambda x: LEVEL_ORDER.get(x["level"], 0), reverse=True):
            lines.append(f"  • [{t['level'].upper()}] {safe_decrypt(t['title'])} — {t['date']}")

    # All tasks from today onward
    upcoming = [t for t in tasks if t["date"] >= today_iso]
    if upcoming:
        lines.append("TASKS (today and upcoming):")
        for t in upcoming:
            status = "✓ done" if t["done"] else "not done"
            group  = f" [{groups[t['group_id']]}]" if t.get("group_id") and t["group_id"] in groups else ""
            time   = f" {t['start_time']}" if t.get("start_time") else ""
            lines.append(f"  • [{t['level'].upper()}]{time} {safe_decrypt(t['title'])} — {t['date']} — {status}{group}")

    # Past tasks (for reference, show done status)
    past = [t for t in tasks if t["date"] < today_iso and t["done"]]
    if past:
        lines.append("RECENTLY COMPLETED:")
        for t in past[-5:]:  # last 5 only
            lines.append(f"  • {safe_decrypt(t['title'])} — {t['date']}")

    # Events
    if events:
        lines.append("EVENTS:")
        for e in events:
            start_t = f" {e['start_time']}" if e.get("start_time") else ""
            end_t   = f"–{e['end_time']}" if e.get("end_time") else ""
            cross   = f" (ends {e['end_date']})" if e.get("end_date") and e["end_date"] != e["start_date"] else ""
            lines.append(f"  • [{e['level'].upper()}]{start_t}{end_t} {safe_decrypt(e['title'])} — {e['start_date']}{cross}")

    return "\n".join(lines)


# ── Dispatcher ────────────────────────────────────────────────────────────────
# Maps context_fn name → function. All functions must be defined above this.

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
