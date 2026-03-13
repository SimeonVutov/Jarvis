#!/usr/bin/env python3
"""
Jarvis — Terminal Interface
Reads config.json from the project root.
Stores all data in data/ inside the project root.
"""

import os, sys, sqlite3, datetime, base64, json, getpass
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.resolve()
CONFIG_PATH  = PROJECT_ROOT / "config.json"

def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"ERROR: config.json not found at {CONFIG_PATH}")
        print("Run install.sh first.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)

CFG       = load_config()
DATA_DIR  = PROJECT_ROOT / CFG.get("data_dir", "data")
DB_PATH   = DATA_DIR / "jarvis.db"
CHROMA_DIR = DATA_DIR / "chroma"
SALT_PATH = DATA_DIR / ".salt"
MODELS    = CFG["models"]
USER_CFG  = CFG["user"]

DATA_DIR.mkdir(parents=True, exist_ok=True)

import chromadb
import ollama
from rich.console import Console
from rich.panel   import Panel
from rich.text    import Text
from prompt_toolkit import prompt as ptprompt
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.history      import InMemoryHistory
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2   import PBKDF2HMAC
from cryptography.hazmat.primitives               import hashes

console = Console()

# ── Encryption ─────────────────────────────────────────────────────────────────
_KEY: bytes = b""

def _load_salt() -> bytes:
    if SALT_PATH.exists():
        return bytes.fromhex(SALT_PATH.read_text().strip())
    salt = os.urandom(32)
    SALT_PATH.write_text(salt.hex()); SALT_PATH.chmod(0o600)
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
    try: return dec(text)
    except Exception: return fallback or text

def unlock():
    global _KEY
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    salt = _load_salt()
    if not DB_PATH.exists():
        console.print(f"\n[bold cyan]First run — set a password to encrypt your data.[/bold cyan]")
        console.print("[dim]Write it down — there is no recovery mechanism.[/dim]\n")
        pw  = getpass.getpass("  Set password: ")
        pw2 = getpass.getpass("  Confirm     : ")
        if pw != pw2:
            console.print("[red]Passwords don't match.[/red]"); sys.exit(1)
        _KEY = _derive_key(pw, salt)
    else:
        pw   = getpass.getpass("  Password: ")
        _KEY = _derive_key(pw, salt)
        con  = sqlite3.connect(DB_PATH)
        row  = con.execute("SELECT content FROM memories ORDER BY id LIMIT 1").fetchone()
        con.close()
        if row:
            try: dec(row[0])
            except Exception:
                console.print("[red]Wrong password.[/red]"); sys.exit(1)

# ── Database ───────────────────────────────────────────────────────────────────
def init_db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript("""
        CREATE TABLE IF NOT EXISTS sessions  (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, mode TEXT DEFAULT 'general', summary TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS messages  (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, ts TEXT, role TEXT, content TEXT, mode TEXT DEFAULT 'general');
        CREATE TABLE IF NOT EXISTS memories  (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, category TEXT, content TEXT, tags TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS fitness   (date TEXT PRIMARY KEY, calories INTEGER, weight REAL, workout TEXT, notes TEXT);
        CREATE TABLE IF NOT EXISTS facts     (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, topic TEXT, content TEXT);
        CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, due_date TEXT, description TEXT DEFAULT '', done INTEGER DEFAULT 0);
        PRAGMA journal_mode=WAL;
    """)
    con.commit(); return con

# ── ChromaDB ───────────────────────────────────────────────────────────────────
def init_chroma():
    try:
        from chromadb.utils import embedding_functions
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        ef = embedding_functions.OllamaEmbeddingFunction(
            url="http://localhost:11434/api/embeddings",
            model_name=MODELS["embed"],
        )
        return client.get_or_create_collection("jarvis_memory", embedding_function=ef)
    except Exception as e:
        console.print(f"[dim]ChromaDB init failed (falling back to SQL search): {e}[/dim]")
        return None

def store_memory(con, col, category, content, tags=""):
    ts  = datetime.datetime.now().isoformat()
    cur = con.execute("INSERT INTO memories(ts,category,content,tags) VALUES(?,?,?,?)",
                      (ts, category, enc(content), tags))
    con.commit()
    if col:
        try:
            col.add(documents=[content], metadatas=[{"category":category}], ids=[str(cur.lastrowid)])
            col.update(ids=[str(cur.lastrowid)], documents=[str(cur.lastrowid)])
        except Exception: pass
    return cur.lastrowid

def recall(con, col, query, n=6):
    if not col: return []
    try:
        res  = col.query(query_texts=[query], n_results=n)
        ids  = res["ids"][0] if res["ids"] else []
        vids = [int(i) for i in ids if i.isdigit()]
        if not vids: return []
        ph   = ",".join("?"*len(vids))
        rows = con.execute(f"SELECT content FROM memories WHERE id IN ({ph})", vids).fetchall()
        return [safe_dec(r[0]) for r in rows if safe_dec(r[0])]
    except Exception: return []

# ── Mode detection ─────────────────────────────────────────────────────────────
MODE_TRIGGERS = {
    "coding": ["code","debug","function","script","python","c","c++","cpp","javascript",
               "algorithm","compile","bug","implement","pointer","makefile","gcc","gdb",
               "embedded","firmware","bare metal","pico","raspberry","gpio","html","react"],
    "study":  ["study","exam","lecture","explain","concept","understand","os","scheduler",
               "virtual memory","page table","compiler","parser","network","tcp","physics",
               "quantum","math","calculus","linear algebra","theorem","derive","proof"],
}

def detect_mode(text, current="general"):
    lower = text.lower()
    for mode, kws in MODE_TRIGGERS.items():
        if any(kw in lower for kw in kws):
            return mode
    return current

# ── Prompt ─────────────────────────────────────────────────────────────────────
def build_prompt(mode, memories, user, upcoming_reminders):
    now    = datetime.datetime.now()
    name   = user.get("name", "User")
    brief  = user.get("brief", "")

    ground = f"""[SYSTEM CONTEXT]
Current date/time: {now.strftime('%A, %B %d, %Y at %H:%M')}
User: {name}
"""
    if brief:
        ground += f"About the user: {brief}\n"
    if upcoming_reminders:
        ground += "\nUpcoming events:\n" + "".join(f"  • {r[1]}: {safe_dec(r[0])}\n" for r in upcoming_reminders)

    ground += """
[RULES]
- Never invent personal facts about the user not stated above.
- If asked about habits, schedule, or personal details not in the brief: ask the user.
- Never fabricate upcoming events — only use the list above.
- If uncertain about a fact, say so.
"""
    mode_text = {
        "general": "Be direct, natural, and helpful. Answer only what you know.",
        "coding":  "Expert systems programmer. Write correct, well-commented code. State all assumptions. Don't fabricate APIs.",
        "study":   "Patient technical tutor. Explain from first principles. Show derivations. If uncertain about a detail, say so.",
    }

    mem = ""
    if memories:
        mem = "\n[MEMORY — relevant context]\n" + "\n".join(f"• {m[:260]}" for m in memories)

    return f"You are Jarvis, {name}'s personal AI assistant.\n{ground}\n{mode_text.get(mode,'')}{mem}"

# ── Greeting ───────────────────────────────────────────────────────────────────
def build_greeting(con, user):
    hour   = datetime.datetime.now().hour
    period = "night" if hour<5 else "morning" if hour<12 else "afternoon" if hour<17 else "evening"
    name   = user.get("name", "User")
    parts  = [f"Good {period}, {name}."]
    yest   = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    fit    = con.execute("SELECT calories, workout FROM fitness WHERE date=?", (yest,)).fetchone()
    if fit:
        cal = f"{fit[0]} kcal" if fit[0] else "calories not logged"
        wrk = f", workout: {safe_dec(fit[1])}" if fit[1] else ""
        parts.append(f"Yesterday: {cal}{wrk}.")
    today = datetime.date.today().isoformat()
    soon  = con.execute("""
        SELECT title, due_date FROM reminders WHERE done=0
        AND due_date>=? AND due_date<=date(?,'+'||3||' days') ORDER BY due_date LIMIT 3
    """, (today, today)).fetchall()
    for r in soon:
        d    = (datetime.date.fromisoformat(r[1]) - datetime.date.today()).days
        when = "today" if d==0 else "tomorrow" if d==1 else f"in {d} days"
        parts.append(f"Reminder {when}: {safe_dec(r[0])}.")
    parts.append("What are we doing today?")
    return " ".join(parts)

# ── Commands ───────────────────────────────────────────────────────────────────
HELP = """
[bold cyan]/journal <text>[/bold cyan]            Save a note — encrypted, recalled by AI later
[bold cyan]/fitness <cal> [weight] [workout][/bold cyan]  Log fitness  e.g. /fitness 2100 75.5 chest
[bold cyan]/recall <topic>[/bold cyan]             Semantic memory search
[bold cyan]/reminders[/bold cyan]                  Show upcoming reminders
[bold cyan]/remind <title> | <YYYY-MM-DD>[/bold cyan]  Add reminder
[bold cyan]/search <query>[/bold cyan]             Manual web search (not stored)
[bold cyan]/session[/bold cyan]                    List recent sessions
[bold cyan]/session <id>[/bold cyan]               Continue a past session
[bold cyan]/mode <study|coding|general>[/bold cyan] Force mode
[bold cyan]/profile[/bold cyan]                    Show current profile
[bold cyan]/dashboard[/bold cyan]                  Open dashboard in browser
[bold cyan]/quit[/bold cyan]                       Exit
"""

def web_search(query, n=4):
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return [{"title":r.get("title",""),"url":r.get("href",""),"body":r.get("body","")[:400]}
                    for r in ddgs.text(query, max_results=n)]
    except Exception as e:
        return [{"title":"Search error","url":"","body":str(e)}]

def handle_command(raw, con, col, mode, session_id, user):
    parts = raw.strip().split(" ", 1)
    verb  = parts[0].lower()
    rest  = parts[1].strip() if len(parts)>1 else ""

    if verb == "help":
        console.print(Panel(HELP, title="Commands", border_style="cyan", padding=(1,2)))

    elif verb == "journal":
        if rest:
            store_memory(con, col, "journal", rest, tags="journal")
            con.execute("INSERT INTO facts(ts,topic,content) VALUES(?,?,?)",
                        (datetime.datetime.now().isoformat(), "journal", enc(rest)))
            con.commit(); console.print(f"[green]✓ Saved[/green]")
        else:
            console.print("[yellow]Usage: /journal <text>[/yellow]")

    elif verb == "fitness":
        tokens  = rest.split()
        cal     = int(tokens[0])   if tokens and tokens[0].isdigit() else None
        weight  = float(tokens[1]) if len(tokens)>1 and tokens[1].replace(".","").isdigit() else None
        workout = " ".join(tokens[2:]) if len(tokens)>2 else None
        today   = datetime.date.today().isoformat()
        con.execute("INSERT OR REPLACE INTO fitness(date,calories,weight,workout) VALUES(?,?,?,?)",
                    (today, cal, weight, enc(workout) if workout else None))
        con.commit()
        parts_log = []
        if cal:    parts_log.append(f"{cal} kcal")
        if weight: parts_log.append(f"{weight} kg")
        if workout: parts_log.append(f"workout: {workout}")
        if parts_log:
            store_memory(con, col, "fitness", f"Fitness {today}: {', '.join(parts_log)}", tags="fitness")
        console.print(f"[green]✓ Logged:[/green] {', '.join(parts_log) or 'nothing'}")

    elif verb == "recall":
        results = recall(con, col, rest or "recent", n=8)
        if results:
            text = "\n".join(f"[dim]•[/dim] {r[:200]}" for r in results)
            console.print(Panel(text, title=f'Memory: "{rest}"', border_style="cyan"))
        else:
            console.print("[yellow]Nothing found.[/yellow]")

    elif verb == "reminders":
        today = datetime.date.today().isoformat()
        rows  = con.execute(
            "SELECT id,title,due_date FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 10",
            (today,)
        ).fetchall()
        if rows:
            lines = []
            for r in rows:
                d    = (datetime.date.fromisoformat(r[2]) - datetime.date.today()).days
                when = "TODAY" if d==0 else "tomorrow" if d==1 else f"in {d}d"
                lines.append(f"[dim]{r[2]}[/dim]  [{when}]  {safe_dec(r[1])}")
            console.print(Panel("\n".join(lines), title="Reminders", border_style="yellow"))
        else:
            console.print("[yellow]No upcoming reminders.[/yellow]")

    elif verb == "remind":
        if "|" in rest:
            title, date_str = rest.split("|",1)
            con.execute("INSERT INTO reminders(title,due_date) VALUES(?,?)",
                        (enc(title.strip()), date_str.strip()))
            con.commit(); console.print(f"[green]✓ Reminder added:[/green] {title.strip()}")
        else:
            console.print("[yellow]Usage: /remind <title> | <YYYY-MM-DD>[/yellow]")

    elif verb == "search":
        if rest:
            console.print(f"[dim]Searching: {rest}…[/dim]")
            for r in web_search(rest, 5):
                console.print(f"\n[bold cyan]{r['title']}[/bold cyan]")
                if r["url"]: console.print(f"[dim]{r['url']}[/dim]")
                console.print(r["body"])
        else:
            console.print("[yellow]Usage: /search <query>[/yellow]")

    elif verb == "session":
        if rest.isdigit():
            sid = int(rest)
            cnt = con.execute("SELECT COUNT(*) FROM messages WHERE session_id=?", (sid,)).fetchone()[0]
            if cnt:
                console.print(f"[cyan]Session {sid} loaded — {cnt} messages.[/cyan]")
                return mode, sid
            else:
                console.print(f"[yellow]Session {sid} not found.[/yellow]")
        else:
            rows = con.execute(
                "SELECT id,date,summary,mode FROM sessions ORDER BY id DESC LIMIT 15"
            ).fetchall()
            if rows:
                lines = "\n".join(
                    f"[bold]{r[0]}[/bold]  {r[1]}  [{r[3]or'general'}]  {safe_dec(r[2])[:70] if r[2] else '—'}"
                    for r in rows
                )
                console.print(Panel(lines, title="Sessions — /session <id> to continue", border_style="cyan"))
            else:
                console.print("[yellow]No sessions yet.[/yellow]")

    elif verb == "mode":
        if rest in MODELS:
            console.print(f"[cyan]→ {rest.upper()} ({MODELS[rest]})[/cyan]")
            return rest, session_id
        console.print(f"[yellow]Modes: {', '.join(MODELS.keys())}[/yellow]")

    elif verb == "profile":
        u = load_config()["user"]
        console.print(Panel(
            f"[bold]Name:[/bold]     {u.get('name','')}\n"
            f"[bold]City:[/bold]     {u.get('city','')}\n"
            f"[bold]Timezone:[/bold] {u.get('timezone','')}\n\n"
            f"[bold]Brief:[/bold]\n{u.get('brief','')}",
            title="Your Profile", border_style="cyan"
        ))

    elif verb == "dashboard":
        import subprocess; subprocess.Popen(["xdg-open", "http://localhost:7777"])
        console.print("[dim]Opening dashboard…[/dim]")

    elif verb == "clear":
        os.system("clear")

    elif verb in ("quit","exit","bye"):
        name = load_config()["user"].get("name","User")
        console.print(f"\n[dim]  Goodbye, {name}.[/dim]\n"); sys.exit(0)

    else:
        console.print(f"[yellow]Unknown command /{verb}. Type /help.[/yellow]")

    return mode, session_id

# ── Stream response ─────────────────────────────────────────────────────────────
def stream_response(messages, model):
    console.print()
    console.print(Text("  Jarvis", style="bold cyan"), end="  ")
    full = ""
    try:
        for chunk in ollama.chat(model=model, messages=messages, stream=True):
            delta = chunk["message"]["content"]
            full += delta
            console.print(delta, end="", markup=False)
    except Exception as e:
        console.print(f"[red]\n  Error: {e}[/red]")
        console.print(f"  [dim]Is Ollama running? sudo systemctl status ollama[/dim]")
    console.print()
    return full

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    os.system("clear")
    console.print(Panel(
        "[bold cyan]JARVIS[/bold cyan]  [dim]Personal AI Assistant[/dim]",
        border_style="cyan", padding=(0,4)
    ))

    unlock()

    con  = init_db()
    col  = init_chroma()
    user = load_config()["user"]
    name = user.get("name","User")

    today = datetime.date.today().isoformat()
    cur   = con.execute("INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)", (today,"general",""))
    con.commit(); session_id = cur.lastrowid

    mode    = "general"
    history = []

    os.system("clear")
    console.print(Panel(
        f"[bold cyan]JARVIS[/bold cyan]  [dim]Session #{session_id} · {MODELS['general']}[/dim]\n"
        f"[dim]study={MODELS['study']}  coding={MODELS['coding']}  general={MODELS['general']}[/dim]",
        border_style="cyan", padding=(0,4)
    ))
    console.print(f"\n[bold cyan]  Jarvis[/bold cyan]  {build_greeting(con, user)}\n")

    in_mem = InMemoryHistory()
    MODE_COLOUR = {"general":"green","coding":"yellow","study":"blue"}

    while True:
        try:
            c = MODE_COLOUR[mode]
            console.print(f"\n  [{c}]{mode}[/{c}] [bold]{name}[/bold] › ", end="")
            user_input = ptprompt("", history=in_mem, auto_suggest=AutoSuggestFromHistory()).strip()
        except (KeyboardInterrupt, EOFError):
            console.print(f"\n[dim]  Goodbye, {name}.[/dim]\n"); break

        if not user_input: continue

        if user_input.startswith("/"):
            mode, session_id = handle_command(user_input[1:], con, col, mode, session_id, user)
            continue

        new_mode = detect_mode(user_input, mode)
        if new_mode != mode:
            mode = new_mode
            con.execute("UPDATE sessions SET mode=? WHERE id=?", (mode, session_id)); con.commit()
            console.print(f"  [dim]→ {mode.upper()} ({MODELS[mode]})[/dim]")

        memories = recall(con, col, user_input, n=6)

        today_str = datetime.date.today().isoformat()
        upcoming  = con.execute(
            "SELECT title, due_date FROM reminders WHERE done=0 AND due_date>=? ORDER BY due_date LIMIT 5",
            (today_str,)
        ).fetchall()

        system = build_prompt(mode, memories, user, upcoming)
        msgs   = [{"role":"system","content":system}]
        msgs.extend(history[-14:])
        msgs.append({"role":"user","content":user_input})

        response = stream_response(msgs, MODELS[mode])

        history.append({"role":"user",      "content":user_input})
        history.append({"role":"assistant", "content":response})

        ts = datetime.datetime.now().isoformat()
        con.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                    (session_id, ts, "user",      enc(user_input), mode))
        con.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                    (session_id, ts, "assistant", enc(response),   mode))
        con.commit()

        store_memory(con, col, "conversation",
            f"[{mode}][{datetime.date.today()}] User: {user_input[:300]} Jarvis: {response[:400]}",
            tags=mode)

        summary = con.execute("SELECT summary FROM sessions WHERE id=?", (session_id,)).fetchone()
        if summary and not summary[0]:
            con.execute("UPDATE sessions SET summary=?,mode=? WHERE id=?",
                        (enc(user_input[:80]), mode, session_id)); con.commit()

if __name__ == "__main__":
    main()
