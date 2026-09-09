"""Triplet HTTP: rows on a Frame, no Track required."""

from __future__ import annotations

from typing import Literal

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


class TripletBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    version: int | None = None


class TripletSpanBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    from_frame: int = Field(..., ge=0, alias="from")
    to_frame: int = Field(..., ge=0, alias="to")
    op: Literal["add", "remove"]
    version: int | None = None

    model_config = {"populate_by_name": True}


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

    def _require_vocab_triple(instrument: str, verb: str, target: str) -> None:
        vocab = labels_store.load_vocab(settings)
        if not labels_store.vocab_has_triple(vocab, instrument, verb, target):
            raise HTTPException(
                status_code=400,
                detail=f"unknown triple: {instrument} / {verb} / {target}",
            )

    @router.get("/api/triplet/{clip_id}")
    def get_clip_triplet(clip_id: str, request: Request) -> dict:
        _meta(clip_id)
        return with_clip_version(
            request, clip_id, labels_store.load_clip(settings, "triplet", clip_id)
        )

    @router.post("/api/triplet/{clip_id}/frames/{frame_index}")
    def add_triplet(
        clip_id: str, frame_index: int, body: TripletBody, request: Request
    ) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        require_label_assignee(request, clip_id, "triplet")
        _require_vocab_triple(body.instrument, body.verb, body.target)
        require_label_write(request, clip_id, "triplet", body.version)
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])

        def _same(row: dict) -> bool:
            return (
                row.get("instrument") == body.instrument
                and row.get("verb") == body.verb
                and row.get("target") == body.target
            )

        if any(_same(row) for row in rows):
            kept = [row for row in rows if not _same(row)]
            if kept:
                doc["frames"][key] = kept
            else:
                doc["frames"].pop(key, None)
            labels_store.save_clip(settings, "triplet", clip_id, doc)
            return {"rows": kept}
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

    @router.put("/api/triplet/{clip_id}/frames/{frame_index}/{triplet_id}")
    def put_triplet(
        clip_id: str, frame_index: int, triplet_id: int, body: TripletBody, request: Request
    ) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        require_label_assignee(request, clip_id, "triplet")
        _require_vocab_triple(body.instrument, body.verb, body.target)
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])
        found = False
        for row in rows:
            if int(row.get("id", -1)) == triplet_id:
                row["instrument"] = body.instrument
                row["verb"] = body.verb
                row["target"] = body.target
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail=f"triplet not found: {triplet_id}")
        new_version = require_label_write(request, clip_id, "triplet", body.version)
        doc["frames"][key] = rows
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return with_new_version(doc, new_version)

    @router.post("/api/triplet/{clip_id}/span")
    def paint_span(clip_id: str, body: TripletSpanBody, request: Request) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        a, b = body.from_frame, body.to_frame
        if a > b:
            a, b = b, a
        if a < 0 or b >= n:
            raise HTTPException(status_code=400, detail="span out of range")
        require_label_assignee(request, clip_id, "triplet")
        _require_vocab_triple(body.instrument, body.verb, body.target)
        new_version = require_label_write(request, clip_id, "triplet", body.version)

        doc = labels_store.load_clip(settings, "triplet", clip_id)
        for i in range(a, b + 1):
            key = str(i)
            rows = list(doc["frames"].get(key) or [])
            if body.op == "add":
                if not any(
                    row.get("instrument") == body.instrument
                    and row.get("verb") == body.verb
                    and row.get("target") == body.target
                    for row in rows
                ):
                    rows.append(
                        {
                            "id": _next_id(rows),
                            "instrument": body.instrument,
                            "verb": body.verb,
                            "target": body.target,
                        }
                    )
            else:
                rows = [
                    row
                    for row in rows
                    if not (
                        row.get("instrument") == body.instrument
                        and row.get("verb") == body.verb
                        and row.get("target") == body.target
                    )
                ]
            if rows:
                doc["frames"][key] = rows
            else:
                doc["frames"].pop(key, None)

        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return with_new_version(doc, new_version)

    @router.delete("/api/triplet/{clip_id}/frames/{frame_index}/{triplet_id}")
    def delete_triplet(
        clip_id: str, frame_index: int, triplet_id: int, request: Request, version: int | None = None
    ) -> dict:
        _meta(clip_id)
        require_label_assignee(request, clip_id, "triplet")
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])
        kept = [r for r in rows if int(r.get("id", -1)) != triplet_id]
        if len(kept) == len(rows):
            raise HTTPException(status_code=404, detail=f"triplet not found: {triplet_id}")
        new_version = require_label_write(request, clip_id, "triplet", version)
        if kept:
            doc["frames"][key] = kept
        else:
            doc["frames"].pop(key, None)
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return with_new_version(doc, new_version)

    return router
