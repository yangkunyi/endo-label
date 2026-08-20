"""Class HTTP: stackable named flags on a Frame."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.config import Settings
from endo_label import labels_store


class ClassBody(BaseModel):
    tags: list[str] = Field(default_factory=list)


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["class"])

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    @router.get("/api/class/{clip_id}")
    def get_clip_class(clip_id: str) -> dict:
        _meta(clip_id)
        return labels_store.load_clip(settings, "class", clip_id)

    @router.put("/api/class/{clip_id}/frames/{frame_index}")
    def put_frame_class(clip_id: str, frame_index: int, body: ClassBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        doc = labels_store.load_clip(settings, "class", clip_id)
        key = str(frame_index)
        tags = list(dict.fromkeys(body.tags))
        if not tags:
            doc["frames"].pop(key, None)
        else:
            doc["frames"][key] = tags
        labels_store.save_clip(settings, "class", clip_id, doc)
        return doc

    return router
