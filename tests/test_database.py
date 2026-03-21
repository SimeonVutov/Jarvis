"""
Tests for database schema creation and basic CRUD operations.
Uses an in-memory SQLite database — no files written.
"""
import sqlite3
import datetime
import pytest
from backend.database import ensure_tables


@pytest.fixture
def db():
    """In-memory SQLite connection, freshly created for each test."""
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    ensure_tables(con)
    return con


class TestSchemaCreation:
    def test_all_tables_created(self, db):
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        expected = {"sessions", "messages", "memories", "fitness", "facts", "reminders", "projects", "project_files"}
        assert expected.issubset(tables)

    def test_ensure_tables_is_idempotent(self, db):
        # Running twice should not raise or duplicate anything
        ensure_tables(db)
        ensure_tables(db)
        tables = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        assert tables >= 8


class TestSessionsAndMessages:
    def test_insert_and_retrieve_session(self, db):
        db.execute("INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)", ("2026-01-01","general","test"))
        db.commit()
        row = db.execute("SELECT * FROM sessions").fetchone()
        assert row["date"]    == "2026-01-01"
        assert row["mode"]    == "general"
        assert row["summary"] == "test"

    def test_insert_message_linked_to_session(self, db):
        db.execute("INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)", ("2026-01-01","general",""))
        db.commit()
        sid = db.execute("SELECT id FROM sessions").fetchone()["id"]
        db.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                   (sid, "2026-01-01T12:00:00", "user", "hello", "general"))
        db.commit()
        msg = db.execute("SELECT * FROM messages WHERE session_id=?", (sid,)).fetchone()
        assert msg["role"]    == "user"
        assert msg["content"] == "hello"

    def test_delete_session_cascade_behaviour(self, db):
        db.execute("INSERT INTO sessions(date,mode,summary) VALUES(?,?,?)", ("2026-01-01","general",""))
        db.commit()
        sid = db.execute("SELECT id FROM sessions").fetchone()["id"]
        db.execute("INSERT INTO messages(session_id,ts,role,content,mode) VALUES(?,?,?,?,?)",
                   (sid, "2026-01-01T12:00:00", "user", "hi", "general"))
        db.commit()
        db.execute("DELETE FROM messages WHERE session_id=?", (sid,))
        db.execute("DELETE FROM sessions WHERE id=?", (sid,))
        db.commit()
        assert db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]  == 0


class TestFitness:
    def test_insert_and_retrieve_entry(self, db):
        db.execute("INSERT INTO fitness(date,calories,weight) VALUES(?,?,?)", ("2026-01-01", 2100, 75.5))
        db.commit()
        row = db.execute("SELECT * FROM fitness WHERE date='2026-01-01'").fetchone()
        assert row["calories"] == 2100
        assert row["weight"]   == 75.5

    def test_primary_key_prevents_duplicate_date(self, db):
        db.execute("INSERT INTO fitness(date,calories) VALUES(?,?)", ("2026-01-01", 2000))
        db.commit()
        db.execute("INSERT OR REPLACE INTO fitness(date,calories) VALUES(?,?)", ("2026-01-01", 2200))
        db.commit()
        rows = db.execute("SELECT * FROM fitness WHERE date='2026-01-01'").fetchall()
        assert len(rows)           == 1
        assert rows[0]["calories"] == 2200


class TestReminders:
    def test_insert_and_retrieve(self, db):
        db.execute("INSERT INTO reminders(title,due_date) VALUES(?,?)", ("Submit report","2026-05-01"))
        db.commit()
        row = db.execute("SELECT * FROM reminders").fetchone()
        assert row["title"]    == "Submit report"
        assert row["done"]     == 0

    def test_mark_done(self, db):
        db.execute("INSERT INTO reminders(title,due_date) VALUES(?,?)", ("Task","2026-05-01"))
        db.commit()
        rid = db.execute("SELECT id FROM reminders").fetchone()["id"]
        db.execute("UPDATE reminders SET done=1 WHERE id=?", (rid,))
        db.commit()
        assert db.execute("SELECT done FROM reminders WHERE id=?", (rid,)).fetchone()["done"] == 1


class TestProjects:
    def test_create_project(self, db):
        db.execute("INSERT INTO projects(name,description,color,created_at) VALUES(?,?,?,?)",
                   ("Algorithm Design", "AD course notes", "#00c8f0", "2026-01-01T00:00:00"))
        db.commit()
        row = db.execute("SELECT * FROM projects").fetchone()
        assert row["name"]        == "Algorithm Design"
        assert row["description"] == "AD course notes"

    def test_add_file_to_project(self, db):
        db.execute("INSERT INTO projects(name,description,color,created_at) VALUES(?,?,?,?)",
                   ("My Project", "", "#00c8f0", "2026-01-01T00:00:00"))
        db.commit()
        pid = db.execute("SELECT id FROM projects").fetchone()["id"]
        db.execute("INSERT INTO project_files(project_id,filename,mime_type,size_bytes,content,is_binary,created_at) VALUES(?,?,?,?,?,?,?)",
                   (pid, "notes.md", "text/plain", 42, "encrypted-content", 0, "2026-01-01T00:00:00"))
        db.commit()
        file_row = db.execute("SELECT * FROM project_files WHERE project_id=?", (pid,)).fetchone()
        assert file_row["filename"] == "notes.md"
        assert file_row["is_binary"] == 0

    def test_delete_project_removes_files(self, db):
        db.execute("INSERT INTO projects(name,description,color,created_at) VALUES(?,?,?,?)",
                   ("Temp", "", "#00c8f0", "2026-01-01T00:00:00"))
        db.commit()
        pid = db.execute("SELECT id FROM projects").fetchone()["id"]
        db.execute("INSERT INTO project_files(project_id,filename,mime_type,size_bytes,content,is_binary,created_at) VALUES(?,?,?,?,?,?,?)",
                   (pid, "file.txt", "text/plain", 10, "content", 0, "2026-01-01T00:00:00"))
        db.commit()
        db.execute("DELETE FROM project_files WHERE project_id=?", (pid,))
        db.execute("DELETE FROM projects WHERE id=?", (pid,))
        db.commit()
        assert db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]      == 0
        assert db.execute("SELECT COUNT(*) FROM project_files").fetchone()[0] == 0
