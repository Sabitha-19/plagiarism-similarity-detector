"""SQLite persistence layer for submissions, comparisons, and jobs."""
import json
import sqlite3
import threading
from contextlib import contextmanager

from config import DB_PATH

_local = threading.local()
_init_lock = threading.Lock()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _init_lock:
        with get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_name TEXT NOT NULL,
                    stored_path TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS comparisons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    submission_id_1 INTEGER NOT NULL,
                    submission_id_2 INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    scores TEXT,
                    classification TEXT,
                    matches TEXT,
                    error TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (submission_id_1) REFERENCES submissions(id),
                    FOREIGN KEY (submission_id_2) REFERENCES submissions(id)
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    comparison_id INTEGER,
                    stage TEXT NOT NULL DEFAULT 'queued',
                    progress INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'running',
                    error TEXT,
                    result TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )


def insert_submission(file_name, stored_path, file_type, sha256):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO submissions (file_name, stored_path, file_type, sha256) "
            "VALUES (?, ?, ?, ?)",
            (file_name, stored_path, file_type, sha256),
        )
        return cur.lastrowid


def get_submission(submission_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
        return dict(row) if row else None


def list_submissions(exclude_id=None):
    with get_conn() as conn:
        if exclude_id is not None:
            rows = conn.execute(
                "SELECT * FROM submissions WHERE id != ? ORDER BY id", (exclude_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM submissions ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def create_job(job_id, comparison_id=None):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO jobs (id, comparison_id, stage, progress, status) "
            "VALUES (?, ?, 'queued', 0, 'running')",
            (job_id, comparison_id),
        )


def update_job(job_id, stage=None, progress=None, status=None, error=None,
               comparison_id=None, result=None):
    fields, values = [], []
    if stage is not None:
        fields.append("stage = ?"); values.append(stage)
    if progress is not None:
        fields.append("progress = ?"); values.append(progress)
    if status is not None:
        fields.append("status = ?"); values.append(status)
    if error is not None:
        fields.append("error = ?"); values.append(error)
    if comparison_id is not None:
        fields.append("comparison_id = ?"); values.append(comparison_id)
    if result is not None:
        fields.append("result = ?"); values.append(json.dumps(result))
    if not fields:
        return
    values.append(job_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?", values)


def get_job(job_id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None


def create_comparison(submission_id_1, submission_id_2):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO comparisons (submission_id_1, submission_id_2, status) "
            "VALUES (?, ?, 'running')",
            (submission_id_1, submission_id_2),
        )
        return cur.lastrowid


def complete_comparison(comparison_id, scores, classification, matches):
    with get_conn() as conn:
        conn.execute(
            "UPDATE comparisons SET status = 'completed', scores = ?, "
            "classification = ?, matches = ? WHERE id = ?",
            (json.dumps(scores), classification, json.dumps(matches), comparison_id),
        )


def fail_comparison(comparison_id, error):
    with get_conn() as conn:
        conn.execute(
            "UPDATE comparisons SET status = 'failed', error = ? WHERE id = ?",
            (error, comparison_id),
        )


def get_comparison(comparison_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM comparisons WHERE id = ?", (comparison_id,)
        ).fetchone()
        return dict(row) if row else None


def list_history(limit=100):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT c.*, s1.file_name AS file_name_1, s2.file_name AS file_name_2
            FROM comparisons c
            JOIN submissions s1 ON s1.id = c.submission_id_1
            JOIN submissions s2 ON s2.id = c.submission_id_2
            ORDER BY c.id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_history(comparison_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM comparisons WHERE id = ?", (comparison_id,))
        return cur.rowcount > 0
