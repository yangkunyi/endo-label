"""Vocab registry: stable ids, per-Project enablement, candidates."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from endo_label.coordination import ProjectNotFound, connect, list_projects

KINDS = ("phase", "class", "triplet")


class RegistryItemNotFound(Exception):
    """No registry row with that id."""


class CandidateNotFound(Exception):
    """No candidate row with that id."""


class RegistryConflict(Exception):
    """Active identity already exists."""


@dataclass(frozen=True)
class RegistryItem:
    id: int
    kind: str
    name: str
    instrument: str
    verb: str
    target: str
    archived: bool

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "instrument": self.instrument,
            "verb": self.verb,
            "target": self.target,
            "archived": self.archived,
        }


@dataclass(frozen=True)
class Candidate:
    id: int
    project_id: int
    kind: str
    name: str
    instrument: str
    verb: str
    target: str

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "kind": self.kind,
            "name": self.name,
            "instrument": self.instrument,
            "verb": self.verb,
            "target": self.target,
        }


def _item_from_row(row: sqlite3.Row) -> RegistryItem:
    return RegistryItem(
        id=row["id"],
        kind=row["kind"],
        name=row["name"],
        instrument=row["instrument"],
        verb=row["verb"],
        target=row["target"],
        archived=bool(row["archived"]),
    )


def _candidate_from_row(row: sqlite3.Row) -> Candidate:
    return Candidate(
        id=row["id"],
        project_id=row["project_id"],
        kind=row["kind"],
        name=row["name"],
        instrument=row["instrument"],
        verb=row["verb"],
        target=row["target"],
    )


def normalize_identity(
    kind: str,
    *,
    name: str = "",
    instrument: str = "",
    verb: str = "",
    target: str = "",
) -> tuple[str, str, str, str, str]:
    kind = kind.strip()
    if kind not in KINDS:
        raise ValueError(f"unknown kind: {kind}")
    if kind in ("phase", "class"):
        name = name.strip()
        if not name:
            raise ValueError("name is required")
        return kind, name, "", "", ""
    instrument, verb, target = instrument.strip(), verb.strip(), target.strip()
    if not instrument or not verb or not target:
        raise ValueError("empty name")
    return kind, "", instrument, verb, target


def _require_project(con: sqlite3.Connection, project_id: int) -> None:
    row = con.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone()
    if row is None:
        raise ProjectNotFound(project_id)


def create_item(
    path: Path,
    kind: str,
    *,
    name: str = "",
    instrument: str = "",
    verb: str = "",
    target: str = "",
) -> RegistryItem:
    kind, name, instrument, verb, target = normalize_identity(
        kind, name=name, instrument=instrument, verb=verb, target=target
    )
    con = connect(path)
    try:
        try:
            cur = con.execute(
                "INSERT INTO vocab_registry (kind, name, instrument, verb, target) "
                "VALUES (?, ?, ?, ?, ?)",
                (kind, name, instrument, verb, target),
            )
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise RegistryConflict(_conflict_label(kind, name, instrument, verb, target)) from exc
        return RegistryItem(
            id=int(cur.lastrowid),
            kind=kind,
            name=name,
            instrument=instrument,
            verb=verb,
            target=target,
            archived=False,
        )
    finally:
        con.close()


def _conflict_label(kind: str, name: str, instrument: str, verb: str, target: str) -> str:
    if kind == "triplet":
        return f"{instrument} / {verb} / {target}"
    return name


def get_item(path: Path, vocab_id: int) -> RegistryItem:
    con = connect(path)
    try:
        row = con.execute("SELECT * FROM vocab_registry WHERE id=?", (vocab_id,)).fetchone()
        if row is None:
            raise RegistryItemNotFound(vocab_id)
        return _item_from_row(row)
    finally:
        con.close()


def list_items(path: Path) -> list[RegistryItem]:
    con = connect(path)
    try:
        rows = con.execute("SELECT * FROM vocab_registry ORDER BY id").fetchall()
        return [_item_from_row(row) for row in rows]
    finally:
        con.close()


def rename_item(
    path: Path,
    vocab_id: int,
    *,
    name: str = "",
    instrument: str = "",
    verb: str = "",
    target: str = "",
) -> RegistryItem:
    con = connect(path)
    try:
        row = con.execute("SELECT * FROM vocab_registry WHERE id=?", (vocab_id,)).fetchone()
        if row is None:
            raise RegistryItemNotFound(vocab_id)
        kind, name, instrument, verb, target = normalize_identity(
            row["kind"], name=name, instrument=instrument, verb=verb, target=target
        )
        try:
            con.execute(
                "UPDATE vocab_registry SET name=?, instrument=?, verb=?, target=? WHERE id=?",
                (name, instrument, verb, target, vocab_id),
            )
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise RegistryConflict(_conflict_label(kind, name, instrument, verb, target)) from exc
        return RegistryItem(
            id=vocab_id,
            kind=kind,
            name=name,
            instrument=instrument,
            verb=verb,
            target=target,
            archived=bool(row["archived"]),
        )
    finally:
        con.close()


def set_archived(path: Path, vocab_id: int, archived: bool) -> RegistryItem:
    con = connect(path)
    try:
        row = con.execute("SELECT * FROM vocab_registry WHERE id=?", (vocab_id,)).fetchone()
        if row is None:
            raise RegistryItemNotFound(vocab_id)
        try:
            con.execute(
                "UPDATE vocab_registry SET archived=? WHERE id=?",
                (int(archived), vocab_id),
            )
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise RegistryConflict(row["name"] or _conflict_label(
                row["kind"], row["name"], row["instrument"], row["verb"], row["target"]
            )) from exc
        return RegistryItem(
            id=vocab_id,
            kind=row["kind"],
            name=row["name"],
            instrument=row["instrument"],
            verb=row["verb"],
            target=row["target"],
            archived=archived,
        )
    finally:
        con.close()


def set_enabled(path: Path, vocab_id: int, project_id: int, enabled: bool) -> None:
    con = connect(path)
    try:
        item = con.execute("SELECT id FROM vocab_registry WHERE id=?", (vocab_id,)).fetchone()
        if item is None:
            raise RegistryItemNotFound(vocab_id)
        _require_project(con, project_id)
        if enabled:
            con.execute(
                "INSERT OR IGNORE INTO project_vocab_enabled (project_id, vocab_id) VALUES (?, ?)",
                (project_id, vocab_id),
            )
        else:
            con.execute(
                "DELETE FROM project_vocab_enabled WHERE project_id=? AND vocab_id=?",
                (project_id, vocab_id),
            )
        con.commit()
    finally:
        con.close()


def list_enabled_ids(path: Path) -> dict[int, list[int]]:
    con = connect(path)
    try:
        rows = con.execute(
            "SELECT project_id, vocab_id FROM project_vocab_enabled ORDER BY project_id, vocab_id"
        ).fetchall()
        grouped: dict[int, list[int]] = {}
        for row in rows:
            grouped.setdefault(row["project_id"], []).append(row["vocab_id"])
        return grouped
    finally:
        con.close()


def visible_items(path: Path, project_id: int) -> list[RegistryItem]:
    con = connect(path)
    try:
        _require_project(con, project_id)
        rows = con.execute(
            """
            SELECT vocab_registry.*
            FROM project_vocab_enabled
            JOIN vocab_registry ON vocab_registry.id = project_vocab_enabled.vocab_id
            WHERE project_vocab_enabled.project_id = ?
              AND vocab_registry.archived = 0
            ORDER BY vocab_registry.id
            """,
            (project_id,),
        ).fetchall()
        return [_item_from_row(row) for row in rows]
    finally:
        con.close()


def list_candidates(path: Path) -> list[Candidate]:
    con = connect(path)
    try:
        rows = con.execute(
            "SELECT * FROM project_vocab_candidates ORDER BY id"
        ).fetchall()
        return [_candidate_from_row(row) for row in rows]
    finally:
        con.close()


def create_candidate(
    path: Path,
    project_id: int,
    kind: str,
    *,
    name: str = "",
    instrument: str = "",
    verb: str = "",
    target: str = "",
) -> Candidate:
    kind, name, instrument, verb, target = normalize_identity(
        kind, name=name, instrument=instrument, verb=verb, target=target
    )
    con = connect(path)
    try:
        _require_project(con, project_id)
        cur = con.execute(
            "INSERT INTO project_vocab_candidates "
            "(project_id, kind, name, instrument, verb, target) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, kind, name, instrument, verb, target),
        )
        con.commit()
        return Candidate(
            id=int(cur.lastrowid),
            project_id=project_id,
            kind=kind,
            name=name,
            instrument=instrument,
            verb=verb,
            target=target,
        )
    finally:
        con.close()


def edit_candidate(
    path: Path,
    candidate_id: int,
    *,
    name: str = "",
    instrument: str = "",
    verb: str = "",
    target: str = "",
) -> Candidate:
    con = connect(path)
    try:
        row = con.execute(
            "SELECT * FROM project_vocab_candidates WHERE id=?", (candidate_id,)
        ).fetchone()
        if row is None:
            raise CandidateNotFound(candidate_id)
        kind, name, instrument, verb, target = normalize_identity(
            row["kind"], name=name, instrument=instrument, verb=verb, target=target
        )
        con.execute(
            "UPDATE project_vocab_candidates SET name=?, instrument=?, verb=?, target=? WHERE id=?",
            (name, instrument, verb, target, candidate_id),
        )
        con.commit()
        return Candidate(
            id=candidate_id,
            project_id=row["project_id"],
            kind=kind,
            name=name,
            instrument=instrument,
            verb=verb,
            target=target,
        )
    finally:
        con.close()


def promote_candidate(path: Path, candidate_id: int) -> RegistryItem:
    con = connect(path)
    try:
        row = con.execute(
            "SELECT * FROM project_vocab_candidates WHERE id=?", (candidate_id,)
        ).fetchone()
        if row is None:
            raise CandidateNotFound(candidate_id)
        try:
            cur = con.execute(
                "INSERT INTO vocab_registry (kind, name, instrument, verb, target) "
                "VALUES (?, ?, ?, ?, ?)",
                (row["kind"], row["name"], row["instrument"], row["verb"], row["target"]),
            )
        except sqlite3.IntegrityError as exc:
            raise RegistryConflict(
                _conflict_label(
                    row["kind"], row["name"], row["instrument"], row["verb"], row["target"]
                )
            ) from exc
        vocab_id = int(cur.lastrowid)
        con.execute(
            "INSERT OR IGNORE INTO project_vocab_enabled (project_id, vocab_id) VALUES (?, ?)",
            (row["project_id"], vocab_id),
        )
        con.execute("DELETE FROM project_vocab_candidates WHERE id=?", (candidate_id,))
        con.commit()
        return RegistryItem(
            id=vocab_id,
            kind=row["kind"],
            name=row["name"],
            instrument=row["instrument"],
            verb=row["verb"],
            target=row["target"],
            archived=False,
        )
    finally:
        con.close()


def browse_payload(path: Path) -> dict:
    items = [item.as_dict() for item in list_items(path)]
    enabled = list_enabled_ids(path)
    candidates_by_project: dict[int, list[dict]] = {}
    for candidate in list_candidates(path):
        candidates_by_project.setdefault(candidate.project_id, []).append(candidate.as_dict())
    projects = []
    for project in list_projects(path):
        projects.append(
            {
                "id": project.id,
                "name": project.name,
                "enabled_ids": enabled.get(project.id, []),
                "candidates": candidates_by_project.get(project.id, []),
            }
        )
    return {"items": items, "projects": projects}
