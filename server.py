#!/usr/bin/env python3
"""
Jarvis — Dashboard Server
Reads config from config.json in the project root.
Stores all data in data/ inside the project root.
Nothing is written outside the project directory.
"""

import os, sys, sqlite3, datetime, hashlib, base64, json, asyncio, time, re
from pathlib import Path
from typing import Optional, AsyncGenerator, List
from functools import partial

import httpx, feedparser, ollama
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

# ── Resolve project root & config ─────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.resolve()
CONFIG_PATH  = PROJECT_ROOT / "config.json"

def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"ERROR: config.json not found at {CONFIG_PATH}")
        print("Run install.sh first.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)

CFG = load_config()

DATA_DIR     = PROJECT_ROOT / CFG.get("data_dir", "data")
DB_PATH      = DATA_DIR / "jarvis.db"
CHROMA_DIR   = DATA_DIR / "chroma"
SALT_PATH    = DATA_DIR / ".salt"
DASHBOARD    = PROJECT_ROOT / "dashboard.html"

MODELS       = CFG["models"]
USER_CFG     = CFG["user"]
SERVER_CFG   = CFG.get("server", {"host": "127.0.0.1", "port": 7777})

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Encryption ─────────────────────────────────────────────────────────────────
_KEY: bytes     = b""
_UNLOCKED: bool = False
_col            = None

def _load_salt() -> bytes:
    if SALT_PATH.exists():
        return bytes.fromhex(SALT_PATH.read_text().strip())
    salt = os.urandom(32)
    SALT_PATH.write_text(salt.hex())
    SALT_PATH.chmod(0o600)
    return salt

def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600_000)
    return kdf.derive(password.encode())

def enc(text: str) -> str:
    nonce = os.urandom(12)
    ct    = AESGCM(_KEY).encrypt(nonce, text.encode(), None)
    return base64.b64encode(nonce + ct).decode()

def dec(text: str) -> str:
    raw = base64.b64decode(text.encode())
    return AESGCM(_KEY).decrypt(raw[:12], raw[12:], None).decode()

def safe_dec(text: str, fallback: str = "") -> str:
    if not text:
        return fallback
    try:
        return dec(text)
    except Exception:
        return fallback or text

# ── Database ───────────────────────────────────────────────────────────────────
def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def ensure_tables(con: sqlite3.Connection):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            date    TEXT NOT NULL,
            mode    TEXT DEFAULT 'general',
            summary TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            ts         TEXT NOT NULL,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            mode       TEXT DEFAULT 'general'
        );
        CREATE TABLE IF NOT EXISTS memories (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            ts       TEXT NOT NULL,
            category TEXT NOT NULL,
            content  TEXT NOT NULL,
            tags     TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fitness (
            date     TEXT PRIMARY KEY,
            calories INTEGER,
            weight   REAL,
            workout  TEXT,
            notes    TEXT
        );
        CREATE TABLE IF NOT EXISTS facts (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ts      TEXT NOT NULL,
            topic   TEXT NOT NULL,
            content TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            description TEXT DEFAULT '',
            done        INTEGER DEFAULT 0
        );
    """)
    con.execute("PRAGMA journal_mode=WAL")
    con.commit()

# ── ChromaDB ───────────────────────────────────────────────────────────────────
def init_chroma():
    global _col
    try:
        import chromadb
        from chromadb.utils import embedding_functions
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        ef = embedding_functions.OllamaEmbeddingFunction(
            url="http://localhost:11434/api/embeddings",
            model_name=MODELS["embed"],
        )
        _col = client.get_or_create_collection("jarvis_memory", embedding_function=ef)
    except Exception as e:
        print(f"ChromaDB init failed (non-fatal, will use SQL-only search): {e}")
        _col = None

def store_memory(con: sqlite3.Connection, category: str, content: str, tags: str = ""):
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute(
        "INSERT INTO memories(ts,category,content,tags) VALUES(?,?,?,?)",
        (ts, category, enc(content), tags)
    )
    con.commit()
    row_id = cur.lastrowid
    if _col:
        try:
            _col.add(documents=[content], metadatas=[{"category": category, "ts": ts}], ids=[str(row_id)])
            _col.update(ids=[str(row_id)], documents=[str(row_id)])
        except Exception:
            pass
    return row_id

def recall_memories(con: sqlite3.Connection, query: str, n: int = 6) -> list[str]:
    if not _col:
        return []
    try:
        results = _col.query(query_texts=[query], n_results=min(n, 10))
        ids = results["ids"][0] if results["ids"] else []
        if not ids:
            return []
        valid_ids = [int(i) for i in ids if i.isdigit()]
        if not valid_ids:
            return []
        placeholders = ",".join("?" * len(valid_ids))
        rows = con.execute(
            f"SELECT content FROM memories WHERE id IN ({placeholders})", valid_ids
        ).fetchall()
        return [safe_dec(r["content"]) for r in rows if safe_dec(r["content"])]
    except Exception:
        return []

# ── Mode detection ─────────────────────────────────────────────────────────────
MODE_TRIGGERS = {
    "coding": [
        "code","coding","program","debug","function","script","python","c","c++","cpp",
        "javascript","typescript","algorithm","compile","bug","implement","error","segfault",
        "pointer","memory leak","makefile","gcc","clang","cmake","gdb","valgrind","linker",
        "assembly","register","interrupt","gpio","uart","spi","i2c","bare metal","pico",
        "raspberry","embedded","firmware","microcontroller","html","css","react","flask",
        "fastapi","sql schema","database schema","dockerfile","shell script",
    ],
    "study": [
        "study","studying","learn","course","exam","lecture","explain","concept","assignment",
        "homework","quiz","understand","revision","operating system","scheduler","deadlock",
        "semaphore","mutex","virtual memory","page table","tlb","file system","process",
        "thread","context switch","cache","pipeline","digital systems","fpga","compilers",
        "parser","lexer","networks","tcp","udp","ip","socket","quantum","relativity","photon",
        "electron","momentum","thermodynamics","calculus","linear algebra","differential",
        "probability","fourier","laplace","physics","math","theorem","derive","proof",
    ],
}

def detect_mode(text: str, current: str = "general") -> str:
    lower = text.lower()
    for mode, kws in MODE_TRIGGERS.items():
        if any(kw in lower for kw in kws):
            return mode
    return current

# ── Prompt building ─────────────────────────────────────────────────────────────
def build_system_prompt(mode: str, memories: list[str], search_ctx: str,
                        upcoming_reminders: list[dict], user: dict) -> str:
    now     = datetime.datetime.now()
    weekday = now.strftime("%A")
    date_str = now.strftime("%B %d, %Y")
    time_str = now.strftime("%H:%M")

    name  = user.get("name", "User")
    brief = user.get("brief", "")

    # Ground truth block — injected into every prompt
    ground_truth = f"""[SYSTEM CONTEXT — DO NOT CONTRADICT THIS]
Current date and time: {weekday}, {date_str} at {time_str}
User name: {name}
"""
    if brief:
        ground_truth += f"About the user: {brief}\n"

    if upcoming_reminders:
        ground_truth += "\nUpcoming events and reminders the user has set:\n"
        for r in upcoming_reminders[:5]:
            ground_truth += f"  • {r['due_date']}: {r['title']}\n"

    ground_truth += """
[ANTI-HALLUCINATION RULES — STRICTLY FOLLOW]
1. Never invent personal facts about the user that are not in the brief above.
2. If asked about the user's schedule, workout, meals, or habits not mentioned in the brief: say you don't have that info, ask the user.
3. Only reference upcoming events if they appear in the reminder list above.
4. Never guess or fabricate dates, statistics, or current events.
5. If uncertain about something factual, say so explicitly.
"""

    mem_block = ""
    if memories:
        mem_block = "\n[MEMORY — relevant past context, use naturally]\n"
        mem_block += "\n".join(f"• {m[:280]}" for m in memories)

    web_block = f"\n\n{search_ctx}" if search_ctx else ""

    mode_prompts = {
        "general": f"""You are Jarvis, a personal AI assistant.
Be direct, natural, and genuinely helpful — like a knowledgeable friend.
Do not use hollow phrases like "Certainly!" or "Great question!".
For topics outside what you know about the user, give factual information only — do not guess at their personal situation.""",

        "coding": f"""You are Jarvis in CODING mode — an expert systems programmer.
Write correct, well-commented code. State assumptions explicitly.
For systems/embedded code: consider register widths, volatile, alignment, ISR constraints, undefined behaviour.
For high-level code: clean architecture, proper error handling, type safety.
If the user's approach has a significantly better alternative, mention it briefly before answering.
Do not fabricate library APIs or function signatures you are not certain about — say you need to check.""",

        "study": f"""You are Jarvis in STUDY mode — a patient, thorough technical tutor.
Explain from first principles. Build up complexity step by step.
Use concrete analogies and worked examples. Show derivations for math and physics.
Spot cross-domain connections when relevant.
Offer to quiz or test understanding after explanations.
If you are not certain about a specific detail, say so rather than inventing it.""",
    }

    return ground_truth + "\n" + mode_prompts.get(mode, mode_prompts["general"]) + mem_block + web_block

# ── Web search ─────────────────────────────────────────────────────────────────
def web_search(query: str, n: int = 4) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return [
                {"title": r.get("title",""), "url": r.get("href",""), "body": r.get("body","")[:400]}
                for r in ddgs.text(query, max_results=n)
            ]
    except Exception as e:
        return [{"title": "Search error", "url": "", "body": str(e)}]

def should_search(text: str) -> bool:
    triggers = [
        "search for","look up","latest","current news","recent","who won","what happened",
        "find me","how to install","what version","changelog","today's price","is there a",
    ]
    return any(t in text.lower() for t in triggers)

def fmt_search(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["[WEB SEARCH — temporary context, not stored, cite URLs]"]
    for r in results:
        lines.append(f"\n• {r['title']}")
        if r["url"]:  lines.append(f"  {r['url']}")
        if r["body"]: lines.append(f"  {r['body']}")
    return "\n".join(lines)

# ── Pydantic models ─────────────────────────────────────────────────────────────
class UnlockRequest(BaseModel):
    password: str

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None
    mode: Optional[str] = "general"

class ReminderIn(BaseModel):
    title: str
    due_date: str
    description: str = ""

class FitnessIn(BaseModel):
    date: str
    calories: Optional[int] = None
    weight: Optional[float] = None
    workout: str = ""
    notes: str = ""

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    brief: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None

class NewsSourcesUpdate(BaseModel):
    sources: list

class PullRequest(BaseModel):
    name: str

# ── FastAPI app ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Jarvis", docs_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def req_auth():
    if not _UNLOCKED:
        raise HTTPException(401, "Not authenticated")

# ── Auth ───────────────────────────────────────────────────────────────────────
@app.get("/api/status")
async def status():
    return {"unlocked": _UNLOCKED, "user": CFG["user"].get("name", "User")}

@app.post("/api/unlock")
async def unlock(body: UnlockRequest):
    global _KEY, _UNLOCKED, CFG
    salt = _load_salt()
    key  = _derive_key(body.password, salt)
    if DB_PATH.exists():
        try:
            con = sqlite3.connect(DB_PATH)
            con.row_factory = sqlite3.Row
            row = con.execute("SELECT content FROM memories ORDER BY id LIMIT 1").fetchone()
            con.close()
            if row:
                raw = base64.b64decode(row["content"].encode())
                AESGCM(key).decrypt(raw[:12], raw[12:], None)
        except Exception:
            raise HTTPException(401, "Wrong password")
    _KEY      = key
    _UNLOCKED = True
    CFG       = load_config()
    init_chroma()
    con = db()
    ensure_tables(con)
    con.close()
    return {"success": True, "user": CFG["user"].get("name", "User")}

@app.post("/api/lock")
async def lock_session():
    global _KEY, _UNLOCKED
    _KEY = b""; _UNLOCKED = False
    return {"success": True}

# ── Profile ─────────────────────────────────────────────────────────────────────
@app.get("/api/profile")
async def get_profile():
    cfg = load_config()
    return cfg["user"]

@app.put("/api/profile")
async def update_profile(body: ProfileUpdate):
    req_auth()
    cfg = load_config()
    u   = cfg["user"]
    if body.name     is not None: u["name"]     = body.name
    if body.brief    is not None: u["brief"]    = body.brief
    if body.city     is not None: u["city"]     = body.city
    if body.timezone is not None: u["timezone"] = body.timezone
    cfg["user"] = u
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    global CFG
    CFG = cfg
    return {"success": True, "user": u}

# ── News config ─────────────────────────────────────────────────────────────────
@app.get("/api/news-sources")
async def get_news_sources():
    cfg = load_config()
    return cfg.get("news", {}).get("sources", [])

@app.put("/api/news-sources")
async def update_news_sources(body: NewsSourcesUpdate):
    req_auth()
    cfg = load_config()
    cfg.setdefault("news", {})["sources"] = body.sources
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    global CFG
    CFG = cfg
    return {"success": True}

# ── Dashboard summary ──────────────────────────────────────────────────────────
@app.get("/api/dashboard")
async def dashboard_data():
    req_auth()
    con   = db()
    today = datetime.date.today()
    hour  = datetime.datetime.now().hour
    period = "night" if hour<5 else "morning" if hour<12 else "afternoon" if hour<17 else "evening"
    yest  = (today - datetime.timedelta(days=1)).isoformat()

    fit_y = con.execute("SELECT * FROM fitness WHERE date=?", (yest,)).fetchone()
    fit_t = con.execute("SELECT * FROM fitness WHERE date=?", (today.isoformat(),)).fetchone()

    reminders = con.execute("""
        SELECT * FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 8
    """, (today.isoformat(),)).fetchall()

    journal = con.execute(
        "SELECT ts, content FROM facts ORDER BY id DESC LIMIT 5"
    ).fetchall()

    total_sess = con.execute("SELECT COUNT(*) AS c FROM sessions").fetchone()["c"]
    con.close()

    user = load_config()["user"]
    name = user.get("name", "User")

    def dec_fit(row):
        if not row: return None
        d = dict(row)
        for k in ("workout","notes"):
            if d.get(k): d[k] = safe_dec(d[k])
        return d

    return {
        "greeting":   f"Good {period}, {name}",
        "weekday":    today.strftime("%A"),
        "date":       today.strftime("%B %d, %Y"),
        "user_name":  name,
        "fitness": {
            "yesterday": dec_fit(fit_y),
            "today":     dec_fit(fit_t),
        },
        "reminders": [
            {**dict(r), "title": safe_dec(r["title"]), "description": safe_dec(r["description"])}
            for r in reminders
        ],
        "recent_journal": [
            {"ts": r["ts"][:10], "content": safe_dec(r["content"])[:180]}
            for r in journal
        ],
        "total_sessions": total_sess,
        "models": MODELS,
    }

# ── Weather ────────────────────────────────────────────────────────────────────
@app.get("/api/weather")
async def weather():
    city = load_config()["user"].get("city", "Amsterdam")
    async with httpx.AsyncClient(timeout=8) as client:
        try:
            r    = await client.get(f"https://wttr.in/{city.replace(' ','+')}?format=j1")
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

# ── News — with robust multi-format Bulgarian RSS support ────────────────────────
async def fetch_feed(client: httpx.AsyncClient, source: dict) -> list[dict]:
    url  = source["url"]
    name = source["name"]
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "Accept-Encoding": "gzip, deflate",
            "Accept-Language": "bg,en;q=0.9",
        }
        r = await client.get(url, headers=headers, follow_redirects=True, timeout=12)
        r.raise_for_status()
        # feedparser handles encoding detection
        feed = feedparser.parse(r.content)
        items = []
        for e in feed.entries[:10]:
            title = e.get("title", "")
            summary = e.get("summary", e.get("description", ""))
            # Strip HTML tags from summary
            summary = re.sub(r'<[^>]+>', '', summary)[:240]
            link = e.get("link", "")
            pub  = e.get("published", e.get("updated", ""))
            if title:
                items.append({"title": title, "summary": summary, "link": link, "published": pub})
        return items
    except Exception as ex:
        return [{"title": f"[{name}] Feed unavailable", "summary": str(ex), "link": "", "published": ""}]

@app.get("/api/news")
async def news():
    cfg     = load_config()
    sources = [s for s in cfg.get("news", {}).get("sources", []) if s.get("enabled", True)]
    if not sources:
        return {}
    out = {}
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        tasks = {s["id"]: fetch_feed(client, s) for s in sources}
        for sid, coro in tasks.items():
            result = await coro
            # Group by country
            country = next((s["country"] for s in sources if s["id"] == sid), "Other")
            out.setdefault(country, {})[sid] = {
                "name": next((s["name"] for s in sources if s["id"] == sid), sid),
                "items": result,
            }
    return out

# ── Conversations ──────────────────────────────────────────────────────────────
@app.get("/api/conversations")
async def list_conversations(limit: int = 60):
    req_auth()
    con  = db()
    rows = con.execute("""
        SELECT s.id, s.date, s.mode, s.summary, COUNT(m.id) AS msg_count
        FROM sessions s LEFT JOIN messages m ON m.session_id=s.id
        GROUP BY s.id ORDER BY s.id DESC LIMIT ?
    """, (limit,)).fetchall()
    con.close()
    return [{**dict(r), "summary": safe_dec(r["summary"]) or "New conversation"} for r in rows]

@app.get("/api/conversations/{sid}")
async def get_conversation(sid: int):
    req_auth()
    con  = db()
    msgs = con.execute(
        "SELECT role,content,ts,mode FROM messages WHERE session_id=? ORDER BY id", (sid,)
    ).fetchall()
    con.close()
    return [{"role": m["role"], "content": safe_dec(m["content"]), "ts": m["ts"], "mode": m["mode"]}
            for m in msgs]

@app.delete("/api/conversations/{sid}")
async def delete_conversation(sid: int):
    req_auth()
    con = db()
    con.execute("DELETE FROM messages WHERE session_id=?", (sid,))
    con.execute("DELETE FROM sessions WHERE id=?",         (sid,))
    con.commit(); con.close()
    return {"deleted": sid}

# ── CHAT — SSE streaming ────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(body: ChatRequest):
    req_auth()

    async def generate() -> AsyncGenerator[str, None]:
        con = db()
        try:
            user  = load_config()["user"]
            mode  = detect_mode(body.message, body.mode or "general")
            yield f"data: {json.dumps({'type':'mode','mode':mode})}\n\n"

            # Web search
            search_ctx = ""
            if should_search(body.message):
                yield f"data: {json.dumps({'type':'status','text':'Searching the web…'})}\n\n"
                loop    = asyncio.get_event_loop()
                results = await loop.run_in_executor(None, partial(web_search, body.message))
                search_ctx = fmt_search(results)

            # Memory recall
            memories = await asyncio.get_event_loop().run_in_executor(
                None, partial(recall_memories, con, body.message)
            )

            # Upcoming reminders for grounding
            today = datetime.date.today().isoformat()
            rem_rows = con.execute(
                "SELECT title, due_date FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 5",
                (today,)
            ).fetchall()
            upcoming = [{"title": safe_dec(r["title"]), "due_date": r["due_date"]} for r in rem_rows]

            # Build messages
            system = build_system_prompt(mode, memories, search_ctx, upcoming, user)
            messages = [{"role": "system", "content": system}]

            # Session history
            if body.session_id:
                hist = con.execute(
                    "SELECT role,content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 14",
                    (body.session_id,)
                ).fetchall()
                messages.extend([
                    {"role": r["role"], "content": safe_dec(r["content"])}
                    for r in reversed(hist)
                ])

            messages.append({"role": "user", "content": body.message})

            # Stream
            full = ""
            for chunk in ollama.chat(model=MODELS[mode], messages=messages, stream=True):
                delta = chunk["message"]["content"]
                full += delta
                yield f"data: {json.dumps({'type':'delta','delta':delta})}\n\n"
                await asyncio.sleep(0)

            # Persist
            sid = body.session_id
            if not sid:
                cur = con.execute(
                    "INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)",
                    (datetime.date.today().isoformat(), mode, enc(body.message[:80]))
                )
                con.commit()
                sid = cur.lastrowid

            ts = datetime.datetime.now().isoformat()
            con.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                        (sid, ts, "user",      enc(body.message), mode))
            con.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                        (sid, ts, "assistant", enc(full),         mode))
            row = con.execute("SELECT summary FROM sessions WHERE id=?", (sid,)).fetchone()
            if row and not row["summary"]:
                con.execute("UPDATE sessions SET summary=?,mode=? WHERE id=?",
                            (enc(body.message[:80]), mode, sid))
            con.commit()

            store_memory(con, "conversation",
                f"[{mode}][{datetime.date.today()}] User: {body.message[:300]} Assistant: {full[:400]}",
                tags=mode)

            yield f"data: {json.dumps({'type':'done','session_id':sid,'mode':mode})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"
        finally:
            con.close()

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

# ── Memories ────────────────────────────────────────────────────────────────────
@app.get("/api/memories")
async def list_memories(q: str = "", category: str = "", limit: int = 60):
    req_auth()
    con = db()
    rows = con.execute("SELECT * FROM memories ORDER BY id DESC LIMIT ?", (limit*5,)).fetchall()
    result = []
    for r in rows:
        d = safe_dec(r["content"])
        if q and q.lower() not in d.lower():
            continue
        if category and r["category"] != category:
            continue
        result.append({**dict(r), "content": d[:300]})
        if len(result) >= limit:
            break
    con.close()
    return result

@app.delete("/api/memories/{mid}")
async def delete_memory(mid: int):
    req_auth()
    con = db()
    con.execute("DELETE FROM memories WHERE id=?", (mid,)); con.commit(); con.close()
    return {"deleted": mid}

# ── Fitness ─────────────────────────────────────────────────────────────────────
@app.get("/api/fitness")
async def get_fitness(period: str = "month"):
    req_auth()
    con    = db()
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
            "workout": safe_dec(r["workout"]) if r["workout"] else "",
            "notes":   safe_dec(r["notes"])   if r["notes"]   else "",
        }
        for r in rows
    ]

@app.post("/api/fitness")
async def log_fitness(body: FitnessIn):
    req_auth()
    con = db()
    con.execute("""
        INSERT OR REPLACE INTO fitness(date,calories,weight,workout,notes)
        VALUES(?,?,?,?,?)
    """, (
        body.date,
        body.calories,
        body.weight,
        enc(body.workout) if body.workout else None,
        enc(body.notes)   if body.notes   else None,
    ))
    con.commit()
    if body.calories or body.weight:
        parts = []
        if body.calories: parts.append(f"{body.calories} kcal")
        if body.weight:   parts.append(f"{body.weight} kg")
        if body.workout:  parts.append(f"workout: {body.workout}")
        store_memory(con, "fitness", f"Fitness {body.date}: {', '.join(parts)}", tags="fitness")
    con.close()
    return {"success": True}

# ── Reminders ───────────────────────────────────────────────────────────────────
@app.get("/api/reminders")
async def get_reminders():
    req_auth()
    con   = db()
    today = datetime.date.today().isoformat()
    rows  = con.execute(
        "SELECT * FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date", (today,)
    ).fetchall()
    con.close()
    return [
        {**dict(r), "title": safe_dec(r["title"]), "description": safe_dec(r["description"])}
        for r in rows
    ]

@app.post("/api/reminders")
async def add_reminder(body: ReminderIn):
    req_auth()
    con = db()
    cur = con.execute(
        "INSERT INTO reminders(title,due_date,description) VALUES(?,?,?)",
        (enc(body.title), body.due_date, enc(body.description))
    )
    con.commit(); rid = cur.lastrowid; con.close()
    return {"id": rid, "title": body.title, "due_date": body.due_date, "description": body.description}

@app.patch("/api/reminders/{rid}/done")
async def mark_done(rid: int):
    req_auth()
    con = db()
    con.execute("UPDATE reminders SET done=1 WHERE id=?", (rid,)); con.commit(); con.close()
    return {"done": rid}

@app.delete("/api/reminders/{rid}")
async def delete_reminder(rid: int):
    req_auth()
    con = db()
    con.execute("DELETE FROM reminders WHERE id=?", (rid,)); con.commit(); con.close()
    return {"deleted": rid}

# ── Journal ─────────────────────────────────────────────────────────────────────
@app.get("/api/journal")
async def list_journal(limit: int = 50):
    req_auth()
    con  = db()
    rows = con.execute("SELECT * FROM facts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    con.close()
    return [{**dict(r), "content": safe_dec(r["content"])} for r in rows]

@app.post("/api/journal")
async def add_journal(body: dict):
    req_auth()
    text  = body.get("content", "").strip()
    topic = body.get("topic", "journal")
    if not text:
        raise HTTPException(400, "content required")
    con = db()
    ts  = datetime.datetime.now().isoformat()
    con.execute("INSERT INTO facts(ts,topic,content) VALUES(?,?,?)", (ts, topic, enc(text)))
    con.commit()
    store_memory(con, "journal", text, tags="journal")
    con.close()
    return {"success": True}

@app.delete("/api/journal/{jid}")
async def delete_journal(jid: int):
    req_auth()
    con = db()
    con.execute("DELETE FROM facts WHERE id=?", (jid,)); con.commit(); con.close()
    return {"deleted": jid}

# ── Stats ───────────────────────────────────────────────────────────────────────
@app.get("/api/stats")
async def stats():
    req_auth()
    con = db()
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
        "totals": totals,
        "daily_usage": [dict(r) for r in daily],
        "models": MODELS,
    }

# ── Models ──────────────────────────────────────────────────────────────────────
@app.get("/api/models")
async def list_models():
    try:
        result = ollama.list()
        return {"models": [
            {"name": m["model"], "size": m.get("size",0),
             "family": m.get("details",{}).get("family","")}
            for m in result.get("models",[])
        ], "configured": MODELS}
    except Exception as e:
        return {"error": str(e), "models": [], "configured": MODELS}

@app.post("/api/models/pull")
async def pull_model(body: PullRequest):
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, partial(ollama.pull, body.name))
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/models/{name:path}")
async def delete_model(name: str):
    try:
        ollama.delete(name); return {"deleted": name}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Serve dashboard ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    if DASHBOARD.exists():
        return FileResponse(DASHBOARD)
    return HTMLResponse("<h1>dashboard.html not found in project root</h1>")

@app.on_event("startup")
async def startup():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        con = db(); ensure_tables(con); con.close()
    host = SERVER_CFG.get("host","127.0.0.1")
    port = SERVER_CFG.get("port", 7777)
    print(f"✓ Jarvis server running at http://{host}:{port}")
    print(f"  Config: {CONFIG_PATH}")
    print(f"  Data:   {DATA_DIR}")
    print(f"  Models: study={MODELS['study']}  coding={MODELS['coding']}  general={MODELS['general']}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=SERVER_CFG.get("host","127.0.0.1"),
        port=int(SERVER_CFG.get("port",7777)),
        log_level="warning",
    )
