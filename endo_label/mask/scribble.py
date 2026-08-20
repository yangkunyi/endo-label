"""Scribble Model port and Fake backend (complete region, not a thin strip)."""

from __future__ import annotations

from typing import Any, Protocol

from endo_label.config import Settings
from endo_label.mask.mask_codec import (
    FAKE_MASK_H,
    FAKE_MASK_W,
    MASK_FORMAT,
    decode_rle,
    empty_mask,
    encode_rle,
    fill_box_rel,
    mask_area,
)

MaskRle = dict[str, Any]
_MemoryKey = tuple[str, int, int]

# Fat enough that HTTP tests can tell a complete region from a 2px ribbon.
_PAD_REL = 0.10
_MIN_SIDE_REL = 0.30

# Full stroke diameter on the 1024 letterbox (original station lineWidth).
DEFAULT_SCRIBBLE_WIDTH = 8
SCRIBBLE_WIDTH_MIN = 1
SCRIBBLE_WIDTH_MAX = 40


def resolve_scribble_widths(
    scribbles: list[list[list[float]]],
    scribble_widths: list[int] | None,
) -> list[int]:
    """Omitted widths → every stroke is DEFAULT_SCRIBBLE_WIDTH."""
    if scribble_widths is None:
        return [DEFAULT_SCRIBBLE_WIDTH] * len(scribbles)
    return [int(w) for w in scribble_widths]


def _silhouette(mask: MaskRle) -> MaskRle:
    return {
        "format": MASK_FORMAT,
        "size": list(mask.get("size") or [0, 0]),
        "counts": [int(c) for c in (mask.get("counts") or [])],
    }


class ScribbleModel(Protocol):
    def health(self) -> dict[str, Any]:
        """Worker readiness (ready, status, backend, message)."""
        ...

    def predict(
        self,
        *,
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        session_id: str,
        track_id: int,
        frame_index: int,
        frame_path: str | None = None,
        scribble_widths: list[int] | None = None,
    ) -> MaskRle | None:
        """Complete pixel mask from this request's Scribble Prompts.

        Uses Scribble Memory for ``session_id`` / ``track_id`` / ``frame_index``.
        ``frame_path`` is this Frame's JPEG when the real backend needs it.
        ``scribble_widths`` is per-stroke diameter on the 1024 letterbox
        (omit → every stroke is 8). Output is ``rle_fg``.
        """
        ...

    def load_memory(
        self,
        *,
        session_id: str,
        track_id: int,
        frame_index: int,
        mask: MaskRle,
    ) -> None:
        """Refresh mask-memory from this silhouette. Does not drop accumulated ink."""
        ...

    def clear_memory(
        self,
        *,
        session_id: str,
        track_id: int | None = None,
        frame_index: int | None = None,
    ) -> None:
        """Drop Scribble Memory for a Session, Track, or Track-on-Frame."""
        ...


def _fat_box(points: list[list[float]]) -> list[float]:
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    x0, x1 = min(xs) - _PAD_REL, max(xs) + _PAD_REL
    y0, y1 = min(ys) - _PAD_REL, max(ys) + _PAD_REL
    if x1 - x0 < _MIN_SIDE_REL:
        mid = (x0 + x1) / 2.0
        x0, x1 = mid - _MIN_SIDE_REL / 2.0, mid + _MIN_SIDE_REL / 2.0
    if y1 - y0 < _MIN_SIDE_REL:
        mid = (y0 + y1) / 2.0
        y0, y1 = mid - _MIN_SIDE_REL / 2.0, mid + _MIN_SIDE_REL / 2.0
    return [
        max(0.0, min(1.0, x0)),
        max(0.0, min(1.0, y0)),
        max(0.0, min(1.0, x1)),
        max(0.0, min(1.0, y1)),
    ]


class FakeScribbleModel:
    """Deterministic complete region from each stroke (bbox-like fill).

    Scribble Memory is keyed by Session, Track, and Frame.
    ponytail: fat AABB, not a learned complete object. Real weights: ScribbleSam2MemoryWorker.
    """

    def __init__(self) -> None:
        self._memory: dict[_MemoryKey, MaskRle] = {}

    def health(self) -> dict[str, Any]:
        return {
            "ready": True,
            "status": "fake",
            "backend": "fake",
            "message": "Fake Scribble Model (no GPU)",
        }

    def load_memory(
        self,
        *,
        session_id: str,
        track_id: int,
        frame_index: int,
        mask: MaskRle,
    ) -> None:
        self._memory[(session_id, track_id, frame_index)] = _silhouette(mask)

    def clear_memory(
        self,
        *,
        session_id: str,
        track_id: int | None = None,
        frame_index: int | None = None,
    ) -> None:
        if track_id is None:
            drop = [k for k in self._memory if k[0] == session_id]
        elif frame_index is None:
            drop = [
                k
                for k in self._memory
                if k[0] == session_id and k[1] == track_id
            ]
        else:
            drop = [(session_id, track_id, frame_index)]
        for key in drop:
            self._memory.pop(key, None)

    def predict(
        self,
        *,
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        session_id: str,
        track_id: int,
        frame_index: int,
        frame_path: str | None = None,
        scribble_widths: list[int] | None = None,
    ) -> MaskRle | None:
        del frame_path, scribble_widths
        prior = self._memory.get((session_id, track_id, frame_index))
        if prior is not None and prior.get("format") == MASK_FORMAT:
            grid = decode_rle(prior)
            if not grid:
                grid = empty_mask(FAKE_MASK_H, FAKE_MASK_W)
        else:
            grid = empty_mask(FAKE_MASK_H, FAKE_MASK_W)

        for poly, lab in zip(scribbles, scribble_labels):
            if lab == 1 and poly:
                fill_box_rel(grid, _fat_box(poly), 1)
        for poly, lab in zip(scribbles, scribble_labels):
            if lab == 0 and poly:
                fill_box_rel(grid, _fat_box(poly), 0)

        enc = encode_rle(grid)
        if mask_area(enc) == 0:
            return None
        # Fake has one mask slot; Session re-anchors it from the SAM silhouette.
        self._memory[(session_id, track_id, frame_index)] = _silhouette(enc)
        return enc


class UnreadyScribbleModel:
    """Scribble backend selected but weights missing or load failed. Stroke Predict is 503."""

    def __init__(
        self,
        *,
        gpu_id: int | None = None,
        message: str = "Scribble worker is not ready",
    ) -> None:
        self._gpu_id = gpu_id
        self._message = message

    def health(self) -> dict[str, Any]:
        return {
            "ready": False,
            "status": "error",
            "backend": "scribble",
            "message": self._message,
            "gpu_id": self._gpu_id,
        }

    def load_memory(
        self,
        *,
        session_id: str,
        track_id: int,
        frame_index: int,
        mask: MaskRle,
    ) -> None:
        del session_id, track_id, frame_index, mask

    def clear_memory(
        self,
        *,
        session_id: str,
        track_id: int | None = None,
        frame_index: int | None = None,
    ) -> None:
        del session_id, track_id, frame_index

    def predict(
        self,
        *,
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        session_id: str,
        track_id: int,
        frame_index: int,
        frame_path: str | None = None,
        scribble_widths: list[int] | None = None,
    ) -> MaskRle | None:
        del (
            scribbles,
            scribble_labels,
            session_id,
            track_id,
            frame_index,
            frame_path,
            scribble_widths,
        )
        raise RuntimeError(self._message)


def build_scribble(settings: Settings) -> ScribbleModel:
    """Factory: default fake; ``SCRIBBLE_BACKEND=scribble`` loads weights or stays unready."""
    if settings.scribble_backend != "scribble":
        return FakeScribbleModel()
    model_path = settings.scribble_model_path
    ckpt = settings.scribble_sam2_checkpoint
    if (
        model_path is None
        or ckpt is None
        or not model_path.is_file()
        or not ckpt.is_file()
    ):
        return UnreadyScribbleModel(gpu_id=settings.scribble_gpu_id)
    from endo_label.mask.scribble_sam2 import try_build_scribble_sam2

    return try_build_scribble_sam2(settings)
