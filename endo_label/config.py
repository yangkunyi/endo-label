"""Sitting settings from YAML (Frame Pool read; Annotation / labels write roots)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


class ConfigError(Exception):
    """Sitting config file missing or invalid."""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


_OLD_TOOL = Path("/data3/yky/sam3_1_label_tool")


def _default_annotations_root() -> Path:
    return _repo_root() / "data" / "mask"


def _default_labels_root() -> Path:
    return _repo_root() / "data" / "labels"


def _default_sam31_repo() -> Path:
    # SAM code stays in the old tree; this repo does not vendor sam3/.
    return _OLD_TOOL / "sam3"


def _default_sam31_checkpoint() -> Path:
    return _OLD_TOOL / "sam31_label_kit" / "ckpt" / "sam3.1_multiplex.pt"


@dataclass(frozen=True)
class ClipEntry:
    id: str
    kind: str
    path: Path
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class ProjectSpec:
    name: str
    hospital: str
    clips: tuple[ClipEntry, ...] = ()


@dataclass(frozen=True)
class Settings:
    frames_root: Path
    clip_allowlist: tuple[str, ...]
    clips: tuple[ClipEntry, ...] = ()
    projects: tuple[ProjectSpec, ...] = ()
    annotations_root: Path = field(default_factory=_default_annotations_root)
    labels_root: Path = field(default_factory=_default_labels_root)
    auto_save_on_propagate: bool = True
    # Derived cache root for lazy JPEG transcode (labels_root.parent / "video-cache").
    video_cache_root: Path | None = None
    # Worker / SAM 3.1 (ticket 07). Default backend is fake (no GPU; CI).
    predictor_backend: str = "fake"  # "fake" | "sam31"
    sam31_checkpoint: Path = field(default_factory=_default_sam31_checkpoint)
    sam31_repo: Path = field(default_factory=_default_sam31_repo)
    gpu_id: int | None = None
    # Scribble Model worker (ADR 0009). Default fake: no GPU in CI.
    scribble_backend: str = "fake"  # "fake" | "scribble"
    scribble_model_path: Path | None = None
    scribble_sam2_checkpoint: Path | None = None
    # None / unset SCRIBBLE_GPU_ID: share this Session's gpu_id. Do not default 0/1/5.
    scribble_gpu_id: int | None = None
    # Coordination SQLite (WAL). None → labels_root.parent / "coordination.sqlite".
    coordination_db: Path | None = None
    session_cookie_secure: bool = False


def default_config_path() -> Path:
    return _repo_root() / "config.yaml"


def _resolve_path(raw: str, base: Path) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = base / path
    return path.resolve()


def _clip_allowlist(value: object, path: Path) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        name = value.strip()
        return (name,) if name else ()
    if isinstance(value, list):
        return tuple(str(item).strip() for item in value if str(item).strip())
    raise ConfigError(f"{path}: clip_allowlist must be a list of Clip ids")


def _parse_clips(value: object, path: Path, base: Path) -> tuple[ClipEntry, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ConfigError(f"{path}: clips must be a list")
    entries: list[ClipEntry] = []
    for item in value:
        if not isinstance(item, dict):
            raise ConfigError(f"{path}: each clips entry must be a mapping")
        clip_id = str(item.get("id") or "").strip()
        kind = str(item.get("kind") or "").strip()
        raw_path = item.get("path")
        if not clip_id or not kind or raw_path is None or not str(raw_path).strip():
            continue
        entries.append(
            ClipEntry(
                id=clip_id,
                kind=kind,
                path=_resolve_path(str(raw_path).strip(), base),
                tags=_parse_tags(item.get("tags"), path),
            )
        )
    return tuple(entries)


def _parse_tags(value: object, path: Path) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return tuple(tag.strip() for tag in value.split(",") if tag.strip())
    if isinstance(value, list):
        return tuple(str(tag).strip() for tag in value if str(tag).strip())
    raise ConfigError(f"{path}: Clip tags must be a list of strings")


def _parse_projects(value: object, path: Path, base: Path) -> tuple[ProjectSpec, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ConfigError(f"{path}: projects must be a list")
    specs: list[ProjectSpec] = []
    seen_ids: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise ConfigError(f"{path}: each projects entry must be a mapping")
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        hospital = str(item.get("hospital") or "").strip()
        clips = _parse_clips(item.get("clips"), path, base)
        for clip in clips:
            if clip.id in seen_ids:
                raise ConfigError(f"{path}: duplicate Clip id {clip.id}")
            seen_ids.add(clip.id)
        specs.append(ProjectSpec(name=name, hospital=hospital, clips=clips))
    return tuple(specs)


def _parse_backend(
    value: object, path: Path, key: str, allowed: tuple[str, ...], default: str
) -> str:
    if value is None:
        return default
    text = str(value).strip()
    if text not in allowed:
        raise ConfigError(f"{path}: {key} must be one of {' / '.join(allowed)}")
    return text


def _optional_path(value: object, base: Path) -> Path | None:
    if value is None or not str(value).strip():
        return None
    return _resolve_path(str(value).strip(), base)


def _optional_int(value: object, path: Path, key: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{path}: {key} must be an integer") from None


def load_settings(config_path: Path | str | None = None) -> Settings:
    path = Path(config_path) if config_path is not None else default_config_path()
    if not path.is_file():
        raise ConfigError(
            f"config file not found: {path}\n"
            "Sitting reads repo-root config.yaml or --config PATH. "
            "It does not read FRAMES_ROOT / CLIP_ALLOWLIST / other env."
        )

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"invalid YAML in {path}: {exc}") from exc
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ConfigError(f"invalid YAML in {path}: expected a mapping")

    base = path.parent
    projects = _parse_projects(data.get("projects"), path, base)
    clips = _parse_clips(data.get("clips"), path, base)
    nested_clips = tuple(clip for spec in projects for clip in spec.clips)
    catalog_clips = nested_clips or clips
    frames_raw = data.get("frames_root")
    if frames_raw is None or not str(frames_raw).strip():
        if not catalog_clips:
            raise ConfigError(f"{path}: frames_root is required")
        frames_root = (
            catalog_clips[0].path
            if catalog_clips[0].kind == "jpeg"
            else catalog_clips[0].path.parent
        )
    else:
        frames_root = _resolve_path(str(frames_raw).strip(), base)

    labels_raw = data.get("labels_root")
    if labels_raw is None or not str(labels_raw).strip():
        labels_root = _default_labels_root()
    else:
        labels_root = _resolve_path(str(labels_raw).strip(), base)

    ann_raw = data.get("annotations_root")
    if ann_raw is None or not str(ann_raw).strip():
        annotations_root = _default_annotations_root()
    else:
        annotations_root = _resolve_path(str(ann_raw).strip(), base)

    cache_raw = data.get("video_cache_root")
    if cache_raw is None or not str(cache_raw).strip():
        video_cache_root = None
    else:
        video_cache_root = _resolve_path(str(cache_raw).strip(), base)

    allowlist = (
        tuple(entry.id for entry in catalog_clips)
        if catalog_clips
        else _clip_allowlist(data.get("clip_allowlist"), path)
    )

    coord_raw = data.get("coordination_db")
    if coord_raw is None or not str(coord_raw).strip():
        coordination_db = None
    else:
        coordination_db = _resolve_path(str(coord_raw).strip(), base)

    secure_raw = data.get("session_cookie_secure")
    session_cookie_secure = bool(secure_raw)

    return Settings(
        frames_root=frames_root,
        clip_allowlist=allowlist,
        clips=clips,
        projects=projects,
        annotations_root=annotations_root,
        labels_root=labels_root,
        video_cache_root=video_cache_root,
        predictor_backend=_parse_backend(
            data.get("predictor_backend"), path, "predictor_backend", ("fake", "sam31"), "fake"
        ),
        sam31_checkpoint=_optional_path(data.get("sam31_checkpoint"), base)
        or _default_sam31_checkpoint(),
        sam31_repo=_optional_path(data.get("sam31_repo"), base) or _default_sam31_repo(),
        gpu_id=_optional_int(data.get("gpu_id"), path, "gpu_id"),
        scribble_backend=_parse_backend(
            data.get("scribble_backend"), path, "scribble_backend", ("fake", "scribble"), "fake"
        ),
        scribble_model_path=_optional_path(data.get("scribble_model_path"), base),
        scribble_sam2_checkpoint=_optional_path(data.get("scribble_sam2_checkpoint"), base),
        scribble_gpu_id=_optional_int(data.get("scribble_gpu_id"), path, "scribble_gpu_id"),
        coordination_db=coordination_db,
        session_cookie_secure=session_cookie_secure,
    )
