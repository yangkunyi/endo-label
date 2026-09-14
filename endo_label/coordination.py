"""SQLite coordination store: Accounts, Projects, Clip registration, Vocab registry, Assignments (WAL)."""

from __future__ import annotations

import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pwdlib import PasswordHash

from endo_label import capabilities
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


class UnknownClip(Exception):
    """No registered Clip with that id."""


class VersionConflict(Exception):
    """Clip version does not match."""


class LabelWriteForbidden(Exception):
    """Current Account is not the Labeling assignee."""


class TransitionForbidden(Exception):
    """Current Account may not perform this transition."""


class ReviewerIsAnnotator(Exception):
    """An item's reviewer must differ from its annotator."""


class NoteRequired(Exception):
    """A reject transition needs a short note."""


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
    mode = str(con.execute("PRAGMA journal_mode").fetchone()[0]).lower()
    if mode != "wal":
        mode = str(con.execute("PRAGMA journal_mode=WAL").fetchone()[0]).lower()
        if mode != "wal":
            raise RuntimeError(f"failed to enable WAL: {mode}")
    _init_schema(con)
    return con


_SCHEMA_TABLES = frozenset(
    {
        "users",
        "login_sessions",
        "projects",
        "clips",
        "assignments",
        "vocab_registry",
        "project_vocab_enabled",
        "project_vocab_candidates",
        "clip_tags",
    }
)


def _schema_present(con: sqlite3.Connection) -> bool:
    rows = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return _SCHEMA_TABLES <= {str(row["name"]) for row in rows}


def _init_schema(con: sqlite3.Connection) -> None:
    """Create the schema once; later connects only run cheap column migrations.

    The bootstrap used to run on every connect, which meant every request took a
    write lock. Two Clients racing a state transition then hit SQLITE_BUSY
    (the read-then-write upgrade skips the busy handler) instead of serializing.
    """
    if not _schema_present(con):
        _create_schema(con)
    _ensure_clip_version_column(con)
    con.commit()


def _create_schema(con: sqlite3.Connection) -> None:
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
        CREATE TABLE IF NOT EXISTS clip_tags (
            clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
            tag TEXT NOT NULL,
            PRIMARY KEY (clip_id, tag)
        );
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


def list_accounts(path: Path) -> list[Account]:
    con = connect(path)
    try:
        rows = con.execute(
            "SELECT * FROM users ORDER BY username COLLATE NOCASE"
        ).fetchall()
        return [_account_from_row(row) for row in rows]
    finally:
        con.close()


def account_by_username(path: Path, username: str) -> Account:
    con = connect(path)
    try:
        row = con.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE",
            (username.strip(),),
        ).fetchone()
        if row is None:
            raise UnknownAccount(username)
        return _account_from_row(row)
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
) -> Account:
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE users SET admin=?, reviewer=?, annotator=? WHERE username=? COLLATE NOCASE",
            (int(admin), int(reviewer), int(annotator), username),
        )
        if cur.rowcount != 1:
            raise UnknownAccount(username)
        con.commit()
        row = con.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE", (username,)
        ).fetchone()
        return _account_from_row(row)
    finally:
        con.close()


def set_password(path: Path, account_id: int, password: str) -> None:
    """Replace one Account's password hash — the owner's own change."""
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (hash_password(password), account_id),
        )
        if cur.rowcount != 1:
            raise UnknownAccount(account_id)
        con.commit()
    finally:
        con.close()


def set_disabled(path: Path, username: str, disabled: bool) -> Account:
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE users SET disabled=? WHERE username=? COLLATE NOCASE",
            (int(disabled), username),
        )
        if cur.rowcount != 1:
            raise UnknownAccount(username)
        con.commit()
        row = con.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE", (username,)
        ).fetchone()
        return _account_from_row(row)
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


def update_project_hospital(path: Path, project_id: int, hospital: str) -> Project:
    hospital = hospital.strip()
    con = connect(path)
    try:
        cur = con.execute(
            "UPDATE projects SET hospital=? WHERE id=?",
            (hospital, project_id),
        )
        if cur.rowcount != 1:
            raise ProjectNotFound(project_id)
        con.commit()
        row = con.execute(
            "SELECT id, name, hospital FROM projects WHERE id=?",
            (project_id,),
        ).fetchone()
        return _project_from_row(row)
    finally:
        con.close()


def list_projects(path: Path) -> list[Project]:
    con = connect(path)
    try:
        rows = con.execute("SELECT id, name, hospital FROM projects ORDER BY id").fetchall()
        return [_project_from_row(row) for row in rows]
    finally:
        con.close()


def list_registered_clips(
    path: Path,
    *,
    project: str | None = None,
    tag: str | None = None,
) -> list[RegisteredClip]:
    query = (
        "SELECT c.id, c.project_id, c.kind, c.path FROM clips c "
        "JOIN projects p ON p.id = c.project_id"
    )
    conditions: list[str] = []
    params: list[object] = []
    if project is not None:
        conditions.append("p.name = ?")
        params.append(project.strip())
    if tag is not None:
        conditions.append(
            "EXISTS (SELECT 1 FROM clip_tags t WHERE t.clip_id = c.id AND t.tag = ?)"
        )
        params.append(tag.strip())
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY c.rowid"
    con = connect(path)
    try:
        rows = con.execute(query, params).fetchall()
        return [_clip_from_row(row) for row in rows]
    finally:
        con.close()


def clip_project_id(path: Path, clip_id: str) -> int:
    """The Project a registered Clip belongs to (exactly one)."""
    con = connect(path)
    try:
        row = con.execute(
            "SELECT project_id FROM clips WHERE id=?", (clip_id,)
        ).fetchone()
        if row is None:
            raise UnknownClip(clip_id)
        return int(row["project_id"])
    finally:
        con.close()


def set_clip_tags(path: Path, clip_id: str, tags: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(tag.strip() for tag in tags if tag.strip()))
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        if con.execute("SELECT id FROM clips WHERE id=?", (clip_id,)).fetchone() is None:
            raise UnknownClip(clip_id)
        con.execute("DELETE FROM clip_tags WHERE clip_id=?", (clip_id,))
        for tag in normalized:
            con.execute(
                "INSERT OR IGNORE INTO clip_tags (clip_id, tag) VALUES (?, ?)",
                (clip_id, tag),
            )
        con.commit()
        return _clip_tags(con, clip_id)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def clip_tags(path: Path, clip_id: str) -> list[str]:
    con = connect(path)
    try:
        return _clip_tags(con, clip_id)
    finally:
        con.close()


def _clip_tags(con: sqlite3.Connection, clip_id: str) -> list[str]:
    rows = con.execute(
        "SELECT tag FROM clip_tags WHERE clip_id=? ORDER BY tag",
        (clip_id,),
    ).fetchall()
    return [str(row["tag"]) for row in rows]


def all_tags(path: Path) -> list[str]:
    con = connect(path)
    try:
        rows = con.execute("SELECT DISTINCT tag FROM clip_tags ORDER BY tag").fetchall()
        return [str(row["tag"]) for row in rows]
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


def _write_tags(con: sqlite3.Connection, clip_id: str, tags) -> None:
    for tag in dict.fromkeys(str(tag).strip() for tag in tags if str(tag).strip()):
        con.execute(
            "INSERT OR IGNORE INTO clip_tags (clip_id, tag) VALUES (?, ?)",
            (clip_id, tag),
        )


def register_clip(
    path: Path,
    *,
    project_id: int,
    clip_id: str,
    kind: str,
    media_path: Path,
    tags: tuple[str, ...] | list[str] = (),
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
                # A re-registration states the Clip's tags in full, so a tag
                # dropped from the config leaves the store instead of lingering
                # to match the tag filter forever.
                con.execute("DELETE FROM clip_tags WHERE clip_id=?", (clip_id,))
                _write_tags(con, clip_id, tags)
                con.commit()
                return _clip_from_row(existing)
            raise ClipExists(clip_id)
        con.execute(
            "INSERT INTO clips (id, project_id, kind, path) VALUES (?, ?, ?, ?)",
            (clip_id, project_id, kind, stored),
        )
        _ensure_assignment_rows(con, clip_id)
        _write_tags(con, clip_id, tags)
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
                tags=clip.tags,
            )


_ITEM_SELECT = """
SELECT
  a.clip_id,
  a.task_type,
  a.state,
  assignee.username AS assignee,
  reviewer.username AS reviewer,
  a.note,
  a.assignee_id,
  a.reviewer_id,
  reviewed.username AS reviewed_by,
  a.reviewed_at,
  a.delivered_at,
  c.version,
  p.name AS project
FROM assignments a
JOIN clips c ON c.id = a.clip_id
JOIN projects p ON p.id = c.project_id
LEFT JOIN users AS assignee ON assignee.id = a.assignee_id
LEFT JOIN users AS reviewer ON reviewer.id = a.reviewer_id
LEFT JOIN users AS reviewed ON reviewed.id = a.reviewed_by
"""


def _item_dict(row: sqlite3.Row, tags: list[str]) -> dict:
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
        "project": row["project"],
        "tags": tags,
    }


def _fetch_item(con: sqlite3.Connection, clip_id: str, task_type: str) -> dict:
    row = con.execute(
        _ITEM_SELECT + " WHERE a.clip_id=? AND a.task_type=?",
        (clip_id, task_type),
    ).fetchone()
    if row is None:
        raise AssignmentNotFound((clip_id, task_type))
    return _item_dict(row, _clip_tags(con, clip_id))


def _account_id(con: sqlite3.Connection, username: str) -> int:
    row = con.execute(
        "SELECT id FROM users WHERE username=? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if row is None:
        raise UnknownAccount(username)
    return int(row["id"])


def items_payload(
    path: Path,
    *,
    project: str | None = None,
    tag: str | None = None,
) -> list[dict]:
    query = _ITEM_SELECT
    conditions: list[str] = []
    params: list[object] = []
    if project is not None:
        conditions.append("p.name = ?")
        params.append(project.strip())
    if tag is not None:
        conditions.append(
            "EXISTS (SELECT 1 FROM clip_tags t "
            "WHERE t.clip_id = a.clip_id AND t.tag = ?)"
        )
        params.append(tag.strip())
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY a.clip_id, a.task_type"
    con = connect(path)
    try:
        rows = con.execute(query, params).fetchall()
        tags_by_clip = {
            clip_id: _clip_tags(con, clip_id)
            for clip_id in {str(row["clip_id"]) for row in rows}
        }
        return [_item_dict(row, tags_by_clip[str(row["clip_id"])]) for row in rows]
    finally:
        con.close()


def _item_payload_for(con: sqlite3.Connection, row: sqlite3.Row, account: Account) -> dict:
    payload = _item_dict(row, _clip_tags(con, str(row["clip_id"])))
    payload["capabilities"] = capabilities.item_capabilities(
        state=row["state"],
        assignee_id=row["assignee_id"],
        reviewer_id=row["reviewer_id"],
        account_id=account.id,
        admin=account.admin,
        reviewer=account.reviewer,
    )
    return payload


def item_payload(path: Path, account: Account, clip_id: str, task_type: str) -> dict | None:
    """One item with this Account's capabilities; None when no Assignment exists."""
    con = connect(path)
    try:
        row = con.execute(
            _ITEM_SELECT + " WHERE a.clip_id=? AND a.task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if row is None:
            return None
        return _item_payload_for(con, row, account)
    finally:
        con.close()


def my_items(path: Path, account: Account) -> list[dict]:
    """Items this Account holds — as the annotator (assignee) or as the reviewer."""
    con = connect(path)
    try:
        rows = con.execute(
            _ITEM_SELECT + " WHERE a.assignee_id=? OR a.reviewer_id=?"
            " ORDER BY a.clip_id, a.task_type",
            (account.id, account.id),
        ).fetchall()
        return [_item_payload_for(con, row, account) for row in rows]
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
            "SELECT clip_id, task_type, state, assignee_id, reviewer_id FROM assignments "
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


def _actor_flags(con: sqlite3.Connection, account_id: int) -> tuple[bool, bool]:
    row = con.execute(
        "SELECT admin, reviewer FROM users WHERE id=?", (account_id,)
    ).fetchone()
    if row is None:
        raise UnknownAccount(account_id)
    return bool(row["admin"]), bool(row["reviewer"])


def _actor_capabilities(
    con: sqlite3.Connection, row: sqlite3.Row, account_id: int
) -> dict[str, bool]:
    """The one place a transition's permission comes from — HTTP and /api/me."""
    admin, reviewer = _actor_flags(con, account_id)
    return capabilities.item_capabilities(
        state=row["state"],
        assignee_id=row["assignee_id"],
        reviewer_id=row["reviewer_id"],
        account_id=account_id,
        admin=admin,
        reviewer=reviewer,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def submit_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Labeling -> Submitted. The assignee or an admin may submit; labels lock."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if row["state"] != "Labeling":
            raise AssignmentConflict(row["state"])
        if not _actor_capabilities(con, row, account_id)["submit"]:
            raise TransitionForbidden("Only the assignee or an admin can submit this item.")
        con.execute(
            "UPDATE assignments SET state='Submitted', note=NULL "
            "WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def recall_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Submitted -> Labeling. The assignee or an admin may recall before review."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if row["state"] != "Submitted":
            raise AssignmentConflict(row["state"])
        if not _actor_capabilities(con, row, account_id)["recall"]:
            raise TransitionForbidden("Only the assignee or an admin can recall this item.")
        con.execute(
            "UPDATE assignments SET state='Labeling', note=NULL, reviewer_id=NULL "
            "WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def assign_reviewer(
    path: Path, clip_id: str, task_type: str, username: str, *, account_id: int
) -> dict:
    """Submitted -> Reviewing. Admin assigns a reviewer other than the annotator."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if not _actor_capabilities(con, row, account_id)["assign_reviewer"]:
            # Non-admins never had this call; wrong state is a conflict for admins.
            admin, _reviewer = _actor_flags(con, account_id)
            if not admin:
                raise TransitionForbidden("Only an admin can assign a reviewer.")
            raise AssignmentConflict(row["state"])
        reviewer_id = _account_id(con, username)
        if row["assignee_id"] is not None and int(row["assignee_id"]) == reviewer_id:
            raise ReviewerIsAnnotator()
        con.execute(
            "UPDATE assignments SET state='Reviewing', reviewer_id=?, note=NULL "
            "WHERE clip_id=? AND task_type=?",
            (reviewer_id, clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def pass_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Reviewing -> Done. The assigned reviewer or an admin passes; Done is terminal."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if row["state"] != "Reviewing":
            raise AssignmentConflict(row["state"])
        if not _actor_capabilities(con, row, account_id)["pass"]:
            raise TransitionForbidden("Only the assigned reviewer or an admin can pass this item.")
        con.execute(
            "UPDATE assignments SET state='Done', reviewed_by=?, reviewed_at=?, note=NULL "
            "WHERE clip_id=? AND task_type=?",
            (account_id, _now_iso(), clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def reject_item(
    path: Path, clip_id: str, task_type: str, note: str, *, account_id: int
) -> dict:
    """Reviewing / Done -> Labeling with one short note. The reviewer or an admin rejects."""

    note = (note or "").strip()
    if not note:
        raise NoteRequired()

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        state = row["state"]
        if state not in ("Reviewing", "Done"):
            raise AssignmentConflict(state)
        if not _actor_capabilities(con, row, account_id)["reject"]:
            raise TransitionForbidden("Only the assigned reviewer or an admin can reject this item.")
        con.execute(
            "UPDATE assignments SET state='Labeling', note=?, reviewer_id=NULL, "
            "reviewed_by=NULL, reviewed_at=NULL WHERE clip_id=? AND task_type=?",
            (note, clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def rereview_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Done -> Submitted for a fresh review. A reviewer or an admin reopens it."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        if row["state"] != "Done":
            raise AssignmentConflict(row["state"])
        if not _actor_capabilities(con, row, account_id)["re_review"]:
            raise TransitionForbidden("Only a reviewer or an admin can send this item back for review.")
        con.execute(
            "UPDATE assignments SET state='Submitted', reviewer_id=NULL, note=NULL, "
            "reviewed_by=NULL, reviewed_at=NULL WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def deliver_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Record downstream consumption: set delivered_at if not already set.

    Delivery rides outside the state machine, so any state is deliverable and
    the first timestamp is kept. Admin and reviewer Accounts may set it.
    """

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        admin, reviewer = _actor_flags(con, account_id)
        if not (admin or reviewer):
            raise TransitionForbidden("Only an admin or a reviewer can mark delivery.")
        con.execute(
            "UPDATE assignments SET delivered_at=COALESCE(delivered_at, ?) "
            "WHERE clip_id=? AND task_type=?",
            (_now_iso(), clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def undeliver_item(path: Path, clip_id: str, task_type: str, *, account_id: int) -> dict:
    """Clear the delivered marker. Admin and reviewer Accounts may clear it."""

    def _do(con: sqlite3.Connection, row: sqlite3.Row) -> dict:
        admin, reviewer = _actor_flags(con, account_id)
        if not (admin or reviewer):
            raise TransitionForbidden("Only an admin or a reviewer can clear delivery.")
        con.execute(
            "UPDATE assignments SET delivered_at=NULL WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        )
        return _fetch_item(con, clip_id, task_type)

    return _with_assignment(path, clip_id, task_type, _do)


def _holding_counts(con: sqlite3.Connection) -> dict[int, int]:
    rows = con.execute(
        "SELECT assignee_id, COUNT(*) AS n FROM assignments "
        "WHERE assignee_id IS NOT NULL AND state IN ('Labeling', 'Submitted', 'Reviewing') "
        "GROUP BY assignee_id"
    ).fetchall()
    return {int(row["assignee_id"]): int(row["n"]) for row in rows}


def auto_assign_items(
    path: Path,
    *,
    usernames: list[str],
    items: list[tuple[str, str]] | None = None,
    clip_ids: list[str] | None = None,
    task_type: str | None = None,
    project: str | None = None,
) -> dict:
    """Assign Unassigned items to the given Accounts, always picking the lowest holder.

    "Holding count" is the Account's items in Labeling / Submitted / Reviewing: an
    item in flight keeps counting until it is Done. Ties break by username so the
    distribution is deterministic. `clip_ids` / `task_type` / `project` narrow the
    candidate set (board multi-select, Task type, study). `items` is an explicit
    (Clip, Task type) pick; anything in it that is not Unassigned is ignored.
    """
    names = list(dict.fromkeys(name.strip() for name in usernames if name.strip()))
    if not names:
        raise ValueError("at least one assignee is required")
    if task_type is not None and task_type not in TASK_TYPES:
        raise AssignmentNotFound(task_type)
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        user_ids = {name: _account_id(con, name) for name in names}
        query = (
            "SELECT a.clip_id, a.task_type FROM assignments a "
            "JOIN clips c ON c.id = a.clip_id "
            "JOIN projects p ON p.id = c.project_id "
            "WHERE a.state = 'Unassigned'"
        )
        params: list[object] = []
        if task_type is not None:
            query += " AND a.task_type = ?"
            params.append(task_type)
        if clip_ids:
            placeholders = ",".join("?" for _ in clip_ids)
            query += f" AND a.clip_id IN ({placeholders})"
            params.extend(clip_ids)
        if project is not None:
            query += " AND p.name = ?"
            params.append(project.strip())
        query += " ORDER BY a.clip_id, a.task_type"
        rows = con.execute(query, params).fetchall()
        if items is not None:
            wanted = set(items)
            rows = [row for row in rows if (row["clip_id"], row["task_type"]) in wanted]

        existing = _holding_counts(con)
        holding = {name: existing.get(user_ids[name], 0) for name in names}
        assigned = []
        for row in rows:
            chosen = min(names, key=lambda name: (holding[name], name))
            con.execute(
                "UPDATE assignments SET state='Labeling', assignee_id=? "
                "WHERE clip_id=? AND task_type=?",
                (user_ids[chosen], row["clip_id"], row["task_type"]),
            )
            holding[chosen] += 1
            assigned.append(
                {
                    "clip_id": row["clip_id"],
                    "task_type": row["task_type"],
                    "assignee": chosen,
                }
            )
        con.commit()
        return {"assigned": assigned, "counts": holding}
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def clip_version(path: Path, clip_id: str) -> int:
    con = connect(path)
    try:
        row = con.execute("SELECT version FROM clips WHERE id=?", (clip_id,)).fetchone()
        return 0 if row is None else int(row["version"])
    finally:
        con.close()


def _write_allowed(row: sqlite3.Row | None, account_id: int) -> bool:
    """Labeling: the assignee writes. Submitted/Done: nobody. Reviewing: the reviewer."""
    if row is None:
        return False
    admin, reviewer = False, False  # edit_labels never depends on a role flag
    return capabilities.item_capabilities(
        state=row["state"],
        assignee_id=row["assignee_id"],
        reviewer_id=row["reviewer_id"],
        account_id=account_id,
        admin=admin,
        reviewer=reviewer,
    )["edit_labels"]


def _account_name(con: sqlite3.Connection, account_id: int | None) -> str | None:
    if account_id is None:
        return None
    try:
        row = con.execute("SELECT username FROM accounts WHERE id=?", (int(account_id),)).fetchone()
    except sqlite3.OperationalError:  # a fixture DB with no accounts table
        return None
    return str(row["username"]) if row is not None else None


def _write_refusal(
    con: sqlite3.Connection, row: sqlite3.Row | None, task_type: str, account_id: int
) -> str:
    """Why this Account may not write these labels, in one sentence.

    The desk shows this where it used to show a bare "Forbidden": during the
    pilot an unexplained 403 read as a bug rather than as ownership.
    """
    if row is None:
        return f"This Clip has no {task_type} item yet — ask the admin to assign one."
    state = str(row["state"])
    if state == "Labeling":
        holder = _account_name(con, row["assignee_id"])
        if holder is None:
            return f"This Clip's {task_type} is not assigned to anyone — its assignee writes it."
        if int(row["assignee_id"]) == account_id:
            return f"This Clip's {task_type} is yours, but it is not in a writable state."
        return (
            f"This Clip's {task_type} is assigned to {holder}: only {holder} writes its labels."
        )
    if state == "Reviewing":
        holder = _account_name(con, row["reviewer_id"])
        who = f"its reviewer ({holder})" if holder else "its assigned reviewer"
        return f"This Clip's {task_type} is in Review — only {who} may edit its labels."
    if state in ("Submitted", "Done"):
        return (
            f"This Clip's {task_type} is {state}: its labels are frozen until it comes "
            "back to Labeling."
        )
    return f"Assign this Clip's {task_type} to a labeler before writing its labels."


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
            "SELECT state, assignee_id, reviewer_id FROM assignments WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if not _write_allowed(row, account_id):
            raise LabelWriteForbidden(_write_refusal(con, row, task_type, account_id))
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
            "SELECT state, assignee_id, reviewer_id FROM assignments WHERE clip_id=? AND task_type=?",
            (clip_id, task_type),
        ).fetchone()
        if not _write_allowed(row, account_id):
            raise LabelWriteForbidden(_write_refusal(con, row, task_type, account_id))
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
