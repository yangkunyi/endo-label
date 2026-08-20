"""In-process ScribbleSam2Memory worker (weights via SCRIBBLE_* paths).

Loads the existing model classes from the station tree next to those
paths. Does not import that station's HTTP app, login, ledger, or
SAM 3.1 pool, and does not call ports 7860 / 7861 / 7862.
"""

from __future__ import annotations

import os
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from endo_label.config import Settings
from endo_label.mask.mask_codec import (
    MASK_FORMAT,
    binary_numpy_to_rle,
    decode_rle,
    empty_mask,
    fill_polyline_rel,
    mask_area,
)
from endo_label.mask.scribble import (
    UnreadyScribbleModel,
    resolve_scribble_widths,
)

MaskRle = dict[str, Any]
_MemoryKey = tuple[str, int, int]
_FrameKey = tuple[str, int]

IMAGE_SIZE = 1024
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)


def infer_scribble_repo(
    model_path: Path | None, ckpt_path: Path | None
) -> Path:
    """Walk parents of the weight paths until scribbleprompt_sam2 + sam2 exist."""
    for start in (ckpt_path, model_path):
        if start is None:
            continue
        for parent in Path(start).resolve().parents:
            if (parent / "scribbleprompt_sam2").is_dir() and (
                parent / "sam2"
            ).is_dir():
                return parent
    raise FileNotFoundError(
        "ScribbleSam2Memory code not found next to "
        "SCRIBBLE_MODEL_PATH / SCRIBBLE_SAM2_CHECKPOINT"
    )


def _silhouette(mask: MaskRle) -> MaskRle:
    return {
        "format": MASK_FORMAT,
        "size": list(mask.get("size") or [0, 0]),
        "counts": [int(c) for c in (mask.get("counts") or [])],
    }


@dataclass
class _Slot:
    accumulated: Any = None
    memory_bank: Any = None
    memory_pos_bank: Any = None
    pending_prior: MaskRle | None = None


@dataclass
class _FrameCache:
    image: Any
    letterbox: dict[str, Any]
    cache: dict[str, Any] = field(default_factory=dict)


def _load_rgb(path: Path) -> Any:
    import numpy as np
    from PIL import Image

    return np.array(Image.open(path).convert("RGB"))


def _letterbox_rgb(img: Any, target: int) -> tuple[Any, dict[str, Any]]:
    import numpy as np
    from PIL import Image

    h, w = int(img.shape[0]), int(img.shape[1])
    scale = min(target / w, target / h)
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    resized = np.array(
        Image.fromarray(img).resize((new_w, new_h), Image.BILINEAR)
    )
    pad_x = (target - new_w) // 2
    pad_y = (target - new_h) // 2
    canvas = np.zeros((target, target, 3), dtype=img.dtype)
    canvas[pad_y : pad_y + new_h, pad_x : pad_x + new_w] = resized
    return canvas, {
        "scale": scale,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "resized_w": new_w,
        "resized_h": new_h,
        "orig_h": h,
        "orig_w": w,
    }


def _image_to_tensor(
    img: Any, device: str, target: int = IMAGE_SIZE
) -> tuple[Any, dict[str, Any]]:
    import torch

    square, info = _letterbox_rgb(img, target)
    tensor = torch.from_numpy(square).permute(2, 0, 1).float() / 255.0
    for channel, (mean, std) in enumerate(zip(_IMAGENET_MEAN, _IMAGENET_STD)):
        tensor[channel] = (tensor[channel] - mean) / std
    return tensor.unsqueeze(0).to(device), info


def _resize_nn(arr: Any, width: int, height: int) -> Any:
    import numpy as np
    from PIL import Image

    if arr.shape == (height, width):
        return arr
    im = Image.fromarray((arr > 0).astype(np.uint8) * 255, mode="L")
    im = im.resize((width, height), Image.NEAREST)
    return (np.array(im) > 127).astype(np.uint8)


def _rel_to_letterbox(
    point: list[float], info: dict[str, Any], target: int = IMAGE_SIZE
) -> list[float]:
    x = float(point[0]) * float(info["orig_w"])
    y = float(point[1]) * float(info["orig_h"])
    lx = x * float(info["scale"]) + float(info["pad_x"])
    ly = y * float(info["scale"]) + float(info["pad_y"])
    return [lx / target, ly / target]


def _sparse_points(candidate: Any, count: int = 8, radius: int = 7) -> Any:
    import numpy as np

    output = np.zeros_like(candidate, dtype=np.float32)
    try:
        import cv2

        score = cv2.distanceTransform(
            candidate.astype(np.uint8), cv2.DIST_L2, 5
        )
    except Exception:
        score = candidate.astype(np.float32)
    suppress = max(28, int(round(np.sqrt(max(1, int(candidate.sum()))) / 4)))
    for _ in range(count):
        flat = int(np.argmax(score))
        if float(score.flat[flat]) <= 0:
            break
        yy, xx = np.unravel_index(flat, score.shape)
        yy_i, xx_i = int(yy), int(xx)
        y0, y1 = max(0, yy_i - radius), min(score.shape[0], yy_i + radius + 1)
        x0, x1 = max(0, xx_i - radius), min(score.shape[1], xx_i + radius + 1)
        output[y0:y1, x0:x1] = 1.0
        sy0, sy1 = max(0, yy_i - suppress), min(
            score.shape[0], yy_i + suppress + 1
        )
        sx0, sx1 = max(0, xx_i - suppress), min(
            score.shape[1], xx_i + suppress + 1
        )
        score[sy0:sy1, sx0:sx1] = 0.0
    return output


def _dilate(binary: Any, kernel: int = 61) -> Any:
    import numpy as np

    try:
        import cv2

        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel, kernel))
        return (cv2.dilate(binary.astype(np.uint8), k) > 0).astype(np.uint8)
    except Exception:
        import torch
        import torch.nn.functional as F

        tensor = torch.from_numpy(binary.astype(np.float32))[None, None]
        pad = kernel // 2
        out = F.max_pool2d(tensor, kernel, stride=1, padding=pad)
        return (out[0, 0].numpy() > 0).astype(np.uint8)


class ScribbleSam2MemoryWorker:
    """Scribble Model port backed by one shared ScribbleSam2Memory.

    Scribble Memory is swapped per Session / Track / Frame so the single
    model instance cannot leak state across keys.
    """

    def __init__(
        self,
        *,
        model: Any,
        device: str,
        gpu_id: int | None = None,
        model_path: Path | None = None,
        sam2_checkpoint: Path | None = None,
        image_size: int = IMAGE_SIZE,
    ) -> None:
        self._model = model
        self._device = device
        self._gpu_id = gpu_id
        self._model_path = Path(model_path) if model_path else None
        self._sam2_checkpoint = (
            Path(sam2_checkpoint) if sam2_checkpoint else None
        )
        self._image_size = int(image_size)
        self._slots: dict[_MemoryKey, _Slot] = {}
        self._frames: dict[_FrameKey, _FrameCache] = {}
        self._lock = threading.Lock()

    def health(self) -> dict[str, Any]:
        name = self._model_path.name if self._model_path else "in-process"
        return {
            "ready": True,
            "status": "ready",
            "backend": "scribble",
            "message": f"ScribbleSam2Memory ready (model={name})",
            "gpu_id": self._gpu_id,
            "model_path": str(self._model_path) if self._model_path else None,
            "sam2_checkpoint": (
                str(self._sam2_checkpoint) if self._sam2_checkpoint else None
            ),
        }

    def load_memory(
        self,
        *,
        session_id: str,
        track_id: int,
        frame_index: int,
        mask: MaskRle,
    ) -> None:
        slot = self._slot(session_id, track_id, frame_index)
        # Refresh mask-memory on next predict. Keep accumulated ink.
        slot.pending_prior = _silhouette(mask)

    def clear_memory(
        self,
        *,
        session_id: str,
        track_id: int | None = None,
        frame_index: int | None = None,
    ) -> None:
        if track_id is None:
            drop = [k for k in self._slots if k[0] == session_id]
            drop_frames = [k for k in self._frames if k[0] == session_id]
        elif frame_index is None:
            drop = [
                k
                for k in self._slots
                if k[0] == session_id and k[1] == track_id
            ]
            drop_frames = []
        else:
            drop = [(session_id, track_id, frame_index)]
            drop_frames = []
        for key in drop:
            self._slots.pop(key, None)
        for key in drop_frames:
            self._frames.pop(key, None)

    def predict(
        self,
        *,
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        session_id: str,
        track_id: int,
        frame_index: int,
        frame_path: str | Path | None = None,
        scribble_widths: list[int] | None = None,
    ) -> MaskRle | None:
        import torch
        from torch.amp.autocast_mode import autocast

        frame = self._ensure_frame(session_id, frame_index, frame_path)
        slot = self._slot(session_id, track_id, frame_index)
        self._apply_pending_prior(slot, frame)

        latest = self._strokes_to_tensor(
            scribbles, scribble_labels, frame.letterbox, scribble_widths
        )
        acc = self._merge_accumulated(slot, latest)
        slot.accumulated = acc
        use_memory = slot.memory_bank is not None

        with self._lock:
            self._model._memory_bank = slot.memory_bank
            self._model._memory_pos_bank = slot.memory_pos_bank
            cuda = str(self._device).startswith("cuda")
            with torch.no_grad(), autocast("cuda", enabled=cuda):
                _low, high, _cache = self._model.forward_single_round(
                    image=frame.image,
                    latest_scribble=latest,
                    accumulated_scribble=acc,
                    box=None,
                    use_memory=use_memory,
                    update_memory=True,
                    **frame.cache,
                )
            slot.memory_bank = self._model._memory_bank
            slot.memory_pos_bank = self._model._memory_pos_bank

        binary = self._high_res_to_orig(high, frame.letterbox)
        encoded = binary_numpy_to_rle(binary)
        if mask_area(encoded) == 0:
            return None
        return encoded

    def _slot(self, session_id: str, track_id: int, frame_index: int) -> _Slot:
        key = (session_id, int(track_id), int(frame_index))
        slot = self._slots.get(key)
        if slot is None:
            slot = _Slot()
            self._slots[key] = slot
        return slot

    def _ensure_frame(
        self,
        session_id: str,
        frame_index: int,
        frame_path: str | Path | None,
    ) -> _FrameCache:
        key = (session_id, int(frame_index))
        cached = self._frames.get(key)
        if cached is not None:
            return cached
        if not frame_path:
            raise RuntimeError("Scribble worker needs this Frame's image path")
        rgb = _load_rgb(Path(frame_path))
        image, info = _image_to_tensor(
            rgb, self._device, target=self._image_size
        )
        import torch

        with torch.no_grad():
            backbone_out = self._model.forward_image(image)
            _unused, vision_feats, vision_pos_embeds, feat_sizes = (
                self._model._prepare_backbone_features(backbone_out)
            )
        del _unused
        cached = _FrameCache(
            image=image,
            letterbox=info,
            cache={
                "backbone_out": backbone_out,
                "vision_feats": vision_feats,
                "vision_pos_embeds": vision_pos_embeds,
                "feat_sizes": feat_sizes,
            },
        )
        self._frames[key] = cached
        return cached

    def _apply_pending_prior(self, slot: _Slot, frame: _FrameCache) -> None:
        import numpy as np
        import torch

        prior = slot.pending_prior
        if prior is None:
            return
        info = frame.letterbox
        orig = _rle_to_orig(prior, int(info["orig_h"]), int(info["orig_w"]))
        canvas = _orig_to_letterbox(orig, info, target=self._image_size)
        if slot.accumulated is None:
            positive = _sparse_points(canvas)
            ring = _dilate(canvas)
            ring[canvas > 0] = 0
            negative = _sparse_points(ring)
            slot.accumulated = torch.from_numpy(
                np.stack([positive, negative], axis=0)
            )[None].float().to(self._device)
        logits = torch.from_numpy(canvas.astype(np.float32) * 20.0 - 10.0)[
            None, None
        ].to(self._device)
        with self._lock, torch.no_grad():
            memory, memory_pos = self._model._encode_to_memory(
                vision_feats=frame.cache.get("vision_feats"),
                feat_sizes=frame.cache.get("feat_sizes"),
                pred_mask=logits,
            )
        slot.memory_bank = memory
        slot.memory_pos_bank = memory_pos
        slot.pending_prior = None

    def _strokes_to_tensor(
        self,
        scribbles: list[list[list[float]]],
        scribble_labels: list[int],
        info: dict[str, Any],
        scribble_widths: list[int] | None = None,
    ) -> Any:
        import numpy as np
        import torch

        pos = empty_mask(self._image_size, self._image_size)
        neg = empty_mask(self._image_size, self._image_size)
        widths = resolve_scribble_widths(scribbles, scribble_widths)
        for poly, lab, width in zip(scribbles, scribble_labels, widths):
            if not poly:
                continue
            mapped = [
                _rel_to_letterbox(list(p), info, target=self._image_size)
                for p in poly
            ]
            grid = pos if lab == 1 else neg
            fill_polyline_rel(
                grid, mapped, 1, half_width_px=max(0.5, float(width) / 2.0)
            )
        stacked = np.stack(
            [np.array(pos, dtype=np.float32), np.array(neg, dtype=np.float32)],
            axis=0,
        )
        return torch.from_numpy(stacked)[None].to(self._device)

    def _merge_accumulated(self, slot: _Slot, latest: Any) -> Any:
        import torch

        if slot.accumulated is None:
            return latest.clone()
        acc = slot.accumulated
        acc_pos = torch.maximum(acc[:, 0], latest[:, 0])
        acc_neg = torch.maximum(acc[:, 1], latest[:, 1])
        acc_pos = torch.where(latest[:, 1] > 0, torch.zeros_like(acc_pos), acc_pos)
        acc_neg = torch.where(latest[:, 0] > 0, torch.zeros_like(acc_neg), acc_neg)
        return torch.stack([acc_pos, acc_neg], dim=1)

    def _high_res_to_orig(self, high: Any, info: dict[str, Any]) -> Any:
        import numpy as np
        import torch

        logits = high[0, 0]
        if hasattr(logits, "detach"):
            logits = logits.detach()
        if hasattr(logits, "float"):
            logits = logits.float()
        if hasattr(logits, "cpu"):
            logits = logits.cpu()
        if hasattr(torch, "sigmoid") and hasattr(logits, "shape"):
            prob = torch.sigmoid(logits).numpy()
        else:
            prob = np.array(logits)
        binary = (prob > 0.5).astype(np.uint8)
        px, py = int(info["pad_x"]), int(info["pad_y"])
        rw, rh = int(info["resized_w"]), int(info["resized_h"])
        inner = binary[py : py + rh, px : px + rw]
        return _resize_nn(inner, int(info["orig_w"]), int(info["orig_h"]))


def _rle_to_orig(mask: MaskRle, height: int, width: int) -> Any:
    import numpy as np

    grid = decode_rle(mask)
    if not grid:
        return np.zeros((height, width), dtype=np.uint8)
    arr = np.array([[1 if v else 0 for v in row] for row in grid], dtype=np.uint8)
    return _resize_nn(arr, width, height)


def _orig_to_letterbox(
    orig: Any, info: dict[str, Any], target: int = IMAGE_SIZE
) -> Any:
    import numpy as np

    rw, rh = int(info["resized_w"]), int(info["resized_h"])
    px, py = int(info["pad_x"]), int(info["pad_y"])
    resized = _resize_nn(orig, rw, rh)
    canvas = np.zeros((target, target), dtype=np.uint8)
    canvas[py : py + rh, px : px + rw] = resized
    return canvas


def _resolve_device(gpu_id: int | None) -> str:
    import torch

    if gpu_id is not None:
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", str(gpu_id))
    if not torch.cuda.is_available():
        raise RuntimeError("Scribble worker needs CUDA")
    # After CUDA_VISIBLE_DEVICES remap, use the visible card — not physical 0/1/5.
    return "cuda"


def _load_weights(model: Any, model_path: Path) -> int:
    import torch

    ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    src = ckpt.get("model_state_dict", ckpt) if isinstance(ckpt, dict) else None
    if not isinstance(src, dict):
        raise RuntimeError(f"bad Scribble checkpoint: {model_path}")
    state = model.state_dict()
    loaded = 0
    for name, param in src.items():
        if name in state and hasattr(param, "shape") and state[name].shape == param.shape:
            state[name] = param
            loaded += 1
    if loaded == 0:
        raise RuntimeError(f"no ScribbleSam2Memory weights matched in {model_path}")
    model.load_state_dict(state, strict=False)
    return loaded


def try_build_scribble_sam2(settings: Settings) -> Any:
    """Load weights or return UnreadyScribbleModel. Never raises to the factory."""
    gpu_id = settings.scribble_gpu_id
    model_path = settings.scribble_model_path
    ckpt_path = settings.scribble_sam2_checkpoint
    try:
        if model_path is None or ckpt_path is None:
            raise FileNotFoundError("SCRIBBLE_MODEL_PATH and SCRIBBLE_SAM2_CHECKPOINT required")
        if not model_path.is_file():
            raise FileNotFoundError(f"Scribble weights not found: {model_path}")
        if not ckpt_path.is_file():
            raise FileNotFoundError(f"SAM2 checkpoint not found: {ckpt_path}")
        repo = infer_scribble_repo(model_path, ckpt_path)
        repo_s = str(repo.resolve())
        if repo_s not in sys.path:
            sys.path.insert(0, repo_s)
        device = _resolve_device(gpu_id)
        from scribbleprompt_sam2.models.ScribbleSam2Memory import (
            build_scribble_sam2_memory,
        )

        model = build_scribble_sam2_memory(
            config_file="configs/sam2.1/sam2.1_hiera_t.yaml",
            ckpt_path=str(ckpt_path),
            device=device,
            scribble_channels=2,
        )
        model.enable_mask_decoder_lora(rank=8, alpha=16.0)
        model.enable_memory_lora(rank=8, alpha=16.0)
        model.freeze_pretrained()
        _load_weights(model, model_path)
        model.eval()
        return ScribbleSam2MemoryWorker(
            model=model,
            device=device,
            gpu_id=gpu_id,
            model_path=model_path,
            sam2_checkpoint=ckpt_path,
        )
    except Exception as exc:
        return UnreadyScribbleModel(
            gpu_id=gpu_id,
            message=f"Scribble worker is not ready: {exc}",
        )
