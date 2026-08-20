"""Edge Polish: snap toward image edges, then smooth jaggies.

Same function for Fake and Sam31. Session calls this after a successful
Geometric Predictor return, before writing the Track-on-Frame.

When no image is supplied (or JPEG decode fails — HTTP CI frames are
``b"fake-jpeg"``), snap is skipped and a morphology stand-in still runs so
the written silhouette is not the raw Predictor union.

Pure Python on list grids. No numpy / cv2 / scipy.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from endo_label.mask.mask_codec import decode_rle, encode_rle

# Chebyshev radius (pixels) for snap-to-edge attraction.
_SNAP_RADIUS = 2


def polish_mask(
    grid: Sequence[Sequence[int]] | None,
    image: Sequence[Sequence[int]] | None = None,
) -> list[list[int]]:
    """Snap toward image edges, then smooth.

    Empty / missing mask invents nothing.
    Image missing or size-mismatched: skip snap; still run the morphology
    stand-in (3×3 majority) so a solid Fake union is observably changed.
    """
    if not grid:
        return []
    h = len(grid)
    w = len(grid[0]) if h else 0
    if h == 0 or w == 0:
        return []
    out = [[1 if v else 0 for v in row] for row in grid]
    if not any(1 in row for row in out):
        return out

    if image is not None and len(image) == h and image and len(image[0]) == w:
        out = _snap(out, image)
    return _smooth(out)


def polish_rle(
    mask: dict,
    image: Sequence[Sequence[int]] | None = None,
) -> dict:
    """Polish an rle_fg payload; empty/missing stays empty."""
    grid = decode_rle(mask) if mask else []
    return encode_rle(polish_mask(grid, image))


def load_luma(path: Path, h: int, w: int) -> list[list[int]] | None:
    """Best-effort JPEG → HxW luminance. None if decode fails.

    PIL is optional (not a service dep). Fake CI bytes are not JPEGs.
    ponytail: no PIL / bad JPEG → stand-in only. Add a hard decode dep if
    snap must run in a PIL-less worker.
    """
    if h <= 0 or w <= 0:
        return None
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(path).convert("L")
        if im.size != (w, h):
            im = im.resize((w, h), Image.BILINEAR)
        pix = list(im.getdata())
        return [list(pix[r * w : (r + 1) * w]) for r in range(h)]
    except Exception:
        return None


def _snap(
    mask: list[list[int]],
    image: Sequence[Sequence[int]],
    radius: int = _SNAP_RADIUS,
) -> list[list[int]]:
    """Grow onto nearby high-gradient pixels so the silhouette hugs edges."""
    h, w = len(mask), len(mask[0])
    grad = _gradient(image)
    gmax = 0
    for row in grad:
        for v in row:
            if v > gmax:
                gmax = v
    if gmax == 0:
        return [row[:] for row in mask]
    thresh = gmax / 2
    near = _dilate_chebyshev(mask, radius)
    strong = [[1 if grad[r][c] >= thresh else 0 for c in range(w)] for r in range(h)]
    # Fill the gap: pixels near both the mask and a strong edge hug that edge.
    attract = _dilate_chebyshev(strong, radius)
    out = [row[:] for row in mask]
    for r in range(h):
        for c in range(w):
            if out[r][c]:
                continue
            if near[r][c] and attract[r][c]:
                out[r][c] = 1
    return out


def _smooth(mask: list[list[int]]) -> list[list[int]]:
    """3×3 majority: chamfers solid rects (not identity) and drops speckles.

    ponytail: one-pass majority is the Fake stand-in and jaggy cut. Ceiling:
    1–2 px blobs can vanish; overshoot past a real edge is not pulled back.
    Upgrade: close + shrink-to-gradient when real JPEGs show leftover jag.
    """
    return _majority3(mask)


def _majority3(mask: list[list[int]]) -> list[list[int]]:
    h, w = len(mask), len(mask[0])
    out = [[0] * w for _ in range(h)]
    for r in range(h):
        r0, r1 = max(0, r - 1), min(h, r + 2)
        for c in range(w):
            c0, c1 = max(0, c - 1), min(w, c + 2)
            n = 0
            for rr in range(r0, r1):
                row = mask[rr]
                for cc in range(c0, c1):
                    n += row[cc]
            if n >= 5:
                out[r][c] = 1
    return out


def _gradient(image: Sequence[Sequence[int]]) -> list[list[int]]:
    h, w = len(image), len(image[0])
    g = [[0] * w for _ in range(h)]
    for r in range(h):
        row = image[r]
        prev = image[r - 1] if r else row
        for c in range(w):
            gx = abs(int(row[c]) - int(row[c - 1])) if c else 0
            gy = abs(int(row[c]) - int(prev[c]))
            g[r][c] = gx + gy
    return g


def _dilate_chebyshev(mask: list[list[int]], radius: int) -> list[list[int]]:
    if radius <= 0:
        return [row[:] for row in mask]
    h, w = len(mask), len(mask[0])
    out = [[0] * w for _ in range(h)]
    for r in range(h):
        for c in range(w):
            if not mask[r][c]:
                continue
            r0, r1 = max(0, r - radius), min(h, r + radius + 1)
            c0, c1 = max(0, c - radius), min(w, c + radius + 1)
            for rr in range(r0, r1):
                row = out[rr]
                for cc in range(c0, c1):
                    row[cc] = 1
    return out
