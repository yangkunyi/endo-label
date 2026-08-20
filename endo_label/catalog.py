"""Read-only Clip catalog over a Frame Pool allowlist."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from endo_label.config import Settings

_JPEG_SUFFIXES = {".jpg", ".jpeg", ".JPG", ".JPEG"}


@dataclass(frozen=True)
class FrameRef:
    index: int
    stem: str
    path: Path


class CatalogError(Exception):
    """Base catalog failure."""


class ClipNotFound(CatalogError):
    pass


class FrameNotFound(CatalogError):
    pass


def _clip_dir(settings: Settings, clip_id: str) -> Path:
    if clip_id not in settings.clip_allowlist:
        raise ClipNotFound(clip_id)
    # Reject path traversal: clip_id must be a bare directory name
    if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
        raise ClipNotFound(clip_id)
    path = (settings.frames_root / clip_id).resolve()
    try:
        path.relative_to(settings.frames_root.resolve())
    except ValueError as exc:
        raise ClipNotFound(clip_id) from exc
    if not path.is_dir():
        raise ClipNotFound(clip_id)
    return path


def _list_frame_files(clip_dir: Path) -> list[Path]:
    files = [
        p
        for p in clip_dir.iterdir()
        if p.is_file() and p.suffix in _JPEG_SUFFIXES
    ]

    def sort_key(p: Path) -> int:
        try:
            return int(p.stem)
        except ValueError:
            # Non-integer stems sort after all integer stems, by name
            return 10**18

    files.sort(key=lambda p: (sort_key(p), p.stem))
    return files


def list_frames(settings: Settings, clip_id: str) -> list[FrameRef]:
    files = _list_frame_files(_clip_dir(settings, clip_id))
    return [FrameRef(index=i, stem=p.stem, path=p) for i, p in enumerate(files)]


def list_clips(settings: Settings) -> list[dict]:
    clips: list[dict] = []
    for clip_id in settings.clip_allowlist:
        try:
            frames = list_frames(settings, clip_id)
        except ClipNotFound:
            continue
        clips.append({"id": clip_id, "frame_count": len(frames)})
    return clips


def clip_meta(settings: Settings, clip_id: str) -> dict:
    frames = list_frames(settings, clip_id)
    return {
        "id": clip_id,
        "frame_count": len(frames),
        "frames": [{"index": f.index, "stem": f.stem} for f in frames],
    }


def frame_path(settings: Settings, clip_id: str, frame_index: int) -> Path:
    if frame_index < 0:
        raise FrameNotFound(f"{clip_id}[{frame_index}]")
    frames = list_frames(settings, clip_id)
    if frame_index >= len(frames):
        raise FrameNotFound(f"{clip_id}[{frame_index}]")
    return frames[frame_index].path
