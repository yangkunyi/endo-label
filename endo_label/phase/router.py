"""Phase HTTP: exclusive label per Frame; optional span write."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.auth import (
    require_label_assignee,
    require_label_write,
    with_clip_version,
    with_new_version,
)
from endo_label.config import Settings
from endo_label import labels_store


class PhaseSpanBody(BaseModel):
    phase: str | None = Field(...)
    from_frame: int = Field(..., ge=0, alias="from")
    to_frame: int = Field(..., ge=0, alias="to")
    version: int | None = None

    model_config = {"populate_by_name": True}


class PhaseFrameBody(BaseModel):
    phase: str | None = None
    version: int | None = None


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["phase"])

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    def _require_phase_name(name: str) -> None:
        phases = labels_store.load_vocab(settings).get("phases") or []
        if name not in phases:
            raise HTTPException(status_code=400, detail=f"unknown phase: {name}")

    @router.get("/api/phase/{clip_id}")
    def get_clip_phase(clip_id: str, request: Request) -> dict:
        _meta(clip_id)
        return with_clip_version(request, clip_id, labels_store.load_clip(settings, "phase", clip_id))

    @router.put("/api/phase/{clip_id}/frames/{frame_index}")
    def put_frame_phase(
        clip_id: str, frame_index: int, body: PhaseFrameBody, request: Request
    ) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        require_label_assignee(request, clip_id, "phase")
        if body.phase is not None:
            _require_phase_name(body.phase)
        new_version = require_label_write(request, clip_id, "phase", body.version)
        doc = labels_store.load_clip(settings, "phase", clip_id)
        key = str(frame_index)
        if body.phase is None:
            doc["frames"].pop(key, None)
        else:
            doc["frames"][key] = body.phase
        labels_store.save_clip(settings, "phase", clip_id, doc)
        return with_new_version(doc, new_version)

    @router.post("/api/phase/{clip_id}/span")
    def paint_span(clip_id: str, body: PhaseSpanBody, request: Request) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        a, b = body.from_frame, body.to_frame
        if a > b:
            a, b = b, a
        if a < 0 or b >= n:
            raise HTTPException(status_code=400, detail="span out of range")
        require_label_assignee(request, clip_id, "phase")
        if body.phase is not None:
            _require_phase_name(body.phase)
        new_version = require_label_write(request, clip_id, "phase", body.version)
        doc = labels_store.load_clip(settings, "phase", clip_id)
        for i in range(a, b + 1):
            key = str(i)
            if body.phase is None:
                doc["frames"].pop(key, None)
            else:
                doc["frames"][key] = body.phase
        labels_store.save_clip(settings, "phase", clip_id, doc)
        return with_new_version(doc, new_version)

    return router
