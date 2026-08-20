"""Phase HTTP: exclusive label per Frame; optional span write."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.config import Settings
from endo_label import labels_store


class PhaseSpanBody(BaseModel):
    phase: str = Field(..., min_length=1)
    from_frame: int = Field(..., ge=0, alias="from")
    to_frame: int = Field(..., ge=0, alias="to")

    model_config = {"populate_by_name": True}


class PhaseFrameBody(BaseModel):
    phase: str | None = None


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["phase"])

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    @router.get("/api/phase/{clip_id}")
    def get_clip_phase(clip_id: str) -> dict:
        _meta(clip_id)
        return labels_store.load_clip(settings, "phase", clip_id)

    @router.put("/api/phase/{clip_id}/frames/{frame_index}")
    def put_frame_phase(clip_id: str, frame_index: int, body: PhaseFrameBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        doc = labels_store.load_clip(settings, "phase", clip_id)
        key = str(frame_index)
        if body.phase is None:
            doc["frames"].pop(key, None)
        else:
            doc["frames"][key] = body.phase
        labels_store.save_clip(settings, "phase", clip_id, doc)
        return doc

    @router.post("/api/phase/{clip_id}/span")
    def paint_span(clip_id: str, body: PhaseSpanBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        a, b = body.from_frame, body.to_frame
        if a > b:
            a, b = b, a
        if a < 0 or b >= n:
            raise HTTPException(status_code=400, detail="span out of range")
        doc = labels_store.load_clip(settings, "phase", clip_id)
        for i in range(a, b + 1):
            doc["frames"][str(i)] = body.phase
        labels_store.save_clip(settings, "phase", clip_id, doc)
        return doc

    return router
