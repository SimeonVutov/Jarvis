import sqlite3
from backend.config import get_db_path


def get_connection() -> sqlite3.Connection:
    con = sqlite3.connect(get_db_path(), timeout=30)
    con.row_factory = sqlite3.Row
    return con


def ensure_tables(con: sqlite3.Connection) -> None:
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
            tags     TEXT DEFAULT '',
            app_id   TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS fitness (
            date     TEXT PRIMARY KEY,
            calories INTEGER,
            weight   REAL,
            workout  TEXT,
            notes    TEXT
        );
        CREATE TABLE IF NOT EXISTS facts (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            ts    TEXT NOT NULL,
            topic TEXT NOT NULL,
            content TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            description TEXT DEFAULT '',
            done        INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS projects (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            color       TEXT DEFAULT '#00c8f0',
            created_at  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            filename   TEXT NOT NULL,
            mime_type  TEXT DEFAULT 'text/plain',
            size_bytes INTEGER DEFAULT 0,
            content    TEXT NOT NULL,
            is_binary  INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_tasks (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            title            TEXT NOT NULL,
            description      TEXT DEFAULT '',
            date             TEXT NOT NULL,
            start_time       TEXT,
            duration_minutes INTEGER DEFAULT 0,
            level            TEXT DEFAULT 'low',
            group_id         INTEGER,
            done             INTEGER DEFAULT 0,
            created_at       TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            start_date  TEXT NOT NULL,
            start_time  TEXT,
            end_date    TEXT,
            end_time    TEXT,
            level       TEXT DEFAULT 'low',
            created_at  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            color      TEXT DEFAULT '#00c8f0',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            color      TEXT DEFAULT '#00c8f0',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_tasks (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            title            TEXT NOT NULL,
            description      TEXT DEFAULT '',
            date             TEXT NOT NULL,
            start_time       TEXT,
            duration_minutes INTEGER,
            priority         TEXT DEFAULT 'mid',
            group_id         INTEGER,
            done             INTEGER DEFAULT 0,
            created_at       TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calendar_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            date        TEXT NOT NULL,
            start_time  TEXT NOT NULL,
            end_time    TEXT NOT NULL,
            priority    TEXT DEFAULT 'mid',
            created_at  TEXT NOT NULL
        );
        PRAGMA journal_mode=WAL;
    """)
    con.commit()
    _run_migrations(con)


def _run_migrations(con: sqlite3.Connection) -> None:
    """
    Safe ALTER TABLE migrations for columns added after initial release.
    Each migration is idempotent — silently skips if the column exists.
    """
    migrations = [
        # v2.1 — app_id lets recall_memories filter by disabled app
        "ALTER TABLE memories ADD COLUMN app_id TEXT DEFAULT ''",
    ]
    for sql in migrations:
        try:
            con.execute(sql)
            con.commit()
        except Exception:
            pass  # Column already exists — safe to ignore
