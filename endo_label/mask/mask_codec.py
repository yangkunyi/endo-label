"""Pixel mask encoding: one durable shape for Session, Annotation, Predict, Propagate.

Format ``rle_fg`` (documented for implementers):
  {
    "format": "rle_fg",
    "size": [H, W],          # height, width of the binary grid
    "counts": [int, ...],    # COCO-style uncompressed RLE, C-order (row-major),
                             # runs alternate starting with background (0)
  }

Fake predictor uses a fixed 64×64 grid. Real SAM 3.1 uses the model mask H×W.
No pycocotools dependency — pure Python encode/decode.
"""

from __future__ import annotations

from typing import Any, Sequence

MASK_FORMAT = "rle_fg"

# Compact grid for FakePredictor / CI (relative geometry maps onto this).
FAKE_MASK_H = 64
FAKE_MASK_W = 64


def empty_mask(h: int = FAKE_MASK_H, w: int = FAKE_MASK_W) -> list[list[int]]:
    return [[0] * w for _ in range(h)]


def encode_rle(grid: Sequence[Sequence[int]] | Sequence[Sequence[bool]]) -> dict[str, Any]:
    """Binary HxW grid → rle_fg payload (no source/review fields)."""
    if not grid:
        return {"format": MASK_FORMAT, "size": [0, 0], "counts": []}
    h = len(grid)
    w = len(grid[0]) if h else 0
    flat: list[int] = []
    for row in grid:
        if len(row) != w:
            raise ValueError("mask rows must share the same width")
        for v in row:
            flat.append(1 if v else 0)

    counts: list[int] = []
    if not flat:
        return {"format": MASK_FORMAT, "size": [h, w], "counts": []}

    # Start with background run (even if length 0 when first pixel is fg).
    current = 0
    run = 0
    for bit in flat:
        if bit == current:
            run += 1
        else:
            counts.append(run)
            current = bit
            run = 1
    counts.append(run)
    return {"format": MASK_FORMAT, "size": [h, w], "counts": counts}


def decode_rle(payload: dict[str, Any]) -> list[list[int]]:
    """rle_fg payload → HxW binary grid (0/1)."""
    size = payload.get("size") or [0, 0]
    h, w = int(size[0]), int(size[1])
    counts = payload.get("counts") or []
    if h <= 0 or w <= 0:
        return []

    flat: list[int] = []
    val = 0
    for c in counts:
        n = int(c)
        if n < 0:
            raise ValueError("RLE counts must be non-negative")
        flat.extend([val] * n)
        val = 1 - val

    expected = h * w
    if len(flat) < expected:
        flat.extend([0] * (expected - len(flat)))
    elif len(flat) > expected:
        flat = flat[:expected]

    return [flat[i * w : (i + 1) * w] for i in range(h)]


def mask_payload(
    grid: Sequence[Sequence[int]] | Sequence[Sequence[bool]],
    *,
    source: str,
    review_decision: str | None = None,
) -> dict[str, Any]:
    out = encode_rle(grid)
    out["source"] = source
    out["review_decision"] = review_decision
    return out


def is_rle_mask(payload: dict[str, Any] | None) -> bool:
    if not payload:
        return False
    return payload.get("format") == MASK_FORMAT and "counts" in payload and "size" in payload


def mask_area(payload: dict[str, Any]) -> int:
    grid = decode_rle(payload)
    return sum(sum(row) for row in grid)


def point_in_mask(payload: dict[str, Any], x_rel: float, y_rel: float) -> bool:
    """True if relative point (0..1) falls on a foreground pixel."""
    size = payload.get("size") or [0, 0]
    h, w = int(size[0]), int(size[1])
    if h <= 0 or w <= 0:
        return False
    col = min(w - 1, max(0, int(x_rel * w)))
    row = min(h - 1, max(0, int(y_rel * h)))
    grid = decode_rle(payload)
    return bool(grid[row][col])


def bbox_rel_from_mask(payload: dict[str, Any]) -> list[float] | None:
    """Axis-aligned relative box around foreground, or None if empty."""
    grid = decode_rle(payload)
    if not grid:
        return None
    h, w = len(grid), len(grid[0])
    min_r, max_r = h, -1
    min_c, max_c = w, -1
    for r, row in enumerate(grid):
        for c, v in enumerate(row):
            if v:
                if r < min_r:
                    min_r = r
                if r > max_r:
                    max_r = r
                if c < min_c:
                    min_c = c
                if c > max_c:
                    max_c = c
    if max_r < 0:
        return None
    # Inclusive pixel edges → relative [0,1]
    x0 = min_c / w
    y0 = min_r / h
    x1 = (max_c + 1) / w
    y1 = (max_r + 1) / h
    return [
        round(x0, 4),
        round(y0, 4),
        round(min(1.0, x1), 4),
        round(min(1.0, y1), 4),
    ]


def fill_box_rel(
    grid: list[list[int]],
    box: Sequence[float],
    value: int = 1,
) -> None:
    """Paint a relative xyxy box onto a mutable HxW grid."""
    h = len(grid)
    w = len(grid[0]) if h else 0
    if h == 0 or w == 0:
        return
    x0, y0, x1, y1 = [float(v) for v in box]
    x0, x1 = sorted((max(0.0, min(1.0, x0)), max(0.0, min(1.0, x1))))
    y0, y1 = sorted((max(0.0, min(1.0, y0)), max(0.0, min(1.0, y1))))
    if x1 <= x0 or y1 <= y0:
        return
    c0 = max(0, min(w - 1, int(x0 * w)))
    c1 = max(c0 + 1, min(w, int(round(x1 * w))))
    r0 = max(0, min(h - 1, int(y0 * h)))
    r1 = max(r0 + 1, min(h, int(round(y1 * h))))
    for r in range(r0, r1):
        row = grid[r]
        for c in range(c0, c1):
            row[c] = value


# ponytail: one width; bump if desk strokes look too thin on real SAM grids.
SCRIBBLE_HALF_WIDTH_PX = 2


def fill_polyline_rel(
    grid: list[list[int]],
    points: Sequence[Sequence[float]],
    value: int = 1,
    half_width_px: float = SCRIBBLE_HALF_WIDTH_PX,
) -> None:
    """Paint a thin strip along a relative polyline."""
    h = len(grid)
    w = len(grid[0]) if h else 0
    if h == 0 or w == 0 or not points:
        return
    radius_rel = max(0.5, float(half_width_px)) / min(h, w)
    pts = [(float(p[0]), float(p[1])) for p in points]
    fill_disk_rel(grid, pts[0][0], pts[0][1], radius_rel, value)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        steps = max(1, int((dx * dx * w * w + dy * dy * h * h) ** 0.5) + 1)
        for i in range(1, steps + 1):
            t = i / steps
            fill_disk_rel(grid, x0 + t * dx, y0 + t * dy, radius_rel, value)


def apply_scribble_strips(
    grid: list[list[int]],
    scribbles: Sequence[Sequence[Sequence[float]]],
    labels: Sequence[int],
    half_width_px: float = SCRIBBLE_HALF_WIDTH_PX,
) -> None:
    """Union positive strips, then carve negative strips."""
    for poly, lab in zip(scribbles, labels):
        if lab == 1:
            fill_polyline_rel(grid, poly, 1, half_width_px)
    for poly, lab in zip(scribbles, labels):
        if lab == 0:
            fill_polyline_rel(grid, poly, 0, half_width_px)


def fill_disk_rel(
    grid: list[list[int]],
    x_rel: float,
    y_rel: float,
    radius_rel: float,
    value: int = 1,
) -> None:
    """Paint a disk centered at relative point (radius as fraction of min side)."""
    h = len(grid)
    w = len(grid[0]) if h else 0
    if h == 0 or w == 0:
        return
    cx = max(0.0, min(1.0, float(x_rel))) * w
    cy = max(0.0, min(1.0, float(y_rel))) * h
    rad = max(1.0, float(radius_rel) * min(h, w))
    r2 = rad * rad
    r0 = max(0, int(cy - rad) - 1)
    r1 = min(h, int(cy + rad) + 2)
    c0 = max(0, int(cx - rad) - 1)
    c1 = min(w, int(cx + rad) + 2)
    for r in range(r0, r1):
        for c in range(c0, c1):
            dy = (r + 0.5) - cy
            dx = (c + 0.5) - cx
            if dx * dx + dy * dy <= r2:
                grid[r][c] = value


def translate_mask(
    payload: dict[str, Any],
    *,
    dx_rel: float,
    dy_rel: float,
) -> dict[str, Any]:
    """Shift foreground by relative offsets (wrap off-canvas → drop)."""
    grid = decode_rle(payload)
    if not grid:
        return {
            "format": MASK_FORMAT,
            "size": list(payload.get("size") or [0, 0]),
            "counts": list(payload.get("counts") or []),
        }
    h, w = len(grid), len(grid[0])
    dx = int(round(dx_rel * w))
    dy = int(round(dy_rel * h))
    out = empty_mask(h, w)
    for r in range(h):
        for c in range(w):
            if not grid[r][c]:
                continue
            nr, nc = r + dy, c + dx
            if 0 <= nr < h and 0 <= nc < w:
                out[nr][nc] = 1
    return encode_rle(out)


def binary_numpy_to_rle(arr: Any) -> dict[str, Any]:
    """Encode HxW (or 1xHxW) array-like bool/0-1 mask to rle_fg."""
    # Lazy: accept list/numpy without importing numpy at module import time.
    if hasattr(arr, "tolist"):
        arr = arr.tolist()
    if not isinstance(arr, (list, tuple)):
        raise TypeError("mask array must be list-like or numpy")
    # Squeeze leading singleton dims (e.g. 1,H,W)
    while (
        isinstance(arr, (list, tuple))
        and len(arr) == 1
        and isinstance(arr[0], (list, tuple))
        and arr
        and isinstance(arr[0][0], (list, tuple))
    ):
        arr = arr[0]
    if not arr:
        return encode_rle([])
    # If still 3D N,H,W take first
    if (
        isinstance(arr[0], (list, tuple))
        and arr[0]
        and isinstance(arr[0][0], (list, tuple))
    ):
        arr = arr[0]
    grid = [[1 if v else 0 for v in row] for row in arr]
    return encode_rle(grid)


def public_mask_fields(mask: dict[str, Any]) -> dict[str, Any]:
    """Strip to durable public mask fields (plus source/review if present)."""
    out: dict[str, Any] = {
        "format": mask.get("format") or MASK_FORMAT,
        "size": list(mask.get("size") or [0, 0]),
        "counts": [int(c) for c in (mask.get("counts") or [])],
    }
    if "source" in mask:
        out["source"] = mask.get("source")
    if "review_decision" in mask:
        out["review_decision"] = mask.get("review_decision")
    if "model_provenance" in mask and mask.get("model_provenance") is not None:
        out["model_provenance"] = dict(mask["model_provenance"])
    return out
