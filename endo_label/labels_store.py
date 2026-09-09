"""JSON files for phase / class / triplet. Not the mask Annotation store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from endo_label.config import Settings

KINDS = ("phase", "class", "triplet")


def _kind_dir(settings: Settings, kind: str) -> Path:
    if kind not in KINDS:
        raise ValueError(f"unknown kind: {kind}")
    return settings.labels_root / kind


def clip_path(settings: Settings, kind: str, clip_id: str) -> Path:
    if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
        raise ValueError(f"bad clip_id: {clip_id}")
    return _kind_dir(settings, kind) / f"{clip_id}.json"


def _read(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file():
        return dict(fallback)
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        return dict(fallback)
    return data


def _write(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
    tmp.replace(path)


def load_clip(settings: Settings, kind: str, clip_id: str) -> dict[str, Any]:
    path = clip_path(settings, kind, clip_id)
    empty = {"clip_id": clip_id, "frames": {}}
    data = _read(path, empty)
    data.setdefault("clip_id", clip_id)
    data.setdefault("frames", {})
    return data


def save_clip(settings: Settings, kind: str, clip_id: str, data: dict[str, Any]) -> None:
    data = dict(data)
    data["clip_id"] = clip_id
    data.setdefault("frames", {})
    _write(clip_path(settings, kind, clip_id), data)


def _kind_json_paths(settings: Settings, kind: str) -> list[Path]:
    folder = _kind_dir(settings, kind)
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.glob("*.json") if path.is_file())


def stored_id(value: Any) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return None


def http_phase(doc: dict[str, Any], names: dict[int, str]) -> dict[str, Any]:
    frames: dict[str, str] = {}
    for key, value in (doc.get("frames") or {}).items():
        vocab_id = stored_id(value)
        if vocab_id is None:
            continue
        name = names.get(vocab_id)
        if name is None:
            continue
        frames[str(key)] = name
    return {"clip_id": doc.get("clip_id"), "frames": frames}


def http_class(doc: dict[str, Any], names: dict[int, str]) -> dict[str, Any]:
    frames: dict[str, list[str]] = {}
    for key, values in (doc.get("frames") or {}).items():
        tags: list[str] = []
        for value in values or []:
            vocab_id = stored_id(value)
            if vocab_id is None:
                continue
            name = names.get(vocab_id)
            if name is not None:
                tags.append(name)
        if tags:
            frames[str(key)] = tags
    return {"clip_id": doc.get("clip_id"), "frames": frames}


def http_triplet_row(
    row: dict[str, Any],
    triples: dict[int, tuple[str, str, str]],
) -> dict[str, Any] | None:
    vocab_id = stored_id(row.get("vocab_id"))
    if vocab_id is None:
        return None
    cells = triples.get(vocab_id)
    if cells is None:
        return None
    instrument, verb, target = cells
    return {
        "id": row.get("id"),
        "instrument": instrument,
        "verb": verb,
        "target": target,
    }


def http_triplet(
    doc: dict[str, Any],
    triples: dict[int, tuple[str, str, str]],
) -> dict[str, Any]:
    frames: dict[str, list[dict[str, Any]]] = {}
    for key, rows in (doc.get("frames") or {}).items():
        out: list[dict[str, Any]] = []
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            viewed = http_triplet_row(row, triples)
            if viewed is not None:
                out.append(viewed)
        if out:
            frames[str(key)] = out
    return {"clip_id": doc.get("clip_id"), "frames": frames}


def referenced_vocab_ids(settings: Settings) -> set[int]:
    used: set[int] = set()
    for path in _kind_json_paths(settings, "phase"):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        for value in (data.get("frames") or {}).values():
            vocab_id = stored_id(value)
            if vocab_id is not None:
                used.add(vocab_id)
    for path in _kind_json_paths(settings, "class"):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        for values in (data.get("frames") or {}).values():
            for value in values or []:
                vocab_id = stored_id(value)
                if vocab_id is not None:
                    used.add(vocab_id)
    for path in _kind_json_paths(settings, "triplet"):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        for rows in (data.get("frames") or {}).values():
            for row in rows or []:
                if not isinstance(row, dict):
                    continue
                vocab_id = stored_id(row.get("vocab_id"))
                if vocab_id is not None:
                    used.add(vocab_id)
    return used
