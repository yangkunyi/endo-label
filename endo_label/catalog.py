"""Read-only Clip catalog over a Frame Pool allowlist."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from endo_label.config import ClipEntry, Settings

_JPEG_SUFFIXES = {".jpg", ".jpeg", ".JPG", ".JPEG"}
JPEG_CLOCK_FPS = 25


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


def clip_entries(settings: Settings) -> tuple[ClipEntry, ...]:
    if settings.clips:
        return settings.clips
    return tuple(
        ClipEntry(id=clip_id, kind="jpeg", path=settings.frames_root / clip_id)
        for clip_id in settings.clip_allowlist
    )


def _entry(settings: Settings, clip_id: str) -> ClipEntry:
    for entry in clip_entries(settings):
        if entry.id == clip_id:
            return entry
    raise ClipNotFound(clip_id)


def _clip_dir(settings: Settings, clip_id: str) -> Path:
    entry = _entry(settings, clip_id)
    if entry.kind != "jpeg":
        raise ClipNotFound(clip_id)
    path = entry.path.resolve()
    if not settings.clips:
        if clip_id in ("", ".", "..") or "/" in clip_id or "\\" in clip_id:
            raise ClipNotFound(clip_id)
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


def _clip_row(entry: ClipEntry, settings: Settings) -> dict | None:
    if entry.kind == "jpeg":
        try:
            frames = list_frames(settings, entry.id)
        except ClipNotFound:
            return None
        return {
            "id": entry.id,
            "kind": "jpeg",
            "frame_count": len(frames),
            "fps": JPEG_CLOCK_FPS,
        }
    if entry.kind == "video":
        path = entry.path.resolve()
        if not path.is_file():
            return None
        return {
            "id": entry.id,
            "kind": "video",
            "frame_count": 0,
            "fps": JPEG_CLOCK_FPS,
        }
    return None


def list_clips(settings: Settings) -> list[dict]:
    clips: list[dict] = []
    for entry in clip_entries(settings):
        row = _clip_row(entry, settings)
        if row is not None:
            clips.append(row)
    return clips


def clip_meta(settings: Settings, clip_id: str) -> dict:
    entry = _entry(settings, clip_id)
    row = _clip_row(entry, settings)
    if row is None:
        raise ClipNotFound(clip_id)
    if entry.kind == "video":
        return {**row, "frames": []}
    frames = list_frames(settings, clip_id)
    return {
        **row,
        "frames": [{"index": f.index, "stem": f.stem} for f in frames],
    }


def frame_path(settings: Settings, clip_id: str, frame_index: int) -> Path:
    if frame_index < 0:
        raise FrameNotFound(f"{clip_id}[{frame_index}]")
    frames = list_frames(settings, clip_id)
    if frame_index >= len(frames):
        raise FrameNotFound(f"{clip_id}[{frame_index}]")
    return frames[frame_index].path
