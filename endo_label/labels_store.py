"""JSON files for phase / class / triplet. Not the mask Annotation store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from endo_label.config import Settings

KINDS = ("phase", "class", "triplet")
RENAME_LISTS = {"phases": "phase", "class_tags": "class"}

_DEFAULT_VOCAB = {
    "phases": [
        "Preparation",
        "Calot triangle dissection",
        "Clipping and cutting",
        "Gallbladder dissection",
    ],
    "class_tags": ["grasper", "hook", "clipper", "scissors", "blurred"],
    "instruments": ["grasper", "hook", "clipper", "bipolar"],
    "verbs": ["grasp", "retract", "dissect", "cut", "clip"],
    "targets": ["gallbladder", "cystic-duct", "cystic-artery", "omentum"],
}


def _kind_dir(settings: Settings, kind: str) -> Path:
    if kind not in KINDS:
        raise ValueError(f"unknown kind: {kind}")
    return settings.labels_root / kind


def clip_path(settings: Settings, kind: str, clip_id: str) -> Path:
    if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
        raise ValueError(f"bad clip_id: {clip_id}")
    return _kind_dir(settings, kind) / f"{clip_id}.json"


def vocab_path(settings: Settings) -> Path:
    return settings.labels_root / "vocab.json"


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


def load_vocab(settings: Settings) -> dict[str, Any]:
    data = _read(vocab_path(settings), _DEFAULT_VOCAB)
    for key, seed in _DEFAULT_VOCAB.items():
        data.setdefault(key, list(seed))
    return data


def save_vocab(settings: Settings, data: dict[str, Any]) -> None:
    _write(vocab_path(settings), data)


def _kind_json_paths(settings: Settings, kind: str) -> list[Path]:
    folder = _kind_dir(settings, kind)
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.glob("*.json") if path.is_file())


def _rewrite_frames(kind: str, frames: dict[str, Any], old: str, new: str) -> dict[str, Any]:
    rewritten: dict[str, Any] = {}
    for key, value in frames.items():
        if kind == "phase":
            rewritten[key] = new if value == old else value
            continue
        tags = [new if tag == old else tag for tag in (value or [])]
        tags = list(dict.fromkeys(tags))
        if tags:
            rewritten[key] = tags
    return rewritten


def rename_vocab_name(settings: Settings, list_name: str, old: str, new: str) -> dict[str, Any]:
    """Rename one list entry and rewrite every Clip document of that kind.

    Clip files are written first, then vocab. On failure, already-replaced
    Clip files are restored so no Clip is left partially renamed.
    """
    kind = RENAME_LISTS[list_name]
    vocab = load_vocab(settings)
    bucket = list(vocab.get(list_name) or [])
    bucket[bucket.index(old)] = new
    vocab[list_name] = bucket

    pending: list[tuple[Path, dict[str, Any]]] = []
    for path in _kind_json_paths(settings, kind):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        frames = data.get("frames") or {}
        rewritten = _rewrite_frames(kind, frames, old, new)
        if rewritten == frames:
            continue
        data = dict(data)
        data.setdefault("clip_id", path.stem)
        data["frames"] = rewritten
        pending.append((path, data))

    backups: list[tuple[Path, bytes | None]] = []
    try:
        for path, data in pending:
            backups.append((path, path.read_bytes() if path.is_file() else None))
            _write(path, data)
        save_vocab(settings, vocab)
    except Exception:
        for path, blob in reversed(backups):
            if blob is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(blob)
        raise
    return vocab
