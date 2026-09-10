"""SQLite coordination store: Accounts, Projects, Clip registration, Vocab registry, Assignments (WAL)."""

from __future__ import annotations

import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pwdlib import PasswordHash

from endo_label.config import Settings

BUSY_TIMEOUT_MS = 5000
TASK_TYPES = ("phase", "class", "triplet", "mask")

_HASHER = PasswordHash.recommended()


class AccountExists(Exception):
    """Username already taken."""


class ProjectExists(Exception):
    """Project name already taken."""


class ProjectNotFound(Exception):
    """No Project with that name or id."""


class ClipExists(Exception):
    """Clip id already registered."""


class AssignmentNotFound(Exception):
    """No Assignment for that Clip and Task type."""


class AssignmentConflict(Exception):
    """Wrong Assignment state for this transition."""


class UnknownAccount(Exception):
    """No Account with that username."""


class VersionConflict(Exception):
    """Clip version does not match."""


class LabelWriteForbidden(Exception):
    """Current Account is not the Labeling assignee."""


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
            path TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS assignments (
            clip_id TEXT NOT NULL REFERENCES clips(id),
            task_type TEXT NOT NULL CHECK (task_type IN ('phase', 'class', 'triplet', 'mask')),
            state TEXT NOT NULL DEFAULT 'Unassigned'
                CHECK (state IN ('Unassigned', 'Labeling', 'Submitted', 'Reviewing', 'Done')),
            assignee_id INTEGER REFERENCES users(id),
            reviewer_id INTEGER REFERENCES users(id),
            note TEXT,
            reviewed_by INTEGER REFERENCES users(id),
            reviewed_at TEXT,
            delivered_at TEXT,
            PRIMARY KEY (clip_id, task_type)
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
    _ensure_clip_version_column(con)
    _backfill_assignments(con)
    con.commit()


def _column_names(con: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in con.execute(f"PRAGMA table_info({table})")}


def _ensure_clip_version_column(con: sqlite3.Connection) -> None:
    if "version" not in _column_names(con, "clips"):
        con.execute("ALTER TABLE clips ADD COLUMN version INTEGER NOT NULL DEFAULT 0")


def _ensure_assignment_rows(con: sqlite3.Connection, clip_id: str) -> None:
    for task_type in TASK_TYPES:
        con.execute(
            "INSERT OR IGNORE INTO assignments (clip_id, task_type) VALUES (?, ?)",
            (clip_id, task_type),
        )


def _backfill_assignments(con: sqlite3.Connection) -> None:
    for row in con.execute("SELECT id FROM clips"):
        _ensure_assignment_rows(con, row["id"])


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
                _ensure_assignment_rows(con, clip_id)
                con.commit()
                return _clip_from_row(existing)
            raise ClipExists(clip_id)
        con.execute(
            "INSERT INTO clips (id, project_id, kind, path) VALUES (?, ?, ?, ?)",
            (clip_id, project_id, kind, stored),
        )
        _ensure_assignment_rows(con, clip_id)
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


_ITEM_SELECT = """
SELECT
  a.clip_id,
  a.task_type,
  a.state,
  assignee.username AS assignee,
  reviewer.username AS reviewer,
  a.note,
  reviewed.username AS reviewed_by,
  a.reviewed_at,
  a.delivered_at,
  c.version
FROM assignments a
JOIN clips c ON c.id = a.clip_id
LEFT JOIN users AS assignee ON assignee.id = a.assignee_id
LEFT JOIN users AS reviewer ON reviewer.id = a.reviewer_id
LEFT JOIN users AS reviewed ON reviewed.id = a.reviewed_by
"""


def _item_dict(row: sqlite3.Row) -> dict:
    return {
        "clip_id": row["clip_id"],
        "task_type": row["task_type"],
        "state": row["state"],
        "assignee": row["assignee"],
        "reviewer": row["reviewer"],
        "note": row["note"],
        "reviewed_by": row["reviewed_by"],
        "reviewed_at": row["reviewed_at"],
        "delivered_at": row["delivered_at"],
        "version": int(row["version"]),
    }


def _fetch_item(con: sqlite3.Connection, clip_id: str, task_type: str) -> dict:
    row = con.execute(
        _ITEM_SELECT + " WHERE a.clip_id=? AND a.task_type=?",
        (clip_id, task_type),
    ).fetchone()
    if row is None:
        raise AssignmentNotFound((clip_id, task_type))
    return _item_dict(row)


def _account_id(con: sqlite3.Connection, username: str) -> int:
    row = con.execute(
        "SELECT id FROM users WHERE username=? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if row is None:
        raise UnknownAccount(username)
    return int(row["id"])


def items_payload(path: Path) -> list[dict]:
    con = connect(path)
    try:
        rows = con.execute(_ITEM_SELECT + " ORDER BY a.clip_id, a.task_type").fetchall()
        return [_item_dict(row) for row in rows]
    finally:
        con.close()


def _with_assignment(path: Path, clip_id: str, task_type: str, fn):
    if task_type not in TASK_TYPES:
        raise AssignmentNotFound(task_type)
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        clip = con.execute("SELECT id FROM clips WHERE id=?", (clip_id,)).fetchone()
        if clip is None:
            raise AssignmentNotFound(clip_id)
        row = con.execute(
            "SELECT clip_id, task_type, state, assignee_id FROM assignments "
            "WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if row is None:
            raise AssignmentNotFound((clip_id, task_type))
        payload = fn(con, row)
        con.commit()
        return payload
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def assign_item(path: Path, clip_id: str, task_type: str, username: str) -> dict:
    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        user_id = _account_id(con, username)
        if row["state"] != "Unassigned":
            raise AssignmentConflict(row["state"])
        con.execute(
            "UPDATE assignments SET state='Labeling', assignee_id=? "
            "WHERE clip_id=? AND task_type=?",
            (user_id, clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def reassign_item(path: Path, clip_id: str, task_type: str, username: str) -> dict:
    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        user_id = _account_id(con, username)
        if row["state"] != "Labeling":
            raise AssignmentConflict(row["state"])
        con.execute(
            "UPDATE assignments SET assignee_id=? WHERE clip_id=? AND task_type=?",
            (user_id, clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def unassign_item(path: Path, clip_id: str, task_type: str) -> dict:
    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if row["state"] != "Labeling":
            raise AssignmentConflict(row["state"])
        con.execute(
            "UPDATE assignments SET state='Unassigned', assignee_id=NULL "
            "WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def clip_version(path: Path, clip_id: str) -> int:
    con = connect(path)
    try:
        row = con.execute("SELECT version FROM clips WHERE id=?", (clip_id,)).fetchone()
        return 0 if row is None else int(row["version"])
    finally:
        con.close()


def _write_allowed(row: sqlite3.Row | None, account_id: int) -> bool:
    return (
        row is not None
        and row["assignee_id"] is not None
        and int(row["assignee_id"]) == account_id
        and row["state"] == "Labeling"
    )


def assert_label_writer(
    path: Path,
    *,
    account_id: int,
    clip_id: str,
    task_type: str,
) -> None:
    con = connect(path)
    try:
        clip = con.execute("SELECT id FROM clips WHERE id=?", (clip_id,)).fetchone()
        if clip is None:
            raise AssignmentNotFound(clip_id)
        row = con.execute(
            "SELECT state, assignee_id FROM assignments WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if not _write_allowed(row, account_id):
            raise LabelWriteForbidden()
    finally:
        con.close()


def authorize_label_write(
    path: Path,
    *,
    account_id: int,
    clip_id: str,
    task_type: str,
    version: int | None,
) -> int:
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        clip = con.execute("SELECT version FROM clips WHERE id=?", (clip_id,)).fetchone()
        if clip is None:
            raise AssignmentNotFound(clip_id)
        row = con.execute(
            "SELECT state, assignee_id FROM assignments WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if not _write_allowed(row, account_id):
            raise LabelWriteForbidden()
        current = int(clip["version"])
        if version is not None and int(version) != current:
            raise VersionConflict()
        new_version = current + 1
        con.execute("UPDATE clips SET version=? WHERE id=?", (new_version, clip_id))
        con.commit()
        return new_version
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
