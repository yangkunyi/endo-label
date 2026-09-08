"""Predictor port, FakePredictor, and real SAM 3.1 multiplex worker."""

from __future__ import annotations

import hashlib
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Sequence

from endo_label.config import Settings
from endo_label.mask.mask_codec import (
    FAKE_MASK_H,
    FAKE_MASK_W,
    MASK_FORMAT,
    bbox_rel_from_mask,
    binary_numpy_to_rle,
    decode_rle,
    empty_mask,
    encode_rle,
    fill_box_rel,
    fill_disk_rel,
    mask_area,
    translate_mask,
)

# Stable palette for Track colors (hex).
_TRACK_COLORS = (
    "#e6194b",
    "#3cb44b",
    "#ffe119",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#42d4f4",
    "#f032e6",
    "#bfef45",
    "#fabed4",
    "#469990",
    "#dcbeff",
    "#9a6324",
    "#fffac8",
    "#800000",
    "#aaffc3",
)

# Relative radius of the fake disk around a positive point.
_POINT_RADIUS = 0.05

# Multiplex soft limit (ADR 0001 / user story 52).
MAX_TRACKS = 16

# Pixel mask payload: {format: rle_fg, size: [H,W], counts: [...]}
MaskRle = dict[str, Any]


@dataclass(frozen=True)
class DetectedInstance:
    label: str
    score: float
    # Pixel silhouette (rle_fg); not boxes-only
    mask: MaskRle
    # Model obj_id when known (SAM 3.1); None → Session assigns sequential ids
    track_id: int | None = None


class Predictor(Protocol):
    def health(self) -> dict[str, Any]:
        """Worker readiness for /api/health (ready, status, backend, message)."""
        ...

    def open_clip(self, *, clip_id: str, frames_dir: str) -> None:
        """Open model Session on a Clip frame directory (no-op for fake)."""
        ...

    def close_clip(self) -> None:
        """Close model Session and free GPU state for this Clip."""
        ...

    def reset_clip(self) -> None:
        """Reset model Session state; keep Clip open."""
        ...

    def remove_track(self, track_id: int) -> None:
        """Drop a Track from model Session if present."""
        ...

    def clear_frame_mask(self, *, frame_index: int, track_id: int) -> None:
        """Drop this Track-on-Frame from live model state (not the whole Track)."""
        ...

    def seed_track(
        self,
        *,
        frame_index: int,
        track_id: int,
        mask: MaskRle,
    ) -> None:
        """Inject Mask Prior / seed pixel mask for a Track (real model)."""
        ...

    def predict_concept(
        self, *, clip_id: str, frame_index: int, text: str
    ) -> list[DetectedInstance]:
        """Return zero or more instances for a Concept Prompt on one Frame."""
        ...

    def predict_geometry(
        self,
        *,
        clip_id: str,
        frame_index: int,
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
        base_mask: MaskRle | None = None,
        track_id: int | None = None,
    ) -> MaskRle | None:
        """Return a pixel mask from Geometric Prompts (points/boxes + labels).

        Coordinates are relative image space in ``[0, 1]``.
        ``point_labels`` / ``box_labels``: ``1`` positive, ``0`` negative.
        ``base_mask`` / Mask Prior: optional Track-on-Frame silhouette.
        ``track_id``: multiplex object id Session already chose.
        """
        ...

    def propagate_mask(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        """Extend a seed pixel mask from seed frame to target frame."""
        ...

    def propagate_span(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        target_frame_indices: Sequence[int],
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        """Return one target mask while adapter owns span/cache policy."""
        ...


def color_for_track(track_id: int) -> str:
    return _TRACK_COLORS[(track_id - 1) % len(_TRACK_COLORS)]


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _normalize_box(box: list[float]) -> list[float]:
    x0, y0, x1, y1 = box
    x0, x1 = sorted((_clamp01(x0), _clamp01(x1)))
    y0, y1 = sorted((_clamp01(y0), _clamp01(y1)))
    if x1 <= x0:
        x1 = min(1.0, x0 + 0.01)
    if y1 <= y0:
        y1 = min(1.0, y0 + 0.01)
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def xyxy_to_xywh(box: list[float]) -> list[float]:
    x0, y0, x1, y1 = box
    return [x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)]


def xywh_to_xyxy(box: list[float]) -> list[float]:
    x, y, w, h = box
    return _normalize_box([x, y, x + w, y + h])


class FakePredictor:
    """Deterministic stand-in for SAM 3.1 concept + geometric predict.

    Soft empty concept: text ``nothing`` / ``none`` (case-insensitive).
    Geometry: positive points/boxes → pixel silhouettes on a 64×64 grid;
    negatives carve out of the mask. Mask Prior: ``base_mask`` seeds geometry.
    """

    EMPTY_CONCEPTS = frozenset({"nothing", "none"})

    def health(self) -> dict[str, Any]:
        return {
            "ready": True,
            "status": "fake",
            "backend": "fake",
            "message": "Fake predictor (no GPU)",
        }

    def open_clip(self, *, clip_id: str, frames_dir: str) -> None:
        del clip_id, frames_dir

    def close_clip(self) -> None:
        return

    def reset_clip(self) -> None:
        return

    def remove_track(self, track_id: int) -> None:
        del track_id

    def clear_frame_mask(self, *, frame_index: int, track_id: int) -> None:
        # Fake has no per-frame GPU cache; Session pop is enough.
        del frame_index, track_id

    def seed_track(
        self,
        *,
        frame_index: int,
        track_id: int,
        mask: MaskRle,
    ) -> None:
        del frame_index, track_id, mask

    def predict_concept(
        self, *, clip_id: str, frame_index: int, text: str
    ) -> list[DetectedInstance]:
        del clip_id  # unused; real model would load the frame
        concept = text.strip()
        if concept.lower() in self.EMPTY_CONCEPTS:
            return []

        digest = hashlib.sha256(
            f"{concept}|{frame_index}".encode("utf-8")
        ).digest()
        instances: list[DetectedInstance] = []
        for i in range(2):
            bx = 0.05 + (digest[i * 2] / 255.0) * 0.5
            by = 0.05 + (digest[i * 2 + 1] / 255.0) * 0.5
            w = 0.2 + (digest[4 + i] / 255.0) * 0.15
            h = 0.2 + (digest[6 + i] / 255.0) * 0.15
            x0 = min(bx, 0.75)
            y0 = min(by, 0.75)
            x1 = min(x0 + w, 0.98)
            y1 = min(y0 + h, 0.98)
            score = 0.7 + (digest[8 + i] / 255.0) * 0.29
            grid = empty_mask(FAKE_MASK_H, FAKE_MASK_W)
            fill_box_rel(grid, [x0, y0, x1, y1], 1)
            instances.append(
                DetectedInstance(
                    label=concept,
                    score=round(score, 3),
                    mask=encode_rle(grid),
                )
            )
        return instances

    def predict_geometry(
        self,
        *,
        clip_id: str,
        frame_index: int,
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
        base_mask: MaskRle | None = None,
        track_id: int | None = None,
    ) -> MaskRle | None:
        del clip_id, frame_index, track_id
        if base_mask is not None and base_mask.get("format") == MASK_FORMAT:
            grid = decode_rle(base_mask)
            if not grid:
                grid = empty_mask(FAKE_MASK_H, FAKE_MASK_W)
            # Resize base onto fake grid if needed
            if len(grid) != FAKE_MASK_H or (grid and len(grid[0]) != FAKE_MASK_W):
                grid = _resample_mask(grid, FAKE_MASK_H, FAKE_MASK_W)
        else:
            grid = empty_mask(FAKE_MASK_H, FAKE_MASK_W)

        for box, lab in zip(boxes, box_labels):
            if lab == 1:
                fill_box_rel(grid, _normalize_box(list(box)), 1)

        for pt, lab in zip(points, point_labels):
            if lab == 1:
                fill_disk_rel(
                    grid, float(pt[0]), float(pt[1]), _POINT_RADIUS, 1
                )

        for pt, lab in zip(points, point_labels):
            if lab == 0:
                fill_disk_rel(
                    grid, float(pt[0]), float(pt[1]), _POINT_RADIUS, 0
                )

        for box, lab in zip(boxes, box_labels):
            if lab == 0:
                fill_box_rel(grid, _normalize_box(list(box)), 0)

        enc = encode_rle(grid)
        if mask_area(enc) == 0:
            return None
        return enc

    def propagate_mask(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        """Copy seed mask with a tiny deterministic nudge per frame delta."""
        del clip_id, track_id
        delta = target_frame_index - seed_frame_index
        nudge = delta * 0.002
        return translate_mask(seed_mask, dx_rel=nudge, dy_rel=nudge * 0.5)

    def propagate_span(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        target_frame_indices: Sequence[int],
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        """Fake has no stream; return requested target directly."""
        del target_frame_indices
        return self.propagate_mask(
            clip_id=clip_id,
            seed_frame_index=seed_frame_index,
            target_frame_index=target_frame_index,
            seed_mask=seed_mask,
            track_id=track_id,
        )


def _resample_mask(
    grid: list[list[int]], h: int, w: int
) -> list[list[int]]:
    """Nearest-neighbor resize of a binary grid to h×w."""
    src_h = len(grid)
    src_w = len(grid[0]) if src_h else 0
    if src_h == 0 or src_w == 0:
        return empty_mask(h, w)
    out = empty_mask(h, w)
    for r in range(h):
        sr = min(src_h - 1, int(r * src_h / h))
        for c in range(w):
            sc = min(src_w - 1, int(c * src_w / w))
            out[r][c] = 1 if grid[sr][sc] else 0
    return out


def _drop_sam_prompts_on_frame(
    state: dict[str, Any], frame_index: int, track_id: int
) -> None:
    """Pop SAM point/box/mask inputs for one Track on one Frame."""
    frame_cache = (state.get("cached_frame_outputs") or {}).get(frame_index)
    if isinstance(frame_cache, dict):
        frame_cache.pop(track_id, None)
    refined = state.get("user_refined_frames_per_obj")
    if isinstance(refined, dict):
        bucket = refined.get(track_id)
        if isinstance(bucket, set):
            bucket.discard(frame_index)
    mapping = state.get("obj_id_to_idx")
    if isinstance(mapping, dict) and track_id in mapping:
        obj_keys: list[Any] = [mapping[track_id]]
    else:
        obj_keys = [track_id]
    for store_name in ("point_inputs_per_obj", "mask_inputs_per_obj"):
        per_obj = state.get(store_name)
        if not isinstance(per_obj, dict):
            continue
        for key in obj_keys:
            slot = per_obj.get(key)
            if isinstance(slot, dict):
                slot.pop(frame_index, None)
    for store_name in ("output_dict_per_obj", "temp_output_dict_per_obj"):
        per_obj = state.get(store_name)
        if not isinstance(per_obj, dict):
            continue
        for key in obj_keys:
            bucket = per_obj.get(key)
            if not isinstance(bucket, dict):
                continue
            for slot_name in ("cond_frame_outputs", "non_cond_frame_outputs"):
                slot = bucket.get(slot_name)
                if isinstance(slot, dict):
                    slot.pop(frame_index, None)


class Sam31Predictor:
    """Resident SAM 3.1 multiplex video predictor (one model, one Clip Session).

    Loads checkpoint once. Session/Predict/Propagate map to handle_request /
    handle_stream_request. Outputs map to rle_fg pixel masks. Box Mask Prior
    prepends the pixel-mask AABB on the same add_prompt. Point Prior and
    Mask Handoff send the pixel rle_fg (SAM2 mask-input / prev logits), not
    AABB-only and not a stroke/polyline.
    """

    def __init__(
        self,
        *,
        checkpoint: Path,
        sam3_repo: Path,
        gpu_id: int | None = None,
    ) -> None:
        self._checkpoint = Path(checkpoint)
        self._sam3_repo = Path(sam3_repo)
        self._gpu_id = gpu_id
        self._predictor: Any = None
        self._session_id: str | None = None
        self._clip_id: str | None = None
        self._status = "loading"
        self._message = "Loading SAM 3.1 multiplex checkpoint"
        self._error: str | None = None
        # Cache: (seed_frame, track_id, target_frame) -> rle_fg after stream
        self._prop_cache: dict[tuple[int, int, int], MaskRle] = {}
        self._seeded_tracks: set[tuple[int, int]] = set()
        self._load_model()

    def _load_model(self) -> None:
        try:
            if self._gpu_id is not None:
                import os

                # Set before torch/sam3 bind devices when possible.
                os.environ.setdefault("CUDA_VISIBLE_DEVICES", str(self._gpu_id))

            repo = str(self._sam3_repo.resolve())
            if repo not in sys.path:
                sys.path.insert(0, repo)

            if not self._checkpoint.is_file():
                raise FileNotFoundError(
                    f"SAM 3.1 checkpoint not found: {self._checkpoint}"
                )
            if not self._sam3_repo.is_dir():
                raise FileNotFoundError(f"SAM 3.1 repo not found: {self._sam3_repo}")

            from sam3.model_builder import build_sam3_multiplex_video_predictor

            # Multiplex defaults use_fa3=True, which imports flash_attn_interface
            # (FA3). This env often has only flash_attn 2.x → ModuleNotFoundError
            # on first Predict. Fall back to SDPA when FA3 is absent.
            use_fa3 = _flash_attn3_available()
            self._predictor = build_sam3_multiplex_video_predictor(
                checkpoint_path=str(self._checkpoint.resolve()),
                use_fa3=use_fa3,
            )
            # Upstream bug: first point on a new object returned empty masks.
            _patch_build_sam2_output(self._predictor)
            _patch_pixel_mask_prior(self._predictor)
            self._status = "ready"
            fa3_note = "FA3" if use_fa3 else "SDPA (no flash_attn_interface)"
            self._message = (
                f"SAM 3.1 multiplex ready (ckpt={self._checkpoint.name}; {fa3_note})"
            )
            self._error = None
        except Exception as exc:  # load / OOM / import
            self._predictor = None
            self._status = "error"
            self._error = str(exc)
            self._message = f"SAM 3.1 load failed: {exc}"

    def health(self) -> dict[str, Any]:
        return {
            "ready": self._status == "ready",
            "status": self._status,
            "backend": "sam31",
            "message": self._message,
            "checkpoint": str(self._checkpoint),
            "sam3_repo": str(self._sam3_repo),
            "gpu_id": self._gpu_id,
        }

    def _require_ready(self) -> Any:
        if self._status != "ready" or self._predictor is None:
            raise RuntimeError(
                self._message or "SAM 3.1 worker not ready"
            )
        return self._predictor

    def _require_session(self) -> tuple[Any, str]:
        pred = self._require_ready()
        if not self._session_id:
            raise RuntimeError("No model Session; open a Clip Session first")
        return pred, self._session_id

    def open_clip(self, *, clip_id: str, frames_dir: str) -> None:
        pred = self._require_ready()
        if self._session_id is not None:
            self.close_clip()
        frames_path = str(Path(frames_dir).resolve())
        resp = pred.handle_request(
            {"type": "start_session", "resource_path": frames_path}
        )
        self._session_id = resp["session_id"]
        self._clip_id = clip_id
        self._prop_cache.clear()
        self._seeded_tracks.clear()

    def close_clip(self) -> None:
        if self._predictor is None or self._session_id is None:
            self._session_id = None
            self._clip_id = None
            self._prop_cache.clear()
            self._seeded_tracks.clear()
            return
        try:
            self._predictor.handle_request(
                {"type": "close_session", "session_id": self._session_id}
            )
        except Exception:
            pass
        self._session_id = None
        self._clip_id = None
        self._prop_cache.clear()
        self._seeded_tracks.clear()

    def reset_clip(self) -> None:
        pred, sid = self._require_session()
        pred.handle_request({"type": "reset_session", "session_id": sid})
        self._prop_cache.clear()
        self._seeded_tracks.clear()

    def remove_track(self, track_id: int) -> None:
        if self._session_id is None or self._predictor is None:
            return
        try:
            self._predictor.handle_request(
                {
                    "type": "remove_object",
                    "session_id": self._session_id,
                    "obj_id": int(track_id),
                }
            )
        except Exception:
            # Model may not know this obj_id yet
            pass
        # Drop cached propagate for this track
        self._prop_cache = {
            k: v for k, v in self._prop_cache.items() if k[1] != track_id
        }
        self._seeded_tracks = {
            k for k in self._seeded_tracks if k[1] != track_id
        }

    def clear_frame_mask(self, *, frame_index: int, track_id: int) -> None:
        """Drop this Track-on-Frame worker caches and SAM prompts (other Frames stay)."""
        fi, tid = int(frame_index), int(track_id)
        # Drop cache rows that use this Frame as seed or as a filled target.
        self._prop_cache = {
            k: v
            for k, v in self._prop_cache.items()
            if k[1] != tid or (k[0] != fi and k[2] != fi)
        }
        self._seeded_tracks.discard((fi, tid))
        if hasattr(self, "_point_prompted"):
            self._point_prompted.discard((fi, tid))
        # ponytail: handle_request has no per-frame wipe; remove_object is
        # whole-Track. Pop inference-state prompts for (frame, obj) instead.
        # Detector per_frame_raw_box_input is per-Frame, not per-Track — leave it.
        self._drop_cached_frame_output(fi, tid)

    def _drop_cached_frame_output(self, frame_index: int, track_id: int) -> None:
        pred = self._predictor
        sid = self._session_id
        if pred is None or sid is None:
            return
        sessions = getattr(pred, "_all_inference_states", None)
        if not sessions:
            return
        try:
            root = sessions[sid]["state"]
            states = [root]
            nested = root.get("sam2_inference_states") or []
            states.extend(s for s in nested if isinstance(s, dict))
            for state in states:
                _drop_sam_prompts_on_frame(state, frame_index, track_id)
        except Exception:
            pass

    def seed_track(
        self,
        *,
        frame_index: int,
        track_id: int,
        mask: MaskRle,
    ) -> None:
        """Seed SAM2 with the Track-on-Frame pixel mask (not a VG box).

        VG ``add_prompt(boxes)`` calls ``reset_state`` and runs the detector
        without text, which wipes clicks and crashes Propagate. Mask Handoff
        (rle_fg + empty points) stays on the SAM2 tracker path.
        """
        if mask_area(mask) <= 0:
            return
        pred, sid = self._require_session()
        pred.handle_request(
            {
                "type": "add_prompt",
                "session_id": sid,
                "frame_index": int(frame_index),
                "obj_id": int(track_id),
                "clear_old_points": True,
                "rel_coordinates": True,
                "mask": {
                    "format": mask.get("format") or MASK_FORMAT,
                    "size": list(mask.get("size") or [0, 0]),
                    "counts": list(mask.get("counts") or []),
                },
            }
        )
        self._prop_cache.clear()
        self._seeded_tracks.add((int(frame_index), int(track_id)))

    def predict_concept(
        self, *, clip_id: str, frame_index: int, text: str
    ) -> list[DetectedInstance]:
        del clip_id
        pred, sid = self._require_session()
        concept = text.strip()
        resp = pred.handle_request(
            {
                "type": "add_prompt",
                "session_id": sid,
                "frame_index": int(frame_index),
                "text": concept,
                "rel_coordinates": True,
            }
        )
        self._prop_cache.clear()
        return self._detections_from_outputs(resp.get("outputs") or {}, label=concept)

    def predict_geometry(
        self,
        *,
        clip_id: str,
        frame_index: int,
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
        base_mask: MaskRle | None = None,
        track_id: int | None = None,
    ) -> MaskRle | None:
        del clip_id
        pred, sid = self._require_session()

        # Points require obj_id (SAM 3.1 multiplex); SessionManager pre-assigns.
        obj_id = track_id
        if points and obj_id is None:
            raise RuntimeError(
                "Geometric point Predict requires track_id (obj_id) for SAM 3.1"
            )

        req: dict[str, Any] = {
            "type": "add_prompt",
            "session_id": sid,
            "frame_index": int(frame_index),
            "rel_coordinates": True,
        }

        if points:
            # Point path: no simultaneous text/boxes on this request
            req["points"] = points
            req["point_labels"] = point_labels
            req["obj_id"] = int(obj_id) if obj_id is not None else 1
            # ADR 0007: wipe that Track on this Frame; Prior + this request.
            req["clear_old_points"] = True
            if base_mask:
                req["mask"] = {
                    "format": base_mask.get("format") or MASK_FORMAT,
                    "size": list(base_mask.get("size") or [0, 0]),
                    "counts": list(base_mask.get("counts") or []),
                }
        elif boxes:
            # Box path prepends Mask Prior AABB on the same add_prompt.
            all_boxes = list(boxes)
            all_labels = list(box_labels)
            if base_mask:
                prior_box = bbox_rel_from_mask(base_mask)
                if prior_box is not None:
                    all_boxes = [prior_box, *all_boxes]
                    all_labels = [1, *all_labels]
            req["bounding_boxes"] = [xyxy_to_xywh(list(b)) for b in all_boxes]
            req["bounding_box_labels"] = all_labels
            # multiplex text/box add_prompt asserts this True (wipes earlier boxes)
            req["clear_old_boxes"] = True
            if obj_id is not None:
                req["obj_id"] = int(obj_id)
        elif base_mask:
            # Mask Prior only: complete pixel rle_fg (Mask Handoff). No stroke.
            req["obj_id"] = int(obj_id) if obj_id is not None else 1
            req["clear_old_points"] = True
            req["mask"] = {
                "format": base_mask.get("format") or MASK_FORMAT,
                "size": list(base_mask.get("size") or [0, 0]),
                "counts": list(base_mask.get("counts") or []),
            }
        else:
            return None

        resp = pred.handle_request(req)
        self._prop_cache.clear()
        out = resp.get("outputs") or {}
        return self._mask_for_obj(out, obj_id=obj_id)

    def propagate_mask(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        del clip_id
        tid = int(track_id) if track_id is not None else 1
        cache_key = (seed_frame_index, tid, target_frame_index)
        if cache_key in self._prop_cache:
            return self._prop_cache[cache_key]

        pred, sid = self._require_session()
        direction = "forward" if target_frame_index >= seed_frame_index else "backward"
        max_frames = abs(target_frame_index - seed_frame_index)
        if max_frames == 0:
            return {
                "format": seed_mask.get("format") or MASK_FORMAT,
                "size": list(seed_mask.get("size") or [0, 0]),
                "counts": list(seed_mask.get("counts") or []),
            }

        # Seed once per (seed_frame, track); SessionManager seeds at job start too.
        seed_key = (seed_frame_index, tid)
        if seed_key not in self._seeded_tracks and mask_area(seed_mask) > 0:
            self.seed_track(
                frame_index=seed_frame_index,
                track_id=tid,
                mask=seed_mask,
            )
            self._seeded_tracks.add(seed_key)

        # Stream this span; cache frames so later polls do not re-run GPU work.
        # add_prompt wraps CUDA bf16 autocast; handle_stream_request does not.
        # Init-time bf16_context.__enter__() is thread-local and does not
        # follow uvicorn's worker thread, so VG backbone Linear sees bf16
        # activations vs fp32 weights without this wrap.
        import torch

        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            stream = pred.handle_stream_request(
                {
                    "type": "propagate_in_video",
                    "session_id": sid,
                    "propagation_direction": direction,
                    "start_frame_index": int(seed_frame_index),
                    "max_frame_num_to_track": int(max_frames),
                }
            )
            for response in stream:
                fi = int(response.get("frame_index", -1))
                mask = self._mask_for_obj(response.get("outputs") or {}, obj_id=tid)
                if mask is not None:
                    self._prop_cache[(seed_frame_index, tid, fi)] = mask

        if cache_key not in self._prop_cache:
            raise RuntimeError(
                f"SAM 3.1 Propagate produced no mask for track {tid} "
                f"frame {target_frame_index}"
            )
        return self._prop_cache[cache_key]

    def propagate_span(
        self,
        *,
        clip_id: str,
        seed_frame_index: int,
        target_frame_index: int,
        target_frame_indices: Sequence[int],
        seed_mask: MaskRle,
        track_id: int | None = None,
    ) -> MaskRle:
        """Stream/cache a span while returning only the requested target.

        Session supplies planned targets, not SAM-specific span details. For a
        ``both`` job, only targets on the requested side of the seed are used
        to choose the farthest stream endpoint; the other side gets its own
        stream when that side is polled.
        """
        if target_frame_index == seed_frame_index:
            return self.propagate_mask(
                clip_id=clip_id,
                seed_frame_index=seed_frame_index,
                target_frame_index=target_frame_index,
                seed_mask=seed_mask,
                track_id=track_id,
            )
        candidates = [int(target_frame_index), *map(int, target_frame_indices)]
        going_forward = target_frame_index >= seed_frame_index
        same_direction = [
            fi
            for fi in candidates
            if (fi >= seed_frame_index) == going_forward
        ]
        span_end = max(
            same_direction,
            key=lambda fi: abs(fi - seed_frame_index),
        )
        if span_end != target_frame_index:
            self.propagate_mask(
                clip_id=clip_id,
                seed_frame_index=seed_frame_index,
                target_frame_index=span_end,
                seed_mask=seed_mask,
                track_id=track_id,
            )
            cache_key = (
                int(seed_frame_index),
                int(track_id) if track_id is not None else 1,
                int(target_frame_index),
            )
            if cache_key not in self._prop_cache:
                raise RuntimeError(
                    "SAM 3.1 Propagate span produced no requested target "
                    f"frame {target_frame_index}"
                )
            return self._prop_cache[cache_key]
        return self.propagate_mask(
            clip_id=clip_id,
            seed_frame_index=seed_frame_index,
            target_frame_index=target_frame_index,
            seed_mask=seed_mask,
            track_id=track_id,
        )

    @staticmethod
    def _pick_output(outputs: dict[str, Any], *keys: str) -> Any:
        """First non-None key. Never truth-test numpy arrays (ambiguous empty)."""
        for key in keys:
            if key in outputs and outputs[key] is not None:
                return outputs[key]
        return None

    @staticmethod
    def _as_list(arr: Any) -> list[Any]:
        if arr is None:
            return []
        if hasattr(arr, "tolist"):
            converted = arr.tolist()
            # scalar → single-element list; nested list/tuple stays nested
            if isinstance(converted, (list, tuple)):
                return list(converted)
            return [converted]
        if isinstance(arr, (list, tuple)):
            return list(arr)
        return [arr]

    def _detections_from_outputs(
        self, outputs: dict[str, Any], *, label: str
    ) -> list[DetectedInstance]:
        obj_ids = self._as_list(
            self._pick_output(outputs, "out_obj_ids", "obj_ids", "object_ids")
        )
        binary_masks = self._mask_list(
            self._pick_output(outputs, "out_binary_masks", "binary_masks", "masks")
        )
        boxes_xywh = self._as_list(self._pick_output(outputs, "out_boxes_xywh"))
        scores = self._as_list(
            self._pick_output(outputs, "out_probs", "out_scores", "scores")
        )

        n = max(len(obj_ids), len(binary_masks), len(boxes_xywh))
        if len(obj_ids) == 0 and n > 0:
            obj_ids = list(range(1, n + 1))

        instances: list[DetectedInstance] = []
        for i, oid in enumerate(obj_ids):
            mask_rle = self._rle_at(binary_masks, i)
            # No filled-box fallback: that looked like "bbox paint" not object mask.
            if mask_rle is None:
                continue
            score = 0.9
            if i < len(scores):
                try:
                    score = float(scores[i])
                except (TypeError, ValueError):
                    score = 0.9
            try:
                model_tid = int(oid)
            except (TypeError, ValueError):
                model_tid = i + 1
            instances.append(
                DetectedInstance(
                    label=label,
                    score=round(score, 3),
                    mask=mask_rle,
                    track_id=model_tid,
                )
            )
            if len(instances) >= MAX_TRACKS:
                break
        return instances

    def _mask_for_obj(
        self, outputs: dict[str, Any], *, obj_id: int | None
    ) -> MaskRle | None:
        obj_ids = self._as_list(
            self._pick_output(outputs, "out_obj_ids", "obj_ids", "object_ids")
        )
        binary_masks = self._mask_list(
            self._pick_output(outputs, "out_binary_masks", "binary_masks", "masks")
        )

        if len(binary_masks) == 0:
            return None

        # Prefer exact obj_id match; detector box path often returns obj_id=0 while
        # Session pre-assigns 1+ — still take the only / first real mask.
        if obj_id is not None and len(obj_ids) > 0:
            for i, oid in enumerate(obj_ids):
                try:
                    if int(oid) != int(obj_id):
                        continue
                except (TypeError, ValueError):
                    continue
                mask_rle = self._rle_at(binary_masks, i)
                if mask_rle is not None:
                    return mask_rle

        for i in range(len(binary_masks)):
            mask_rle = self._rle_at(binary_masks, i)
            if mask_rle is not None:
                return mask_rle
        return None

    @staticmethod
    def _mask_list(arr: Any) -> list[Any]:
        """Split model out_binary_masks into per-object masks.

        Numpy shape (N,H,W) must not use bare tolist() as a flat list of N*H rows.
        """
        if arr is None:
            return []
        if hasattr(arr, "shape") and len(getattr(arr, "shape", ())) == 3:
            # N,H,W → N slices
            return [arr[i] for i in range(arr.shape[0])]
        if hasattr(arr, "shape") and len(getattr(arr, "shape", ())) == 2:
            return [arr]
        return Sam31Predictor._as_list(arr)

    @staticmethod
    def _rle_at(binary_masks: list[Any], index: int) -> MaskRle | None:
        if index >= len(binary_masks):
            return None
        m = binary_masks[index]
        if m is None:
            return None
        try:
            rle = binary_numpy_to_rle(m)
        except (TypeError, ValueError):
            return None
        if mask_area(rle) == 0:
            return None
        return rle


def _flash_attn3_available() -> bool:
    """True only if FlashAttention-3 package (flash_attn_interface) imports."""
    try:
        import flash_attn_interface  # noqa: F401

        return True
    except Exception:
        return False


def _patch_build_sam2_output(video_predictor: Any) -> None:
    """Fix first-click masks: apply refined mask even when frame cache is empty.

    Upstream ``_build_sam2_output`` returned ``{}`` when ``cached_frame_outputs``
    had no entry for the frame, dropping the new object's point mask. sam3/ is
    often gitignored, so we patch at load time.
    """
    model = getattr(video_predictor, "model", None)
    if model is None or not hasattr(model, "_build_sam2_output"):
        return
    if getattr(model, "_sam31_build_sam2_output_patched", False):
        return

    def _build_sam2_output_fixed(
        self: Any,
        inference_state: dict[str, Any],
        frame_idx: int,
        refined_obj_id_to_mask: dict[int, Any] | None = None,
    ) -> dict[int, Any]:
        if frame_idx in inference_state["cached_frame_outputs"]:
            obj_id_to_mask = inference_state["cached_frame_outputs"][frame_idx].copy()
        else:
            obj_id_to_mask = {}
        if refined_obj_id_to_mask is not None:
            for obj_id, refined_mask in refined_obj_id_to_mask.items():
                if refined_mask is None:
                    continue
                # postprocess expects (1, H, W) for torch.cat(dim=0)
                if hasattr(refined_mask, "dim") and refined_mask.dim() == 2:
                    refined_mask = refined_mask.unsqueeze(0)
                obj_id_to_mask[obj_id] = refined_mask
        return obj_id_to_mask

    import types

    model._build_sam2_output = types.MethodType(_build_sam2_output_fixed, model)
    model._sam31_build_sam2_output_patched = True


def _rle_to_hw_tensor(mask: MaskRle, device: Any) -> Any:
    """Decode rle_fg to a float HxW tensor on device (lazy torch import)."""
    import torch

    grid = decode_rle(mask)
    if not grid:
        return None
    return torch.tensor(grid, dtype=torch.float32, device=device)


def _mask_logits_from_hw(mask_hw: Any, *, height: int, width: int) -> Any:
    """Binary HxW → (1, 1, H, W) logits (SAM2 _use_mask_as_output scale)."""
    import torch

    # sigmoid(-10)≈0, sigmoid(10)≈1
    logits = mask_hw.to(dtype=torch.float32)[None, None] * 20.0 - 10.0
    if logits.shape[-2] != height or logits.shape[-1] != width:
        logits = torch.nn.functional.interpolate(
            logits,
            size=(int(height), int(width)),
            mode="bilinear",
            align_corners=False,
        )
    return torch.clamp(logits, -32.0, 32.0)


def _obj_in_multiplex(state: dict[str, Any], obj_id: int) -> bool:
    multiplex = state.get("multiplex_state")
    if multiplex is None:
        return False
    ids = getattr(multiplex, "object_ids", None)
    if ids is None:
        return False
    try:
        return int(obj_id) in {int(x) for x in ids}
    except (TypeError, ValueError):
        return obj_id in ids


def _prime_sam2_mask_prior(
    tracker: Any,
    state: dict[str, Any],
    *,
    frame_idx: int,
    obj_id: int,
    mask: MaskRle,
) -> None:
    """Seed pixel Mask Prior so first point refine uses SAM2 prev-logits path."""
    device = state.get("device")
    mask_hw = _rle_to_hw_tensor(mask, device)
    if mask_hw is None:
        return

    if not _obj_in_multiplex(state, obj_id) and hasattr(tracker, "add_new_masks"):
        # New object: official SAM2 mask input (creates multiplex slot).
        # ponytail: if this throws, we still inject logits; new-obj path may ignore them.
        try:
            tracker.add_new_masks(
                state, frame_idx, [int(obj_id)], mask_hw.unsqueeze(0) > 0.5
            )
        except Exception:
            pass

    obj_idx = tracker._obj_id_to_idx(state, int(obj_id))
    low_n = int(getattr(tracker, "low_res_mask_size", 288) or 288)
    video_h = int(state.get("video_height") or mask_hw.shape[0])
    video_w = int(state.get("video_width") or mask_hw.shape[1])
    pred_masks = _mask_logits_from_hw(mask_hw, height=low_n, width=low_n)
    pred_video = _mask_logits_from_hw(mask_hw, height=video_h, width=video_w)
    for bucket in (
        state.get("temp_output_dict_per_obj", {}).get(obj_idx),
        state.get("output_dict_per_obj", {}).get(obj_idx),
    ):
        if bucket is None:
            continue
        slot = bucket.setdefault("cond_frame_outputs", {})
        prev = dict(slot.get(frame_idx) or {})
        prev["pred_masks"] = pred_masks
        prev["pred_masks_video_res"] = pred_video
        slot[frame_idx] = prev

    # First add_new_points otherwise treats this as fresh-from-click.
    state.setdefault("user_refined_frames_per_obj", {}).setdefault(
        int(obj_id), set()
    ).add(frame_idx)
    state.setdefault("frames_already_tracked", {})[frame_idx] = {"reverse": False}


def _patch_pixel_mask_prior(video_predictor: Any) -> None:
    """Honor add_prompt ``mask`` (rle_fg) as SAM2 mask-input / prev logits.

    Multiplex first point refine ignores the prior silhouette unless we prime
    pred_masks and enable ``iter_use_prev_mask_pred``.
    """
    if getattr(video_predictor, "_sam31_pixel_mask_prior_patched", False):
        return

    orig_handle = video_predictor.handle_request

    def handle_request(request: dict[str, Any]) -> Any:
        has_mask = request.get("type") == "add_prompt" and request.get("mask")
        if has_mask:
            video_predictor._pending_pixel_mask = request.get("mask")
            video_predictor._pending_pixel_mask_obj = request.get("obj_id")
            # Upstream has no mask field and rejects prompt-less requests.
            # Empty points select its SAM2 branch; add_new_points below swaps
            # that internal call for the tracker's pixel-mask path.
            if (
                request.get("points") is None
                and request.get("bounding_boxes") is None
                and request.get("text") is None
            ):
                import torch

                request = dict(request)
                request["points"] = torch.empty((1, 0, 2), dtype=torch.float32)
                request["point_labels"] = torch.empty((1, 0), dtype=torch.int32)
        else:
            video_predictor._pending_pixel_mask = None
            video_predictor._pending_pixel_mask_obj = None
        return orig_handle(request)

    video_predictor.handle_request = handle_request

    model = getattr(video_predictor, "model", None)
    tracker_wrap = getattr(model, "tracker", None) if model is not None else None
    # Sam3MultiplexTracking calls ``self.tracker.add_new_points`` on this
    # wrapper.  Patch that public object so its proxy does not bypass us.
    tracker = tracker_wrap
    if tracker is None or not hasattr(tracker, "add_new_points"):
        tracker = (
            getattr(tracker_wrap, "model", None)
            if tracker_wrap is not None
            else None
        )
    if tracker is None or not hasattr(tracker, "add_new_points"):
        video_predictor._sam31_pixel_mask_prior_patched = True
        return

    # Documented SAM2 mask-input: prev logits into the decoder with points.
    # The public multiplex wrapper proxies reads to ``.model`` but does not
    # proxy assignments; set the flag on both layers so point+Prior uses it.
    tracker_impl = getattr(tracker_wrap, "model", None)
    tracker.iter_use_prev_mask_pred = True
    if tracker_impl is not None:
        tracker_impl.iter_use_prev_mask_pred = True
    orig_add = tracker.add_new_points
    orig_add_masks = getattr(tracker, "add_new_masks", None)

    def add_new_points(
        self: Any,
        inference_state: dict[str, Any],
        frame_idx: int,
        obj_id: int,
        points: Any,
        labels: Any,
        clear_old_points: bool,
        **kwargs: Any,
    ) -> Any:
        pending = getattr(video_predictor, "_pending_pixel_mask", None)
        pending_obj = getattr(video_predictor, "_pending_pixel_mask_obj", None)
        if pending is not None and (
            pending_obj is None or int(pending_obj) == int(obj_id)
        ):
            if points is not None and int(points.numel()) == 0:
                if orig_add_masks is None:
                    raise RuntimeError("SAM 3.1 tracker has no mask-only input path")
                mask_hw = _rle_to_hw_tensor(pending, inference_state.get("device"))
                if mask_hw is None:
                    raise ValueError("Mask Prior must contain a non-empty raster")
                video_predictor._pending_pixel_mask = None
                video_predictor._pending_pixel_mask_obj = None
                # Existing slot: recondition only. A second add_new_masks
                # appends the same obj_id and the next point refine hits
                # "object IDs must be unique".
                result = orig_add_masks(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_ids=[int(obj_id)],
                    masks=(mask_hw.unsqueeze(0) > 0.5),
                    reconditioning=_obj_in_multiplex(
                        inference_state, int(obj_id)
                    ),
                )
                # ``add_sam2_new_points`` has a cleanup pass that treats a
                # frame with only a mask input as detector-only and removes
                # it before preflight. Keep the empty dispatcher sentinel as
                # a point-input key so this user mask remains consolidated.
                obj_idx = self._obj_id_to_idx(inference_state, int(obj_id))
                inference_state["point_inputs_per_obj"][obj_idx][frame_idx] = {
                    "point_coords": points,
                    "point_labels": labels,
                }
                return result
            _prime_sam2_mask_prior(
                self,
                inference_state,
                frame_idx=int(frame_idx),
                obj_id=int(obj_id),
                mask=pending,
            )
            video_predictor._pending_pixel_mask = None
            video_predictor._pending_pixel_mask_obj = None
        return orig_add(
            inference_state,
            frame_idx,
            obj_id,
            points,
            labels,
            clear_old_points,
            **kwargs,
        )

    import types

    tracker.add_new_points = types.MethodType(add_new_points, tracker)
    video_predictor._sam31_pixel_mask_prior_patched = True


def build_predictor(settings: Settings) -> Predictor:
    """Factory: default fake; ``PREDICTOR_BACKEND=sam31`` loads multiplex worker."""
    if settings.predictor_backend == "sam31":
        return Sam31Predictor(
            checkpoint=settings.sam31_checkpoint,
            sam3_repo=settings.sam31_repo,
            gpu_id=settings.gpu_id,
        )
    return FakePredictor()
