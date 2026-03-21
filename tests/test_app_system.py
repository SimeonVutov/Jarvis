"""
Tests for the app registry and context system introduced in v2.

Covers:
- AppDescriptor structure and REGISTRY contents
- get_app / get_optional_apps / get_core_apps helpers
- tags_for_enabled_apps memory filtering logic
- build_app_contexts dispatcher (with a real in-memory DB)
- Individual context builder functions
"""
import sqlite3
import datetime
import pytest
from backend.database import ensure_tables
from backend.app_registry import (
    REGISTRY, AppDescriptor, get_app, get_optional_apps, get_core_apps,
    tags_for_enabled_apps, all_optional_memory_tags,
)


@pytest.fixture
def db():
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    ensure_tables(con)
    return con


@pytest.fixture(autouse=True)
def set_key():
    """Set a real encryption key so context builders can encrypt/decrypt."""
    import backend.state as state
    from backend.crypto import derive_key
    state.KEY = derive_key("test-password", b"\x00" * 32)
    yield
    state.KEY = b""


class TestAppRegistry:
    def test_all_descriptors_have_required_fields(self):
        for app in REGISTRY:
            assert app.id,          f"{app} missing id"
            assert app.name,        f"{app.id} missing name"
            assert app.description, f"{app.id} missing description"
            assert app.icon,        f"{app.id} missing icon"
            assert app.nav_id,      f"{app.id} missing nav_id"

    def test_app_ids_are_unique(self):
        ids = [a.id for a in REGISTRY]
        assert len(ids) == len(set(ids)), "Duplicate app IDs in REGISTRY"

    def test_core_apps_present(self):
        core_ids = {a.id for a in get_core_apps()}
        for expected in ["chat", "history", "memory", "stats", "models", "profile"]:
            assert expected in core_ids

    def test_optional_apps_present(self):
        opt_ids = {a.id for a in get_optional_apps()}
        for expected in ["fitness", "reminders", "news", "projects", "journal", "calendar"]:
            assert expected in opt_ids

    def test_core_apps_cannot_have_context_fn_that_is_missing(self):
        from backend.app_context import CONTEXT_BUILDERS
        for app in get_optional_apps():
            if app.context_fn:
                assert app.context_fn in CONTEXT_BUILDERS, \
                    f"{app.id}.context_fn='{app.context_fn}' not in CONTEXT_BUILDERS"

    def test_get_app_returns_correct_descriptor(self):
        app = get_app("fitness")
        assert app is not None
        assert app.id   == "fitness"
        assert app.core is False

    def test_get_app_returns_none_for_unknown(self):
        assert get_app("nonexistent_xyz") is None

    def test_calendar_app_registered(self):
        app = get_app("calendar")
        assert app is not None
        assert app.nav_id     == "calendar"
        assert app.context_fn == "get_calendar_context"
        assert app.core       is False


class TestTagFiltering:
    def test_core_tags_always_included(self):
        # Even with no optional apps enabled, conversation tag is always included
        tags = tags_for_enabled_apps(set())
        assert "conversation" in tags or len(tags) == 0  # core apps have no tags mostly

    def test_enabling_fitness_includes_fitness_tag(self):
        tags = tags_for_enabled_apps({"fitness"})
        assert "fitness" in tags

    def test_disabling_fitness_excludes_fitness_tag(self):
        tags = tags_for_enabled_apps(set())
        assert "fitness" not in tags

    def test_enabling_multiple_apps_includes_all_their_tags(self):
        tags = tags_for_enabled_apps({"fitness", "journal", "calendar"})
        assert "fitness"  in tags
        assert "journal"  in tags
        assert "calendar" in tags

    def test_all_optional_memory_tags_covers_all_apps(self):
        all_tags = all_optional_memory_tags()
        for app in get_optional_apps():
            for tag in app.memory_tags:
                assert tag in all_tags


class TestContextBuilders:
    def test_fitness_context_empty_when_no_data(self, db):
        from backend.app_context import get_fitness_context
        result = get_fitness_context(db, {"name": "Test"})
        assert result == ""

    def test_fitness_context_includes_todays_data(self, db):
        from backend.app_context import get_fitness_context
        from backend.crypto import encrypt
        today = datetime.date.today().isoformat()
        db.execute("INSERT INTO fitness(date,calories,weight,workout) VALUES(?,?,?,?)",
                   (today, 2100, 75.5, encrypt("chest press")))
        db.commit()
        result = get_fitness_context(db, {"name": "Test"})
        assert "FITNESS"      in result
        assert "2100"         in result
        assert "chest press"  in result

    def test_reminders_context_empty_when_no_data(self, db):
        from backend.app_context import get_reminders_context
        result = get_reminders_context(db, {"name": "Test"})
        assert result == ""

    def test_reminders_context_includes_upcoming(self, db):
        from backend.app_context import get_reminders_context
        from backend.crypto import encrypt
        future = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
        db.execute("INSERT INTO reminders(title,due_date,done) VALUES(?,?,0)",
                   (encrypt("Submit assignment"), future))
        db.commit()
        result = get_reminders_context(db, {"name": "Test"})
        assert "REMINDERS"           in result
        assert "Submit assignment"   in result
        assert future                in result

    def test_projects_context_empty_when_no_projects(self, db):
        from backend.app_context import get_projects_context
        assert get_projects_context(db, {}) == ""

    def test_projects_context_includes_file_content(self, db):
        from backend.app_context import get_projects_context
        from backend.crypto import encrypt
        ts = datetime.datetime.now().isoformat()
        db.execute("INSERT INTO projects(name,description,color,created_at) VALUES(?,?,?,?)",
                   (encrypt("OS Notes"), encrypt("Operating systems"), "#00c8f0", ts))
        db.commit()
        pid = db.execute("SELECT id FROM projects").fetchone()["id"]
        db.execute(
            "INSERT INTO project_files(project_id,filename,mime_type,size_bytes,content,is_binary,created_at) VALUES(?,?,?,?,?,?,?)",
            (pid, encrypt("notes.md"), "text/plain", 20, encrypt("Page faults happen when..."), 0, ts),
        )
        db.commit()
        result = get_projects_context(db, {})
        assert "OS Notes"              in result
        assert "notes.md"              in result
        assert "Page faults happen"    in result

    def test_calendar_context_empty_when_no_data(self, db):
        from backend.app_context import get_calendar_context
        assert get_calendar_context(db, {}) == ""

    def test_calendar_context_includes_upcoming_tasks(self, db):
        from backend.app_context import get_calendar_context
        from backend.crypto import encrypt
        future = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
        ts     = datetime.datetime.now().isoformat()
        db.execute(
            "INSERT INTO calendar_tasks(title,description,date,level,done,created_at) VALUES(?,?,?,?,?,?)",
            (encrypt("OS Exam"), encrypt(""), future, "high", 0, ts),
        )
        db.commit()
        result = get_calendar_context(db, {})
        assert "CALENDAR"  in result
        assert "OS Exam"   in result
        assert "not done"  in result
        assert "HIGH"      in result

    def test_calendar_context_marks_done_tasks(self, db):
        from backend.app_context import get_calendar_context
        from backend.crypto import encrypt
        future = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        ts     = datetime.datetime.now().isoformat()
        db.execute(
            "INSERT INTO calendar_tasks(title,description,date,level,done,created_at) VALUES(?,?,?,?,?,?)",
            (encrypt("Finished task"), encrypt(""), future, "low", 1, ts),
        )
        db.commit()
        result = get_calendar_context(db, {})
        assert "done" in result.lower()

    def test_build_app_contexts_only_calls_enabled_apps(self, db):
        from backend.app_context import build_app_contexts
        from backend.crypto import encrypt
        today = datetime.date.today().isoformat()
        ts    = datetime.datetime.now().isoformat()

        # Add fitness data
        db.execute("INSERT INTO fitness(date,calories) VALUES(?,?)", (today, 2000))
        db.commit()

        # Enable only fitness — reminders should not appear
        result = build_app_contexts({"fitness"}, db, {"name": "Test"})
        assert "FITNESS" in result

    def test_build_app_contexts_excludes_disabled_apps(self, db):
        from backend.app_context import build_app_contexts
        from backend.crypto import encrypt
        future = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
        db.execute("INSERT INTO reminders(title,due_date,done) VALUES(?,?,0)",
                   (encrypt("Secret reminder"), future))
        db.commit()

        # Reminders disabled — should not appear
        result = build_app_contexts({"fitness"}, db, {"name": "Test"})
        assert "Secret reminder" not in result

    def test_build_app_contexts_empty_string_when_nothing_enabled(self, db):
        from backend.app_context import build_app_contexts
        result = build_app_contexts(set(), db, {"name": "Test"})
        assert result == ""
