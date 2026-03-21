"""
App Registry — defines every app available in Jarvis.

An "app" is a self-contained feature unit. Each app declares:
  - What nav page it maps to (shown/hidden in the sidebar)
  - What memory tags it owns (filtered in/out when the app is toggled)
  - An optional AI context builder (injected into every chat system prompt)
  - Whether it is core (cannot be disabled)

Adding a new app:
  1. Add an AppDescriptor to REGISTRY below.
  2. Add a context builder in backend/app_context.py if it needs to inject AI context.
  3. Add its nav_id to the frontend Sidebar NAV list.
  That is all — the rest of the system picks it up automatically.
"""

from dataclasses import dataclass, field


@dataclass
class AppDescriptor:
    id:           str
    name:         str
    description:  str
    icon:         str
    nav_id:       str            # matches the page id in the frontend Sidebar
    memory_tags:  list[str]      # memory rows with these tags belong to this app
    core:         bool = False   # core apps cannot be disabled
    # Name of the context builder function in backend/app_context.py.
    # None means this app does not inject anything into the AI system prompt.
    context_fn:   str | None = None


# ── Registry ────────────────────────────────────────────────────────────────────
# Order here determines the order apps appear in the Settings UI.

REGISTRY: list[AppDescriptor] = [

    # ── Core apps ────────────────────────────────────────────────────────────────
    # These cannot be disabled. They either are the system or expose its internals.

    AppDescriptor(
        id="chat",
        name="Chat",
        description="AI chat — the main purpose of Jarvis.",
        icon="◈",
        nav_id="chat",
        memory_tags=["conversation"],
        core=True,
    ),
    AppDescriptor(
        id="history",
        name="History",
        description="Browse past conversations.",
        icon="◫",
        nav_id="convs",
        memory_tags=[],
        core=True,
    ),
    AppDescriptor(
        id="memory",
        name="Memory",
        description="Search and manage the AI's long-term memory store.",
        icon="◎",
        nav_id="memory",
        memory_tags=[],
        core=True,
    ),
    AppDescriptor(
        id="stats",
        name="Stats",
        description="Usage statistics and model assignment.",
        icon="◷",
        nav_id="stats",
        memory_tags=[],
        core=True,
    ),
    AppDescriptor(
        id="models",
        name="Models",
        description="Download and manage Ollama models.",
        icon="◑",
        nav_id="models",
        memory_tags=[],
        core=True,
    ),
    AppDescriptor(
        id="profile",
        name="Profile & Settings",
        description="User profile, news sources, and app configuration.",
        icon="◐",
        nav_id="profile",
        memory_tags=[],
        core=True,
    ),

    # ── Optional apps ─────────────────────────────────────────────────────────────
    # These can be enabled or disabled. When disabled:
    #   - The nav item is hidden.
    #   - Their memory tags are excluded from AI context recall.
    #   - Their context builder is not called.
    #   - Their home page card is hidden.
    #   - Their database rows are preserved.

    AppDescriptor(
        id="fitness",
        name="Fitness",
        description="Track calories, weight, and workouts. Shown on the home page and in AI chat.",
        icon="♦",
        nav_id="fitness",
        memory_tags=["fitness"],
        context_fn="get_fitness_context",
    ),
    AppDescriptor(
        id="reminders",
        name="Reminders",
        description="Upcoming events are injected into every AI conversation to prevent hallucination.",
        icon="◌",
        nav_id="remind",
        memory_tags=["reminder"],
        context_fn="get_reminders_context",
    ),
    AppDescriptor(
        id="news",
        name="News Briefing",
        description="RSS news feed grouped by country. Top headlines shown on the home page.",
        icon="◉",
        nav_id="news",
        memory_tags=["news"],
        context_fn=None,
    ),
    AppDescriptor(
        id="projects",
        name="Projects",
        description="Upload files and notes per project. File contents are injected into AI chat.",
        icon="◧",
        nav_id="projects",
        memory_tags=["project"],
        context_fn="get_projects_context",
    ),
    AppDescriptor(
        id="journal",
        name="Journal",
        description="Encrypted personal notes. Stored as memories and recalled in AI context.",
        icon="◩",
        nav_id="journal",
        memory_tags=["journal"],
        context_fn="get_journal_context",
    ),
    AppDescriptor(
        id="calendar",
        name="Calendar",
        description="Tasks and events with levels and groups. Upcoming items are injected into AI context.",
        icon="◰",
        nav_id="calendar",
        memory_tags=["calendar"],
        context_fn="get_calendar_context",
    ),
]


# ── Lookup helpers ───────────────────────────────────────────────────────────────

def get_app(app_id: str) -> AppDescriptor | None:
    return next((a for a in REGISTRY if a.id == app_id), None)


def get_optional_apps() -> list[AppDescriptor]:
    return [a for a in REGISTRY if not a.core]


def get_core_apps() -> list[AppDescriptor]:
    return [a for a in REGISTRY if a.core]


def all_optional_memory_tags() -> set[str]:
    """All memory tags owned by optional apps — used for filtering."""
    tags = set()
    for app in get_optional_apps():
        tags.update(app.memory_tags)
    return tags


def tags_for_enabled_apps(enabled_ids: set[str]) -> set[str]:
    """
    Returns all memory tags that should be included in AI context.
    Core app tags are always included. Optional app tags only if enabled.
    """
    tags = set()
    for app in REGISTRY:
        if app.core or app.id in enabled_ids:
            tags.update(app.memory_tags)
    return tags
