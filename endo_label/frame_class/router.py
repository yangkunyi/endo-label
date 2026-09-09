"""Class HTTP: stackable named flags on a Frame."""

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


class ClassBody(BaseModel):
    tags: list[str] = Field(default_factory=list)
    version: int | None = None


class ClassSpanBody(BaseModel):
    tag: str = Field(..., min_length=1)
    from_frame: int = Field(..., ge=0, alias="from")
    to_frame: int = Field(..., ge=0, alias="to")
    on: bool
    version: int | None = None

    model_config = {"populate_by_name": True}


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["class"])

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    def _require_class_name(name: str) -> None:
        tags = labels_store.load_vocab(settings).get("class_tags") or []
        if name not in tags:
            raise HTTPException(status_code=400, detail=f"unknown class: {name}")

    @router.get("/api/class/{clip_id}")
    def get_clip_class(clip_id: str, request: Request) -> dict:
        _meta(clip_id)
        return with_clip_version(request, clip_id, labels_store.load_clip(settings, "class", clip_id))

    @router.put("/api/class/{clip_id}/frames/{frame_index}")
    def put_frame_class(
        clip_id: str, frame_index: int, body: ClassBody, request: Request
    ) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        require_label_assignee(request, clip_id, "class")
        tags = list(dict.fromkeys(body.tags))
        for name in tags:
            _require_class_name(name)
        new_version = require_label_write(request, clip_id, "class", body.version)
        doc = labels_store.load_clip(settings, "class", clip_id)
        key = str(frame_index)
        if not tags:
            doc["frames"].pop(key, None)
        else:
            doc["frames"][key] = tags
        labels_store.save_clip(settings, "class", clip_id, doc)
        return with_new_version(doc, new_version)

    @router.post("/api/class/{clip_id}/span")
    def paint_span(clip_id: str, body: ClassSpanBody, request: Request) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        a, b = body.from_frame, body.to_frame
        if a > b:
            a, b = b, a
        if a < 0 or b >= n:
            raise HTTPException(status_code=400, detail="span out of range")
        require_label_assignee(request, clip_id, "class")
        _require_class_name(body.tag)
        new_version = require_label_write(request, clip_id, "class", body.version)

        doc = labels_store.load_clip(settings, "class", clip_id)
        for i in range(a, b + 1):
            key = str(i)
            tags = list(dict.fromkeys(doc["frames"].get(key) or []))
            if body.on:
                if body.tag not in tags:
                    tags.append(body.tag)
            else:
                tags = [tag for tag in tags if tag != body.tag]
            if tags:
                doc["frames"][key] = tags
            else:
                doc["frames"].pop(key, None)
        labels_store.save_clip(settings, "class", clip_id, doc)
        return with_new_version(doc, new_version)

    return router
