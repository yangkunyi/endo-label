"""Service settings from environment (Frame Pool read; Annotation write root)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


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
class Settings:
    frames_root: Path
    clip_allowlist: tuple[str, ...]
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


def load_settings() -> Settings:
    root_raw = os.environ.get("FRAMES_ROOT", "").strip()
    if not root_raw:
        # Default: sample kit next to repo root when present
        default = _OLD_TOOL / "sam31_label_kit" / "frames"
        frames_root = default
    else:
        frames_root = Path(root_raw).expanduser().resolve()

    # Only configured allowlist Clips are visible (never "browse whole pool").
    allow_raw = os.environ.get("CLIP_ALLOWLIST", "")
    allowlist = tuple(part.strip() for part in allow_raw.split(",") if part.strip())

    ann_raw = os.environ.get("ANNOTATIONS_ROOT", "").strip()
    if ann_raw:
        annotations_root = Path(ann_raw).expanduser().resolve()
    else:
        annotations_root = _default_annotations_root()

    labels_raw = os.environ.get("LABELS_ROOT", "").strip()
    if labels_raw:
        labels_root = Path(labels_raw).expanduser().resolve()
    else:
        labels_root = _default_labels_root()

    auto_raw = os.environ.get("AUTO_SAVE_ON_PROPAGATE", "1").strip().lower()
    auto_save = auto_raw not in ("0", "false", "no", "off")

    backend = os.environ.get("PREDICTOR_BACKEND", "fake").strip().lower() or "fake"
    if backend not in ("fake", "sam31"):
        backend = "fake"

    ckpt_raw = os.environ.get("SAM31_CHECKPOINT", "").strip()
    if ckpt_raw:
        sam31_checkpoint = Path(ckpt_raw).expanduser().resolve()
    else:
        sam31_checkpoint = _default_sam31_checkpoint()

    repo_raw = os.environ.get("SAM31_REPO", "").strip()
    if repo_raw:
        sam31_repo = Path(repo_raw).expanduser().resolve()
    else:
        sam31_repo = _default_sam31_repo()

    gpu_raw = os.environ.get("GPU_ID", "").strip()
    gpu_id: int | None
    if gpu_raw == "":
        gpu_id = None
    else:
        try:
            gpu_id = int(gpu_raw)
        except ValueError:
            gpu_id = None

    scribble_backend = (
        os.environ.get("SCRIBBLE_BACKEND", "fake").strip().lower() or "fake"
    )
    if scribble_backend not in ("fake", "scribble"):
        scribble_backend = "fake"

    scribble_model_raw = os.environ.get("SCRIBBLE_MODEL_PATH", "").strip()
    scribble_model_path = (
        Path(scribble_model_raw).expanduser().resolve() if scribble_model_raw else None
    )
    scribble_ckpt_raw = os.environ.get("SCRIBBLE_SAM2_CHECKPOINT", "").strip()
    scribble_sam2_checkpoint = (
        Path(scribble_ckpt_raw).expanduser().resolve() if scribble_ckpt_raw else None
    )

    scribble_gpu_raw = os.environ.get("SCRIBBLE_GPU_ID", "").strip()
    scribble_gpu_id: int | None
    if scribble_gpu_raw == "":
        scribble_gpu_id = gpu_id
    else:
        try:
            scribble_gpu_id = int(scribble_gpu_raw)
        except ValueError:
            scribble_gpu_id = gpu_id

    return Settings(
        frames_root=frames_root,
        clip_allowlist=allowlist,
        annotations_root=annotations_root,
        labels_root=labels_root,
        auto_save_on_propagate=auto_save,
        predictor_backend=backend,
        sam31_checkpoint=sam31_checkpoint,
        sam31_repo=sam31_repo,
        gpu_id=gpu_id,
        scribble_backend=scribble_backend,
        scribble_model_path=scribble_model_path,
        scribble_sam2_checkpoint=scribble_sam2_checkpoint,
        scribble_gpu_id=scribble_gpu_id,
    )
