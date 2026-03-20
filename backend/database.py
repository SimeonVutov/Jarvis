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
        PRAGMA journal_mode=WAL;
    """)
    con.commit()
