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


@dataclass(frozen=True)
class Settings:
    frames_root: Path
    clip_allowlist: tuple[str, ...]
    clips: tuple[ClipEntry, ...] = ()
    annotations_root: Path = field(default_factory=_default_annotations_root)
    labels_root: Path = field(default_factory=_default_labels_root)
    auto_save_on_propagate: bool = True
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
        entries.append(ClipEntry(id=clip_id, kind=kind, path=_resolve_path(str(raw_path).strip(), base)))
    return tuple(entries)


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
    clips = _parse_clips(data.get("clips"), path, base)
    frames_raw = data.get("frames_root")
    if frames_raw is None or not str(frames_raw).strip():
        if not clips:
            raise ConfigError(f"{path}: frames_root is required")
        frames_root = clips[0].path if clips[0].kind == "jpeg" else clips[0].path.parent
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

    allowlist = tuple(entry.id for entry in clips) if clips else _clip_allowlist(data.get("clip_allowlist"), path)
    return Settings(
        frames_root=frames_root,
        clip_allowlist=allowlist,
        clips=clips,
        annotations_root=annotations_root,
        labels_root=labels_root,
    )
