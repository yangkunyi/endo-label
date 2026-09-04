"""JSON files for phase / class / triplet. Not the mask Annotation store."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from endo_label.config import Settings

KINDS = ("phase", "class", "triplet")
RENAME_LISTS = {"phases": "phase", "class_tags": "class"}
class TripletFrameCollision(Exception):
    """Renaming a triple would duplicate an exact triple on a Frame."""


_COLUMN_LISTS = ("instruments", "verbs", "targets")
_DEFAULT_VOCAB = {
    "phases": [],
    "class_tags": [],
    "triples": [],
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


def _same_triple(row: Any, instrument: str, verb: str, target: str) -> bool:
    return (
        isinstance(row, dict)
        and row.get("instrument") == instrument
        and row.get("verb") == verb
        and row.get("target") == target
    )


def vocab_has_triple(vocab: dict[str, Any], instrument: str, verb: str, target: str) -> bool:
    return any(_same_triple(row, instrument, verb, target) for row in vocab.get("triples") or [])


def _canonical_vocab(data: dict[str, Any]) -> dict[str, Any]:
    triples: list[dict[str, str]] = []
    for row in data.get("triples") or []:
        if not isinstance(row, dict):
            continue
        instrument = row.get("instrument")
        verb = row.get("verb")
        target = row.get("target")
        if isinstance(instrument, str) and isinstance(verb, str) and isinstance(target, str):
            triples.append({"instrument": instrument, "verb": verb, "target": target})
    return {
        "phases": list(data.get("phases") or []),
        "class_tags": list(data.get("class_tags") or []),
        "triples": triples,
    }


def _unique_triples_from_clips(settings: Settings) -> list[dict[str, str]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, str]] = []
    for path in _kind_json_paths(settings, "triplet"):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        frames = data.get("frames") or {}
        for key in sorted(frames, key=lambda item: int(item) if str(item).isdigit() else str(item)):
            for row in frames.get(key) or []:
                if not isinstance(row, dict):
                    continue
                instrument = row.get("instrument")
                verb = row.get("verb")
                target = row.get("target")
                if not isinstance(instrument, str) or not isinstance(verb, str) or not isinstance(target, str):
                    continue
                item = (instrument, verb, target)
                if item in seen:
                    continue
                seen.add(item)
                out.append({"instrument": instrument, "verb": verb, "target": target})
    return out


def load_vocab(settings: Settings) -> dict[str, Any]:
    raw = _read(vocab_path(settings), _DEFAULT_VOCAB)
    if any(key in raw for key in _COLUMN_LISTS):
        migrated = {
            "phases": list(raw.get("phases") or []),
            "class_tags": list(raw.get("class_tags") or []),
            "triples": _unique_triples_from_clips(settings),
        }
        save_vocab(settings, migrated)
        return migrated
    return _canonical_vocab(raw)


def save_vocab(settings: Settings, data: dict[str, Any]) -> None:
    _write(vocab_path(settings), _canonical_vocab(data))


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


def _pending_clip_rewrites(
    settings: Settings,
    kind: str,
    rewrite: Callable[[dict[str, Any]], dict[str, Any]],
) -> list[tuple[Path, dict[str, Any]]]:
    pending: list[tuple[Path, dict[str, Any]]] = []
    for path in _kind_json_paths(settings, kind):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        frames = data.get("frames") or {}
        rewritten = rewrite(frames)
        if rewritten == frames:
            continue
        data = dict(data)
        data.setdefault("clip_id", path.stem)
        data["frames"] = rewritten
        pending.append((path, data))
    return pending


def _commit_rewritten_clips_and_vocab(
    settings: Settings,
    pending: list[tuple[Path, dict[str, Any]]],
    vocab: dict[str, Any],
) -> dict[str, Any]:
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
    pending = _pending_clip_rewrites(
        settings,
        kind,
        lambda frames: _rewrite_frames(kind, frames, old, new),
    )
    return _commit_rewritten_clips_and_vocab(settings, pending, vocab)


def _drop_name_from_frames(kind: str, frames: dict[str, Any], name: str) -> dict[str, Any]:
    rewritten: dict[str, Any] = {}
    for key, value in frames.items():
        if kind == "phase":
            if value != name:
                rewritten[key] = value
            continue
        tags = [tag for tag in (value or []) if tag != name]
        if tags:
            rewritten[key] = tags
    return rewritten


def _drop_triple_from_frames(
    frames: dict[str, Any],
    instrument: str,
    verb: str,
    target: str,
) -> dict[str, Any]:
    rewritten: dict[str, Any] = {}
    for key, rows in frames.items():
        kept = [row for row in (rows or []) if not _same_triple(row, instrument, verb, target)]
        if kept:
            rewritten[key] = kept
    return rewritten


def delete_vocab_name(settings: Settings, list_name: str, name: str) -> dict[str, Any]:
    """Remove one list entry. Phase/class rewrite every Clip of that kind.

    Clip files are written first, then vocab. On failure, already-replaced
    Clip files are restored.
    """
    vocab = load_vocab(settings)
    bucket = list(vocab.get(list_name) or [])
    bucket.remove(name)
    vocab[list_name] = bucket
    kind = RENAME_LISTS[list_name]
    pending = _pending_clip_rewrites(
        settings,
        kind,
        lambda frames: _drop_name_from_frames(kind, frames, name),
    )
    return _commit_rewritten_clips_and_vocab(settings, pending, vocab)


def delete_vocab_triple(settings: Settings, instrument: str, verb: str, target: str) -> dict[str, Any]:
    """Remove one exact triple from Vocab and every Clip, or restore all."""
    vocab = load_vocab(settings)
    triples = list(vocab.get("triples") or [])
    kept = [row for row in triples if not _same_triple(row, instrument, verb, target)]
    if len(kept) == len(triples):
        raise KeyError((instrument, verb, target))
    vocab["triples"] = kept
    pending = _pending_clip_rewrites(
        settings,
        "triplet",
        lambda frames: _drop_triple_from_frames(frames, instrument, verb, target),
    )
    return _commit_rewritten_clips_and_vocab(settings, pending, vocab)


def rename_vocab_triple(
    settings: Settings,
    from_inst: str,
    from_verb: str,
    from_target: str,
    to_inst: str,
    to_verb: str,
    to_target: str,
) -> dict[str, Any]:
    """Rename one exact triple and rewrite every matching triplet row across Clips.

    If any Frame would hold two identical triples after rewrite, TripletFrameCollision is raised
    and no files are changed.
    If the target triple already exists in Vocab, ValueError is raised.
    Clip files are written first, then vocab. On failure, modified Clip files are restored.
    """
    vocab = load_vocab(settings)
    triples = list(vocab.get("triples") or [])
    from_idx = -1
    for idx, row in enumerate(triples):
        if _same_triple(row, from_inst, from_verb, from_target):
            from_idx = idx
            break
    if from_idx < 0:
        raise KeyError((from_inst, from_verb, from_target))

    if (from_inst, from_verb, from_target) == (to_inst, to_verb, to_target):
        return vocab

    for path in _kind_json_paths(settings, "triplet"):
        data = _read(path, {"clip_id": path.stem, "frames": {}})
        for frame_key, rows in (data.get("frames") or {}).items():
            from_count = sum(1 for row in (rows or []) if _same_triple(row, from_inst, from_verb, from_target))
            to_count = sum(1 for row in (rows or []) if _same_triple(row, to_inst, to_verb, to_target))
            if from_count > 0 and (to_count > 0 or from_count > 1):
                raise TripletFrameCollision(f"Frame {frame_key} would hold duplicate triple")

    if vocab_has_triple(vocab, to_inst, to_verb, to_target):
        raise ValueError(f"already present: {to_inst} / {to_verb} / {to_target}")

    triples[from_idx] = {"instrument": to_inst, "verb": to_verb, "target": to_target}
    vocab["triples"] = triples

    def _rewrite_frames(frames: dict[str, Any]) -> dict[str, Any]:
        rewritten: dict[str, Any] = {}
        for key, rows in frames.items():
            new_rows: list[dict[str, Any]] = []
            for row in rows or []:
                if _same_triple(row, from_inst, from_verb, from_target):
                    new_rows.append({
                        "id": row.get("id"),
                        "instrument": to_inst,
                        "verb": to_verb,
                        "target": to_target,
                    })
                else:
                    new_rows.append(row)
            rewritten[key] = new_rows
        return rewritten

    pending = _pending_clip_rewrites(settings, "triplet", _rewrite_frames)
    return _commit_rewritten_clips_and_vocab(settings, pending, vocab)
