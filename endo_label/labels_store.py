"""JSON files for phase / class / triplet. Not the mask Annotation store."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from endo_label.config import Settings

KINDS = ("phase", "class", "triplet")

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
