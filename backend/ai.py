import re as _re
import datetime
from backend import state

CODING_KEYWORDS = [
    "code", "coding", "program", "debug", "function", "script", "python",
    "c++", "cpp", "javascript", "typescript", "algorithm", "compile", "bug",
    "implement", "segfault", "pointer", "memory leak", "makefile", "gcc",
    "gdb", "embedded", "firmware", "gpio", "uart", "spi", "i2c", "bare metal",
    "pico", "raspberry", "microcontroller", "html", "react", "flask",
    "fastapi", "docker", "bash", "shell", "linker", "assembly",
    r"\bc\b", r"\bcss\b",
]
STUDY_KEYWORDS = [
    "study", "studying", "learn", "course", "exam", "lecture", "explain",
    "concept", "assignment", "homework", "understand", "revision",
    "operating system", "scheduler", "scheduling", "deadlock", "semaphore",
    "mutex", "virtual memory", "page table", "tlb", "file system",
    "pipeline", "digital systems", "fpga", "compiler", "parser", "lexer",
    "quantum", "relativity", "calculus", "linear algebra", "differential",
    "probability", "fourier", "laplace", "physics", "theorem",
    "derive", "proof", "algorithm design",
    r"\bnetwork\b", r"\btcp\b", r"\budp\b", r"\bmath\b",
    r"\bprocess\b", r"\bthread\b", r"\bcache\b",
]


def _matches(keywords: list[str], text: str) -> bool:
    for kw in keywords:
        if kw.startswith(r"\b"):
            if _re.search(kw, text):
                return True
        elif kw in text:
            return True
    return False


def detect_mode(text: str, current: str = "general") -> str:
    lower = text.lower()
    if _matches(CODING_KEYWORDS, lower):
        return "coding"
    if _matches(STUDY_KEYWORDS, lower):
        return "study"
    return current


def build_system_prompt(
    mode: str,
    memories: list[str],
    search_context: str,
    app_context: str,
    user: dict,
) -> str:
    """
    Builds the system prompt for the AI model.

    app_context is a pre-built string from build_app_contexts() in app_context.py.
    It contains only context blocks from currently enabled optional apps
    (fitness, reminders, projects, journal, etc.).
    Pass an empty string if no optional apps are enabled or relevant.
    """
    now   = datetime.datetime.now()
    name  = user.get("name", "User")
    brief = user.get("brief", "")

    ground_truth = (
        f"[CONTEXT]\n"
        f"Date/time: {now.strftime('%A, %B %d, %Y %H:%M')}\n"
        f"User: {name}\n"
        + (f"About the user: {brief}\n" if brief else "")
    )
    ground_truth += (
        "\n[RULES]\n"
        "1. Never invent personal facts about the user.\n"
        "2. Only reference events listed in the context above.\n"
        "3. State uncertainty explicitly.\n"
    )

    memory_block = (
        "\n[MEMORY — relevant past context]\n"
        + "\n".join(f"• {m[:280]}" for m in memories)
        if memories else ""
    )

    mode_instructions = {
        "general": "You are Jarvis, a personal AI assistant. Be direct and natural.",
        "coding": (
            "You are Jarvis in CODING mode — an expert systems programmer. "
            "Write correct, well-commented code. Don't fabricate APIs or function signatures."
        ),
        "study": (
            "You are Jarvis in STUDY mode — a patient technical tutor. "
            "Explain from first principles. Show derivations. Say when uncertain."
        ),
    }

    return (
        ground_truth
        + "\n"
        + mode_instructions.get(mode, mode_instructions["general"])
        + memory_block
        + (f"\n\n{app_context}" if app_context else "")
        + (f"\n\n{search_context}" if search_context else "")
    )


def should_web_search(text: str) -> bool:
    triggers = [
        "search for", "look up", "latest", "current news", "recent",
        "who won", "what happened", "find me", "today's price",
        "is there a", "what version",
    ]
    return any(t in text.lower() for t in triggers)


def web_search(query: str, n: int = 4) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return [
                {"title": r.get("title", ""), "url": r.get("href", ""), "body": r.get("body", "")[:400]}
                for r in ddgs.text(query, max_results=n)
            ]
    except Exception as e:
        return [{"title": "Search error", "url": "", "body": str(e)}]


def format_search_results(results: list[dict]) -> str:
    if not results:
        return ""
    lines = ["[WEB SEARCH — cite sources]"]
    for r in results:
        lines.append(f"\n• {r['title']}")
        if r["url"]:  lines.append(f"  {r['url']}")
        if r["body"]: lines.append(f"  {r['body']}")
    return "\n".join(lines)
