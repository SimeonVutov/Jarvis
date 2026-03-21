import asyncio
import datetime
import ollama
from fastapi import APIRouter, HTTPException
import httpx
from backend import state
from backend.config import load_config
from backend.app_registry import REGISTRY
from backend.database import get_connection
from backend.crypto import safe_decrypt
from backend.ai import format_search_results
from backend.app_context import build_app_contexts

router = APIRouter()


def _get_enabled_app_ids(cfg: dict | None = None) -> set[str]:
    if cfg is None:
        cfg = load_config()
    stored = cfg.get("apps", {})
    enabled = set()
    for app in REGISTRY:
        if app.core or stored.get(app.id, {}).get("enabled", True):
            enabled.add(app.id)
    return enabled


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/dashboard")
async def dashboard_data():
    _require_auth()
    con   = get_connection()
    today = datetime.date.today()
    hour  = datetime.datetime.now().hour
    period = "night" if hour < 5 else "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
    yest  = (today - datetime.timedelta(days=1)).isoformat()

    fit_y = con.execute("SELECT * FROM fitness WHERE date=?", (yest,)).fetchone()
    fit_t = con.execute("SELECT * FROM fitness WHERE date=?", (today.isoformat(),)).fetchone()
    reminders = con.execute(
        "SELECT * FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 5",
        (today.isoformat(),)
    ).fetchall()
    total_sessions = con.execute("SELECT COUNT(*) AS c FROM sessions").fetchone()["c"]
    con.close()

    user = load_config()["user"]

    def decode_fitness(row):
        if not row: return None
        d = dict(row)
        for k in ("workout", "notes"):
            if d.get(k): d[k] = safe_decrypt(d[k])
        return d

    enabled_ids = _get_enabled_app_ids()
    return {
        "weekday":        today.strftime("%A"),
        "date":           today.strftime("%B %d, %Y"),
        "user_name":      user.get("name", "User"),
        "period":         period,
        "fitness":        {
            "yesterday": decode_fitness(fit_y),
            "today":     decode_fitness(fit_t),
        } if "fitness" in enabled_ids else None,
        "reminders":      [
            {**dict(r), "title": safe_decrypt(r["title"]), "description": safe_decrypt(r["description"])}
            for r in reminders
        ] if "reminders" in enabled_ids else [],
        "total_sessions": total_sessions,
        "models":         state.MODELS,
        "enabled_apps":   sorted(enabled_ids),
    }


@router.get("/api/home/greeting")
async def home_greeting():
    """Personalised greeting using ALL enabled app contexts — fitness, calendar, reminders, etc."""
    _require_auth()
    cfg    = load_config()
    user   = cfg["user"]
    name   = user.get("name", "User")
    brief  = user.get("brief", "")
    hour   = datetime.datetime.now().hour
    period = "night" if hour < 5 else "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"

    enabled_ids = _get_enabled_app_ids(cfg)

    # Build full app context in a thread (opens its own DB connection)
    loop = asyncio.get_event_loop()
    app_context = await loop.run_in_executor(
        None, lambda: build_app_contexts(enabled_ids, None, user)
    )

    context = f"User: {name}\n"
    if brief:
        context += f"About them: {brief}\n"
    if app_context:
        context += f"\n{app_context}\n"

    prompt = (
        f"{context}\n"
        f"Write a 1-2 sentence personalised good {period} message for {name}. "
        "Be specific — reference their actual tasks, fitness, events, or reminders from the context above if present. "
        "If they have tasks or events today, mention them. "
        "If they logged fitness, acknowledge it. "
        "Don't start with Hello/Hi/Hey. No hollow filler phrases. Keep it under 40 words."
    )
    try:
        text = await loop.run_in_executor(None, lambda: ollama.chat(
            model=state.MODELS.get("general", "llama3.1:8b"),
            options={"num_predict": 80},
            messages=[{"role": "user", "content": prompt}],
        )["message"]["content"].strip())
        return {"greeting": text}
    except Exception:
        return {"greeting": f"Good {period}, {name}."}


@router.get("/api/weather")
async def weather():
    city = load_config()["user"].get("city", "Amsterdam")
    async with httpx.AsyncClient(timeout=8) as client:
        try:
            r    = await client.get(f"https://wttr.in/{city.replace(' ', '+')}?format=j1")
            data = r.json()
            cur  = data["current_condition"][0]
            day  = data["weather"][0]
            return {
                "city":       city,
                "temp_c":     int(cur["temp_C"]),
                "feels_like": int(cur["FeelsLikeC"]),
                "desc":       cur["weatherDesc"][0]["value"],
                "humidity":   int(cur["humidity"]),
                "wind_kmph":  int(cur["windspeedKmph"]),
                "max_c":      int(day["maxtempC"]),
                "min_c":      int(day["mintempC"]),
                "hourly": [
                    {"time": h["time"], "temp": int(h["tempC"]), "desc": h["weatherDesc"][0]["value"]}
                    for h in day["hourly"][::2]
                ],
            }
        except Exception as e:
            return {"error": str(e), "city": city}
