"""Triplet HTTP: rows on a Frame, no Track required."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.config import Settings
from endo_label import labels_store


class TripletBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["triplet"])

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    def _next_id(rows: list[dict]) -> int:
        if not rows:
            return 1
        return max(int(r.get("id", 0)) for r in rows) + 1

    @router.get("/api/triplet/{clip_id}")
    def get_clip_triplet(clip_id: str) -> dict:
        _meta(clip_id)
        return labels_store.load_clip(settings, "triplet", clip_id)

    @router.post("/api/triplet/{clip_id}/frames/{frame_index}")
    def add_triplet(clip_id: str, frame_index: int, body: TripletBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])
        row = {
            "id": _next_id(rows),
            "instrument": body.instrument,
            "verb": body.verb,
            "target": body.target,
        }
        rows.append(row)
        doc["frames"][key] = rows
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return row

    @router.delete("/api/triplet/{clip_id}/frames/{frame_index}/{triplet_id}")
    def delete_triplet(clip_id: str, frame_index: int, triplet_id: int) -> dict:
        _meta(clip_id)
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])
        kept = [r for r in rows if int(r.get("id", -1)) != triplet_id]
        if len(kept) == len(rows):
            raise HTTPException(status_code=404, detail=f"triplet not found: {triplet_id}")
        if kept:
            doc["frames"][key] = kept
        else:
            doc["frames"].pop(key, None)
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return doc

    return router
