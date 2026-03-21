import datetime
from backend import state

CODING_KEYWORDS = [
    "code","coding","program","debug","function","script","python","c","c++","cpp",
    "javascript","typescript","algorithm","compile","bug","implement","segfault","pointer",
    "memory leak","makefile","gcc","gdb","embedded","firmware","gpio","uart","spi","i2c",
    "bare metal","pico","raspberry","microcontroller","html","css","react","flask",
    "fastapi","docker","bash","shell","linker","assembly",
]
STUDY_KEYWORDS = [
    "study","studying","learn","course","exam","lecture","explain","concept","assignment",
    "homework","understand","revision","operating system","scheduler","deadlock","semaphore",
    "mutex","virtual memory","page table","tlb","file system","process","thread","cache",
    "pipeline","digital systems","fpga","compiler","parser","lexer","network","tcp","udp",
    "quantum","relativity","calculus","linear algebra","differential","probability",
    "fourier","laplace","physics","math","theorem","derive","proof","algorithm design",
]


def detect_mode(text: str, current: str = "general") -> str:
    lower = text.lower()
    if any(kw in lower for kw in CODING_KEYWORDS):
        return "coding"
    if any(kw in lower for kw in STUDY_KEYWORDS):
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
