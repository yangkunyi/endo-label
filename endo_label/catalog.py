"""Read-only Clip catalog over registered Clips in the coordination DB."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from endo_label.config import ClipEntry, Settings
from endo_label.coordination import db_path, list_registered_clips

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


class TranscodeError(CatalogError):
    """JPEG Clip could not be transcoded to mp4."""


def clip_entries(
    settings: Settings,
    *,
    project: str | None = None,
    tag: str | None = None,
) -> tuple[ClipEntry, ...]:
    return tuple(
        ClipEntry(id=row.id, kind=row.kind, path=row.path)
        for row in list_registered_clips(db_path(settings), project=project, tag=tag)
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


def _read_u32(fh, offset: int) -> int | None:
    fh.seek(offset)
    data = fh.read(4)
    if len(data) < 4:
        return None
    return int.from_bytes(data, "big")


def _boxes(fh, start: int, end: int):
    offset = start
    while offset + 8 <= end:
        size = _read_u32(fh, offset)
        fh.seek(offset + 4)
        typ = fh.read(4)
        if size is None or len(typ) < 4:
            break
        if size == 1:
            fh.seek(offset + 8)
            ext = fh.read(8)
            if len(ext) < 8:
                break
            size = int.from_bytes(ext, "big")
            header = 16
        elif size == 0:
            size = end - offset
            header = 8
        else:
            header = 8
        if size < 8 or offset + size > end:
            break
        yield typ, offset + header, offset + size
        offset += size


def _mvhd_seconds(fh, start: int, end: int) -> float | None:
    if end - start < 20:
        return None
    fh.seek(start)
    version = fh.read(1)[0]
    if version == 1:
        if end - start < 32:
            return None
        timescale = _read_u32(fh, start + 20)
        fh.seek(start + 24)
        duration_raw = fh.read(8)
        if timescale is None or len(duration_raw) < 8:
            return None
        duration = int.from_bytes(duration_raw, "big")
    else:
        timescale = _read_u32(fh, start + 12)
        duration = _read_u32(fh, start + 16)
        if timescale is None or duration is None:
            return None
    if timescale <= 0:
        return None
    return duration / timescale


def _stts_delta(fh, start: int, end: int) -> int | None:
    if end - start < 16:
        return None
    count = _read_u32(fh, start + 4)
    if not count:
        return None
    delta = _read_u32(fh, start + 12)
    return delta if delta and delta > 0 else None


def _mdhd_timescale(fh, start: int, end: int) -> int | None:
    if end - start < 20:
        return None
    fh.seek(start)
    version = fh.read(1)[0]
    if version == 1:
        if end - start < 24:
            return None
        return _read_u32(fh, start + 20)
    return _read_u32(fh, start + 12)


def _trak_fps(fh, start: int, end: int) -> int | None:
    timescale = None
    delta = None
    vide = False
    for typ, inner_start, inner_end in _boxes(fh, start, end):
        if typ != b"mdia":
            continue
        for inner, media_start, media_end in _boxes(fh, inner_start, inner_end):
            if inner == b"mdhd":
                timescale = _mdhd_timescale(fh, media_start, media_end)
            elif inner == b"minf":
                for leaf, leaf_start, leaf_end in _boxes(fh, media_start, media_end):
                    if leaf == b"vmhd":
                        vide = True
                    elif leaf == b"stbl":
                        for table, table_start, table_end in _boxes(fh, leaf_start, leaf_end):
                            if table == b"stts":
                                delta = _stts_delta(fh, table_start, table_end)
    if not vide or not timescale or not delta:
        return None
    return max(1, round(timescale / delta))


def _mp4_clock(path: Path) -> tuple[float | None, int | None]:
    seconds = None
    fps = None
    with path.open("rb") as fh:
        size = path.stat().st_size
        for typ, start, end in _boxes(fh, 0, size):
            if typ != b"moov":
                continue
            for inner, inner_start, inner_end in _boxes(fh, start, end):
                if inner == b"mvhd":
                    seconds = _mvhd_seconds(fh, inner_start, inner_end)
                elif inner == b"trak" and fps is None:
                    fps = _trak_fps(fh, inner_start, inner_end)
    return seconds, fps


def video_clock(path: Path) -> tuple[int, int]:
    """Return (frame_count, fps). fps is container fps, else 25."""
    fps = JPEG_CLOCK_FPS
    try:
        seconds, parsed_fps = _mp4_clock(path)
    except OSError:
        return 0, fps
    if parsed_fps:
        fps = parsed_fps
    if seconds is None:
        return 0, fps
    return max(1, round(seconds * fps)), fps


def video_path(settings: Settings, clip_id: str) -> Path:
    entry = _entry(settings, clip_id)
    if entry.kind != "video":
        raise ClipNotFound(clip_id)
    path = entry.path.resolve()
    if not path.is_file():
        raise ClipNotFound(clip_id)
    return path


def video_cache_root(settings: Settings) -> Path:
    if settings.video_cache_root is not None:
        return settings.video_cache_root
    return settings.labels_root.parent / "video-cache"


def _cache_is_fresh(cache: Path, clip_dir: Path, frames: list[Path]) -> bool:
    if not cache.is_file():
        return False
    cache_mtime = cache.stat().st_mtime
    if cache_mtime < clip_dir.stat().st_mtime:
        return False
    return all(cache_mtime >= frame.stat().st_mtime for frame in frames)


def _concat_escape(path: Path) -> str:
    return str(path.resolve()).replace("'", "'\\''")


def _run_transcode(frames: list[Path], out: Path, ffmpeg: str) -> None:
    """Encode the Frame list (in Frame order) to a 25 fps mp4 at ``out``."""
    list_path = out.with_suffix(".list")
    list_path.write_text(
        "ffconcat version 1.0\n"
        + "\n".join(
            f"file '{_concat_escape(frame)}'\nduration 0.04" for frame in frames
        )
        + "\n",
        encoding="utf-8",
    )
    try:
        proc = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-vf",
                "scale=trunc((iw+1)/2)*2:trunc((ih+1)/2)*2",
                "-r",
                "25",
                "-movflags",
                "+faststart",
                "-an",
                str(out),
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if proc.returncode != 0:
            tail = "\n".join(proc.stderr.splitlines()[-12:])
            raise TranscodeError(f"ffmpeg transcode failed: {tail}")
    except subprocess.TimeoutExpired as exc:
        raise TranscodeError("ffmpeg transcode timed out") from exc
    finally:
        list_path.unlink(missing_ok=True)


def ensure_transcoded(settings: Settings, clip_id: str) -> Path:
    """Return a playable mp4 for a JPEG Clip, transcoding lazily when stale."""
    entry = _entry(settings, clip_id)
    if entry.kind != "jpeg":
        raise ClipNotFound(clip_id)
    clip_dir = _clip_dir(settings, clip_id)
    frames = [frame.path for frame in list_frames(settings, clip_id)]
    if not frames:
        raise TranscodeError(f"Clip {clip_id} has no JPEG frames")
    cache_dir = video_cache_root(settings)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache = cache_dir / f"{clip_id}.mp4"
    if _cache_is_fresh(cache, clip_dir, frames):
        return cache
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise TranscodeError(
            "ffmpeg not found on PATH; install ffmpeg to play JPEG Clips"
        )
    tmp = cache.with_name(f"{clip_id}.tmp.mp4")
    _run_transcode(frames, tmp, ffmpeg)
    tmp.replace(cache)
    return cache


def media_path(settings: Settings, clip_id: str) -> Path:
    """Source media for playback: video file, or the transcoded JPEG cache."""
    entry = _entry(settings, clip_id)
    if entry.kind == "video":
        return video_path(settings, clip_id)
    return ensure_transcoded(settings, clip_id)


def source_path(settings: Settings, clip_id: str) -> Path:
    """The registered source media itself: the JPEG folder, or the video file.

    Clips are registered with their own path (ticket 10), so the source is the
    entry's path — never ``frames_root / clip_id``, the retired single-user
    layout that only happened to coincide when the ids were folder names.
    """
    entry = _entry(settings, clip_id)
    path = entry.path.resolve()
    if entry.kind == "jpeg":
        if not path.is_dir():
            raise ClipNotFound(clip_id)
    elif entry.kind == "video":
        if not path.is_file():
            raise ClipNotFound(clip_id)
    else:
        raise ClipNotFound(clip_id)
    return path


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
        frame_count, fps = video_clock(path)
        return {
            "id": entry.id,
            "kind": "video",
            "frame_count": frame_count,
            "fps": fps,
        }
    return None


def list_clips(
    settings: Settings,
    *,
    project: str | None = None,
    tag: str | None = None,
) -> list[dict]:
    clips: list[dict] = []
    for entry in clip_entries(settings, project=project, tag=tag):
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
