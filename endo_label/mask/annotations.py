"""Disk Annotation store: per-Clip Tracks + per-Frame masks with Source/Review."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from endo_label import catalog
from endo_label.config import Settings
from endo_label.mask.mask_codec import MASK_FORMAT, is_rle_mask, public_mask_fields

SOURCES = frozenset({"manual", "refined", "propagated"})


class AnnotationError(Exception):
    """Base annotation failure."""


class AnnotationNotFound(AnnotationError):
    """No saved Annotation for this Clip."""


def is_protected(mask: dict[str, Any]) -> bool:
    """Protected Mask: Source manual/refined, or Review Decision accepted."""
    source = mask.get("source")
    if source in ("manual", "refined"):
        return True
    return mask.get("review_decision") == "accepted"


def _clip_ann_dir(settings: Settings, clip_id: str) -> Path:
    # Bare name only — same isolation idea as catalog
    if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
        raise catalog.ClipNotFound(clip_id)
    root = settings.annotations_root.resolve()
    path = (root / clip_id).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise catalog.ClipNotFound(clip_id) from exc
    return path


def annotation_path(settings: Settings, clip_id: str) -> Path:
    return _clip_ann_dir(settings, clip_id) / "annotation.json"


def empty_doc(clip_id: str) -> dict[str, Any]:
    return {"clip_id": clip_id, "tracks": [], "frames": {}}


def load(settings: Settings, clip_id: str) -> dict[str, Any]:
    path = annotation_path(settings, clip_id)
    if not path.is_file():
        raise AnnotationNotFound(clip_id)
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise AnnotationNotFound(clip_id)
    data.setdefault("clip_id", clip_id)
    data.setdefault("tracks", [])
    data.setdefault("frames", {})
    return data


def try_load(settings: Settings, clip_id: str) -> dict[str, Any] | None:
    try:
        return load(settings, clip_id)
    except AnnotationNotFound:
        return None


def _write_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
    tmp.replace(path)


def save_doc(settings: Settings, clip_id: str, doc: dict[str, Any]) -> Path:
    path = annotation_path(settings, clip_id)
    doc = dict(doc)
    doc["clip_id"] = clip_id
    _write_atomic(path, doc)
    return path


def frame_stem_for_index(settings: Settings, clip_id: str, frame_index: int) -> str:
    frames = catalog.list_frames(settings, clip_id)
    if frame_index < 0 or frame_index >= len(frames):
        raise catalog.FrameNotFound(f"{clip_id}[{frame_index}]")
    return frames[frame_index].stem


def index_for_stem(settings: Settings, clip_id: str, stem: str) -> int | None:
    for fr in catalog.list_frames(settings, clip_id):
        if fr.stem == stem:
            return fr.index
    return None


def _session_tracks_to_doc(
    settings: Settings,
    clip_id: str,
    tracks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Stem-keyed disk doc from Session table rows (index-keyed masks)."""
    frames_meta = catalog.list_frames(settings, clip_id)
    stem_by_index = {f.index: f.stem for f in frames_meta}

    track_rows: list[dict[str, Any]] = []
    frames: dict[str, dict[str, Any]] = {}

    for t in tracks:
        track_rows.append(
            {
                "track_id": int(t["track_id"]),
                "label": t.get("label") or f"track-{t['track_id']}",
                "color": t.get("color"),
                "score": t.get("score"),
            }
        )
        masks: dict[int, dict[str, Any]] = t.get("masks") or {}
        for fi, mask in masks.items():
            stem = stem_by_index.get(int(fi))
            if stem is None:
                continue
            entry = frames.setdefault(
                stem, {"frame_stem": stem, "frame_index": int(fi), "masks": []}
            )
            entry["masks"].append(_public_mask(int(t["track_id"]), mask))

    # Stable mask order per frame
    for entry in frames.values():
        entry["masks"].sort(key=lambda m: m["track_id"])

    track_rows.sort(key=lambda r: r["track_id"])
    return {"clip_id": clip_id, "tracks": track_rows, "frames": frames}


def load_rows(
    settings: Settings, clip_id: str
) -> list[dict[str, Any]] | None:
    """Annotation rows keyed by (track_id, frame_index). None if no disk file.

    Each item: {track_id, label, color, score, masks: {frame_index: mask}}.
    Stem mapping stays here. Non-rle_fg rows are skipped (ADR 0005).
    """
    doc = try_load(settings, clip_id)
    if doc is None:
        return None

    meta_by_id: dict[int, dict[str, Any]] = {
        int(t["track_id"]): t for t in (doc.get("tracks") or [])
    }
    tracks_by_id: dict[int, dict[str, Any]] = {}

    for stem, entry in (doc.get("frames") or {}).items():
        fi = entry.get("frame_index")
        if fi is None:
            fi = index_for_stem(settings, clip_id, stem)
        if fi is None:
            continue
        fi = int(fi)
        for m in entry.get("masks") or []:
            if not is_rle_mask(m):
                continue
            tid = int(m["track_id"])
            meta = meta_by_id.get(tid, {})
            track = tracks_by_id.get(tid)
            if track is None:
                track = {
                    "track_id": tid,
                    "label": meta.get("label") or f"track-{tid}",
                    "color": meta.get("color"),
                    "score": meta.get("score"),
                    "masks": {},
                }
                tracks_by_id[tid] = track
            payload = _public_mask(tid, m)
            payload.pop("track_id", None)
            track["masks"][fi] = payload

    return sorted(tracks_by_id.values(), key=lambda t: int(t["track_id"]))


def save_rows(
    settings: Settings,
    clip_id: str,
    tracks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Replace disk Annotation from Session table rows (index-keyed masks)."""
    doc = _session_tracks_to_doc(settings, clip_id, tracks)
    path = replace_doc(settings, clip_id, doc)
    return {
        "clip_id": clip_id,
        "track_count": len(doc.get("tracks") or []),
        "frame_count": len(doc.get("frames") or {}),
        "path": str(path),
    }


def auto_save_rows(
    settings: Settings,
    clip_id: str,
    tracks: list[dict[str, Any]],
) -> Path:
    """Propagate auto-save: merge non-protected Session rows onto disk."""
    doc = _session_tracks_to_doc(settings, clip_id, tracks)
    return auto_save_merge(settings, clip_id, doc)


def _public_mask(track_id: int, mask: dict[str, Any]) -> dict[str, Any]:
    decision = mask.get("review_decision")
    if decision == "":
        decision = None
    out = public_mask_fields(mask)
    out["track_id"] = track_id
    out["format"] = out.get("format") or MASK_FORMAT
    out["source"] = mask.get("source") or "manual"
    out["review_decision"] = decision
    return out


def merge_non_protected(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    """Merge incoming Annotation into existing; never overwrite Protected slots.

    Track registry: union by track_id (incoming wins label/color/score).
    Per Track-on-Frame: skip write when existing mask is Protected.
    """
    if existing is None:
        return incoming

    out = empty_doc(incoming.get("clip_id") or existing.get("clip_id") or "")
    by_id: dict[int, dict[str, Any]] = {
        int(t["track_id"]): dict(t) for t in existing.get("tracks") or []
    }
    for t in incoming.get("tracks") or []:
        by_id[int(t["track_id"])] = dict(t)
    out["tracks"] = sorted(by_id.values(), key=lambda r: int(r["track_id"]))

    frames: dict[str, dict[str, Any]] = {}
    # Start from existing frames
    for stem, entry in (existing.get("frames") or {}).items():
        frames[stem] = {
            "frame_stem": entry.get("frame_stem") or stem,
            "frame_index": entry.get("frame_index"),
            "masks": [dict(m) for m in (entry.get("masks") or [])],
        }

    for stem, entry in (incoming.get("frames") or {}).items():
        cur = frames.get(stem)
        if cur is None:
            frames[stem] = {
                "frame_stem": entry.get("frame_stem") or stem,
                "frame_index": entry.get("frame_index"),
                "masks": [dict(m) for m in (entry.get("masks") or [])],
            }
            continue
        by_tid = {int(m["track_id"]): dict(m) for m in cur.get("masks") or []}
        for m in entry.get("masks") or []:
            tid = int(m["track_id"])
            old = by_tid.get(tid)
            if old is not None and is_protected(old):
                continue
            by_tid[tid] = dict(m)
        cur["masks"] = sorted(by_tid.values(), key=lambda x: int(x["track_id"]))
        if entry.get("frame_index") is not None:
            cur["frame_index"] = entry["frame_index"]
        frames[stem] = cur

    out["frames"] = frames
    return out


def replace_doc(settings: Settings, clip_id: str, incoming: dict[str, Any]) -> Path:
    """Explicit Save: replace full Annotation for Clip with session snapshot."""
    return save_doc(settings, clip_id, incoming)


def auto_save_merge(settings: Settings, clip_id: str, incoming: dict[str, Any]) -> Path:
    """Propagate auto-save: merge only non-protected slots onto disk."""
    existing = try_load(settings, clip_id)
    merged = merge_non_protected(existing, incoming)
    return save_doc(settings, clip_id, merged)


def summary(settings: Settings, clip_id: str) -> dict[str, Any]:
    doc = load(settings, clip_id)
    frames_out: list[dict[str, Any]] = []
    for stem, entry in sorted(
        (doc.get("frames") or {}).items(),
        key=lambda kv: (kv[1].get("frame_index") is None, kv[1].get("frame_index"), kv[0]),
    ):
        masks = entry.get("masks") or []
        frames_out.append(
            {
                "frame_stem": entry.get("frame_stem") or stem,
                "frame_index": entry.get("frame_index"),
                "mask_count": len(masks),
            }
        )
    return {
        "clip_id": clip_id,
        "tracks": list(doc.get("tracks") or []),
        "frame_count": len(frames_out),
        "frames": frames_out,
        "path": str(annotation_path(settings, clip_id)),
    }


def frame_annotations(
    settings: Settings, clip_id: str, frame_index: int
) -> dict[str, Any]:
    doc = load(settings, clip_id)
    stem = frame_stem_for_index(settings, clip_id, frame_index)
    entry = (doc.get("frames") or {}).get(stem)
    masks = list(entry.get("masks") or []) if entry else []
    return {
        "clip_id": clip_id,
        "frame_index": frame_index,
        "frame_stem": stem,
        "masks": masks,
    }
