"""SQLite persistence for PyQuest — players, progress, badges. Zero external deps."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(os.getenv("PYQUEST_DB", Path(__file__).resolve().parent / "pyquest.db"))


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS players (
                username   TEXT PRIMARY KEY,
                role       TEXT NOT NULL DEFAULT 'student',
                display    TEXT,
                parent_of  TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS progress (
                username     TEXT NOT NULL,
                lesson_id    TEXT NOT NULL,
                completed    INTEGER DEFAULT 0,
                stars        INTEGER DEFAULT 0,
                xp           INTEGER DEFAULT 0,
                seconds_spent INTEGER DEFAULT 0,
                updated_at   TEXT,
                PRIMARY KEY (username, lesson_id)
            );
            CREATE TABLE IF NOT EXISTS badges (
                username TEXT NOT NULL,
                badge    TEXT NOT NULL,
                emoji    TEXT,
                earned_at TEXT,
                PRIMARY KEY (username, badge)
            );
            """
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_player(username: str, role: str = "student", display: Optional[str] = None,
                  parent_of: Optional[str] = None) -> None:
    with _conn() as c:
        c.execute(
            """INSERT INTO players (username, role, display, parent_of, created_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(username) DO UPDATE SET role=excluded.role,
                   display=COALESCE(excluded.display, players.display),
                   parent_of=COALESCE(excluded.parent_of, players.parent_of)""",
            (username, role, display or username, parent_of, _now()),
        )


def get_player(username: str) -> Optional[dict]:
    with _conn() as c:
        r = c.execute("SELECT * FROM players WHERE username=?", (username,)).fetchone()
        return dict(r) if r else None


def complete_lesson(username: str, lesson_id: str, xp: int, stars: int,
                    badge: Optional[str] = None, badge_emoji: Optional[str] = None,
                    seconds: int = 0) -> dict:
    with _conn() as c:
        c.execute(
            """INSERT INTO progress (username, lesson_id, completed, stars, xp, seconds_spent, updated_at)
               VALUES (?,?,1,?,?,?,?)
               ON CONFLICT(username, lesson_id) DO UPDATE SET
                   completed=1,
                   stars=MAX(progress.stars, excluded.stars),
                   xp=MAX(progress.xp, excluded.xp),
                   seconds_spent=progress.seconds_spent + excluded.seconds_spent,
                   updated_at=excluded.updated_at""",
            (username, lesson_id, stars, xp, seconds, _now()),
        )
        if badge:
            c.execute(
                """INSERT OR IGNORE INTO badges (username, badge, emoji, earned_at)
                   VALUES (?,?,?,?)""",
                (username, badge, badge_emoji, _now()),
            )
    return summary(username)


def add_time(username: str, lesson_id: str, seconds: int) -> None:
    with _conn() as c:
        c.execute(
            """INSERT INTO progress (username, lesson_id, seconds_spent, updated_at)
               VALUES (?,?,?,?)
               ON CONFLICT(username, lesson_id) DO UPDATE SET
                   seconds_spent=progress.seconds_spent + excluded.seconds_spent,
                   updated_at=excluded.updated_at""",
            (username, lesson_id, seconds, _now()),
        )


def summary(username: str) -> dict:
    with _conn() as c:
        rows = c.execute("SELECT * FROM progress WHERE username=?", (username,)).fetchall()
        badges = c.execute("SELECT badge, emoji, earned_at FROM badges WHERE username=?",
                           (username,)).fetchall()
    total_xp = sum(r["xp"] for r in rows if r["completed"])
    completed = [r["lesson_id"] for r in rows if r["completed"]]
    seconds = sum(r["seconds_spent"] for r in rows)
    level = 1 + total_xp // 300  # gamey level curve
    return {
        "username": username,
        "total_xp": total_xp,
        "level": level,
        "xp_into_level": total_xp % 300,
        "xp_for_next": 300,
        "completed_lessons": completed,
        "stars": {r["lesson_id"]: r["stars"] for r in rows if r["completed"]},
        "badges": [dict(b) for b in badges],
        "seconds_spent": seconds,
    }
