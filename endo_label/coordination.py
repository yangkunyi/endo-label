"""SQLite coordination store: Accounts and login sessions (WAL)."""

from __future__ import annotations

import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pwdlib import PasswordHash

from endo_label.config import Settings

BUSY_TIMEOUT_MS = 5000

_HASHER = PasswordHash.recommended()


class AccountExists(Exception):
    """Username already taken."""


@dataclass(frozen=True)
class Account:
    id: int
    username: str
    admin: bool
    reviewer: bool
    annotator: bool
    disabled: bool

def db_path(settings: Settings) -> Path:
    if settings.coordination_db is not None:
        return settings.coordination_db
    return settings.labels_root.parent / "coordination.sqlite"


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    con.execute("PRAGMA foreign_keys=ON")
    mode = con.execute("PRAGMA journal_mode=WAL").fetchone()[0]
    if str(mode).lower() != "wal":
        raise RuntimeError(f"failed to enable WAL: {mode}")
    _init_schema(con)
    return con


def _init_schema(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            admin INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)),
            reviewer INTEGER NOT NULL DEFAULT 0 CHECK (reviewer IN (0, 1)),
            annotator INTEGER NOT NULL DEFAULT 0 CHECK (annotator IN (0, 1)),
            disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
        );
        CREATE TABLE IF NOT EXISTS login_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        """
    )
    con.commit()


def hash_password(password: str) -> str:
    return _HASHER.hash(password)


def create_account(
    path: Path,
    username: str,
    password: str,
    *,
    admin: bool = False,
    reviewer: bool = False,
    annotator: bool = False,
    password_hash: str | None = None,
) -> Account:
    username = username.strip()
    if not username:
        raise ValueError("username is required")
    hashed = password_hash if password_hash is not None else hash_password(password)
    con = connect(path)
    try:
        try:
            cur = con.execute(
                "INSERT INTO users (username, password_hash, admin, reviewer, annotator) "
                "VALUES (?, ?, ?, ?, ?)",
                (username, hashed, int(admin), int(reviewer), int(annotator)),
            )
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise AccountExists(username) from exc
        return Account(
            id=int(cur.lastrowid),
            username=username,
            admin=admin,
            reviewer=reviewer,
            annotator=annotator,
            disabled=False,
        )
    finally:
        con.close()


def _account_from_row(row: sqlite3.Row) -> Account:
    return Account(
        id=row["id"],
        username=row["username"],
        admin=bool(row["admin"]),
        reviewer=bool(row["reviewer"]),
        annotator=bool(row["annotator"]),
        disabled=bool(row["disabled"]),
    )


def set_roles(
    path: Path,
    username: str,
    *,
    admin: bool,
    reviewer: bool,
    annotator: bool,
) -> None:
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE users SET admin=?, reviewer=?, annotator=? WHERE username=? COLLATE NOCASE",
            (int(admin), int(reviewer), int(annotator), username),
        )
        con.commit()
        if cur.rowcount != 1:
            raise KeyError(username)
    finally:
        con.close()


def set_disabled(path: Path, username: str, disabled: bool) -> None:
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE users SET disabled=? WHERE username=? COLLATE NOCASE",
            (int(disabled), username),
        )
        con.commit()
        if cur.rowcount != 1:
            raise KeyError(username)
    finally:
        con.close()


def authenticate(path: Path, username: str, password: str) -> Account | None:
    con = connect(path)
    try:
        row = con.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if row is None or not _HASHER.verify(password, row["password_hash"]):
            return None
        account = _account_from_row(row)
        if account.disabled:
            return None
        return account
    finally:
        con.close()


def create_session(path: Path, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    con = connect(path)
    try:
        con.execute(
            "INSERT INTO login_sessions (id, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, datetime.now(timezone.utc).isoformat()),
        )
        con.commit()
        return token
    finally:
        con.close()


def delete_session(path: Path, token: str) -> None:
    con = connect(path)
    try:
        con.execute("DELETE FROM login_sessions WHERE id=?", (token,))
        con.commit()
    finally:
        con.close()


def account_for_session(path: Path, token: str) -> Account | None:
    con = connect(path)
    try:
        row = con.execute(
            """
            SELECT users.id, users.username, users.admin, users.reviewer,
                   users.annotator, users.disabled
            FROM login_sessions
            JOIN users ON users.id = login_sessions.user_id
            WHERE login_sessions.id = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        return _account_from_row(row)
    finally:
        con.close()
