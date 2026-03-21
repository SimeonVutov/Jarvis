import datetime
from backend import state

import re as _re

# Keywords that require a full-word match so single letters like "c" and short
# strings like "css" don't falsely match inside unrelated words.
CODING_KEYWORDS = [
    "code", "coding", "program", "debug", "function", "script", "python",
    "c++", "cpp", "javascript", "typescript", "algorithm", "compile", "bug",
    "implement", "segfault", "pointer", "memory leak", "makefile", "gcc",
    "gdb", "embedded", "firmware", "gpio", "uart", "spi", "i2c", "bare metal",
    "pico", "raspberry", "microcontroller", "html", "react", "flask",
    "fastapi", "docker", "bash", "shell", "linker", "assembly",
    # Single-letter / short keywords that need whole-word matching
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
    # Whole-word matches to avoid "network" matching "networking" etc.
    r"\bnetwork\b", r"\btcp\b", r"\budp\b", r"\bmath\b",
    r"\bprocess\b", r"\bthread\b", r"\bcache\b",
]

# Keywords that start with r"\" are treated as regex patterns;
# all others are simple substring matches.
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
    upcoming_reminders: list[dict],
    user: dict,
    projects: list[dict] | None = None,
) -> str:
    now   = datetime.datetime.now()
    name  = user.get("name", "User")
    brief = user.get("brief", "")

    ground_truth = (
        f"[CONTEXT]\n"
        f"Date/time: {now.strftime('%A, %B %d, %Y %H:%M')}\n"
        f"User: {name}\n"
        + (f"About the user: {brief}\n" if brief else "")
    )
    if upcoming_reminders:
        ground_truth += "\nUpcoming events:\n"
        ground_truth += "".join(
            f"  • {r['due_date']}: {r['title']}\n" for r in upcoming_reminders[:5]
        )
    ground_truth += (
        "\n[RULES]\n"
        "1. Never invent personal facts about the user.\n"
        "2. Only reference events from the list above.\n"
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

    projects_block = ""
    if projects:
        projects_block = "\n[PROJECTS — the user's saved projects and files]\n"
        for proj in projects:
            projects_block += f"Project: {proj['name']}"
            if proj.get("description"):
                projects_block += f" — {proj['description']}"
            projects_block += "\n"
            for f in proj.get("files", []):
                projects_block += f"  File: {f['filename']}\n"
                if f.get("content"):
                    # Include up to 3000 chars per file so context stays manageable
                    snippet = f["content"][:3000]
                    if len(f["content"]) > 3000:
                        snippet += "\n… [truncated]"
                    projects_block += f"  Content:\n{snippet}\n"
        projects_block += (
            "\nWhen the user references a project or file by name, use the content above. "
            "You can read, explain, or modify any file shown. "
            "Be specific — quote exact lines when relevant.\n"
        )

    return (
        ground_truth
        + "\n"
        + mode_instructions.get(mode, mode_instructions["general"])
        + memory_block
        + projects_block
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
