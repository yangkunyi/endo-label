"""SQLite coordination store: Accounts, Projects, Clip registration, Vocab registry (WAL)."""

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


class ProjectExists(Exception):
    """Project name already taken."""


class ProjectNotFound(Exception):
    """No Project with that name or id."""


class ClipExists(Exception):
    """Clip id already registered."""


@dataclass(frozen=True)
class Account:
    id: int
    username: str
    admin: bool
    reviewer: bool
    annotator: bool
    disabled: bool


@dataclass(frozen=True)
class Project:
    id: int
    name: str
    hospital: str


@dataclass(frozen=True)
class RegisteredClip:
    id: str
    project_id: int
    kind: str
    path: Path

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
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            hospital TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS clips (
            id TEXT PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            kind TEXT NOT NULL,
            path TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vocab_registry (
            id INTEGER PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('phase', 'class', 'triplet')),
            name TEXT NOT NULL DEFAULT '',
            instrument TEXT NOT NULL DEFAULT '',
            verb TEXT NOT NULL DEFAULT '',
            target TEXT NOT NULL DEFAULT '',
            archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
        );
        CREATE TABLE IF NOT EXISTS project_vocab_enabled (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            vocab_id INTEGER NOT NULL REFERENCES vocab_registry(id) ON DELETE CASCADE,
            PRIMARY KEY (project_id, vocab_id)
        );
        CREATE TABLE IF NOT EXISTS project_vocab_candidates (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('phase', 'class', 'triplet')),
            name TEXT NOT NULL DEFAULT '',
            instrument TEXT NOT NULL DEFAULT '',
            verb TEXT NOT NULL DEFAULT '',
            target TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS vocab_registry_active_name
            ON vocab_registry(kind, name)
            WHERE archived = 0 AND kind IN ('phase', 'class');
        CREATE UNIQUE INDEX IF NOT EXISTS vocab_registry_active_triplet
            ON vocab_registry(kind, instrument, verb, target)
            WHERE archived = 0 AND kind = 'triplet';
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


def _project_from_row(row: sqlite3.Row) -> Project:
    return Project(id=row["id"], name=row["name"], hospital=row["hospital"])


def _clip_from_row(row: sqlite3.Row) -> RegisteredClip:
    return RegisteredClip(
        id=row["id"],
        project_id=row["project_id"],
        kind=row["kind"],
        path=Path(row["path"]),
    )


def create_project(path: Path, name: str, hospital: str = "") -> Project:
    name = name.strip()
    if not name:
        raise ValueError("name is required")
    hospital = hospital.strip()
    con = connect(path)
    try:
        try:
            cur = con.execute(
                "INSERT INTO projects (name, hospital) VALUES (?, ?)",
                (name, hospital),
            )
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise ProjectExists(name) from exc
        return Project(id=int(cur.lastrowid), name=name, hospital=hospital)
    finally:
        con.close()


def get_project_by_name(path: Path, name: str) -> Project:
    con = connect(path)
    try:
        row = con.execute(
            "SELECT id, name, hospital FROM projects WHERE name=?",
            (name.strip(),),
        ).fetchone()
        if row is None:
            raise ProjectNotFound(name)
        return _project_from_row(row)
    finally:
        con.close()


def get_or_create_project(path: Path, name: str, hospital: str = "") -> Project:
    try:
        return create_project(path, name, hospital)
    except ProjectExists:
        return get_project_by_name(path, name)


def list_projects(path: Path) -> list[Project]:
    con = connect(path)
    try:
        rows = con.execute("SELECT id, name, hospital FROM projects ORDER BY id").fetchall()
        return [_project_from_row(row) for row in rows]
    finally:
        con.close()


def list_registered_clips(path: Path) -> list[RegisteredClip]:
    con = connect(path)
    try:
        rows = con.execute(
            "SELECT id, project_id, kind, path FROM clips ORDER BY rowid"
        ).fetchall()
        return [_clip_from_row(row) for row in rows]
    finally:
        con.close()


def projects_payload(path: Path) -> list[dict]:
    projects = list_projects(path)
    clips_by_project: dict[int, list[dict]] = {}
    for clip in list_registered_clips(path):
        clips_by_project.setdefault(clip.project_id, []).append(
            {"id": clip.id, "kind": clip.kind}
        )
    return [
        {
            "id": project.id,
            "name": project.name,
            "hospital": project.hospital,
            "clips": clips_by_project.get(project.id, []),
        }
        for project in projects
    ]


def _valid_clip_id(clip_id: str) -> str:
    clip_id = clip_id.strip()
    if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
        raise ValueError(f"bad clip id: {clip_id}")
    return clip_id


def register_clip(
    path: Path,
    *,
    project_id: int,
    clip_id: str,
    kind: str,
    media_path: Path,
) -> RegisteredClip:
    clip_id = _valid_clip_id(clip_id)
    kind = kind.strip()
    if not kind:
        raise ValueError("kind is required")
    stored = str(Path(media_path).expanduser().resolve())
    con = connect(path)
    try:
        project = con.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone()
        if project is None:
            raise ProjectNotFound(project_id)
        existing = con.execute("SELECT * FROM clips WHERE id=?", (clip_id,)).fetchone()
        if existing is not None:
            if (
                existing["project_id"] == project_id
                and existing["kind"] == kind
                and existing["path"] == stored
            ):
                return _clip_from_row(existing)
            raise ClipExists(clip_id)
        con.execute(
            "INSERT INTO clips (id, project_id, kind, path) VALUES (?, ?, ?, ?)",
            (clip_id, project_id, kind, stored),
        )
        con.commit()
        return RegisteredClip(
            id=clip_id, project_id=project_id, kind=kind, path=Path(stored)
        )
    finally:
        con.close()


def apply_config_registrations(settings: Settings) -> None:
    if not settings.projects:
        return
    path = db_path(settings)
    for spec in settings.projects:
        project = get_or_create_project(path, spec.name, spec.hospital)
        for clip in spec.clips:
            register_clip(
                path,
                project_id=project.id,
                clip_id=clip.id,
                kind=clip.kind,
                media_path=clip.path,
            )
