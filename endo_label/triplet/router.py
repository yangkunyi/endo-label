"""Triplet HTTP: rows on a Frame, no Track required."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label import catalog
from endo_label.config import Settings
from endo_label.coordination import db_path
from endo_label import labels_store
from endo_label.registry import RegistryItemNotFound, find_active, triple_cells


class TripletBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)


class TripletSpanBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    from_frame: int = Field(..., ge=0, alias="from")
    to_frame: int = Field(..., ge=0, alias="to")
    op: Literal["add", "remove"]

    model_config = {"populate_by_name": True}


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["triplet"])

    def _path():
        return db_path(settings)

    def _meta(clip_id: str) -> dict:
        try:
            return catalog.clip_meta(settings, clip_id)
        except catalog.ClipNotFound:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    def _next_id(rows: list[dict]) -> int:
        if not rows:
            return 1
        return max(int(r.get("id", 0)) for r in rows) + 1

    def _cells():
        return triple_cells(_path())

    def _view(doc: dict) -> dict:
        return labels_store.http_triplet(doc, _cells())

    def _require_vocab_triple(instrument: str, verb: str, target: str) -> int:
        try:
            return find_active(
                _path(),
                "triplet",
                instrument=instrument,
                verb=verb,
                target=target,
            ).id
        except (ValueError, RegistryItemNotFound):
            raise HTTPException(
                status_code=400,
                detail=f"unknown triple: {instrument} / {verb} / {target}",
            ) from None

    def _same_vocab(row: dict, vocab_id: int) -> bool:
        return labels_store.stored_id(row.get("vocab_id")) == vocab_id

    @router.get("/api/triplet/{clip_id}")
    def get_clip_triplet(clip_id: str) -> dict:
        _meta(clip_id)
        return _view(labels_store.load_clip(settings, "triplet", clip_id))

    @router.post("/api/triplet/{clip_id}/frames/{frame_index}")
    def add_triplet(clip_id: str, frame_index: int, body: TripletBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        vocab_id = _require_vocab_triple(body.instrument, body.verb, body.target)
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])

        if any(_same_vocab(row, vocab_id) for row in rows):
            kept = [row for row in rows if not _same_vocab(row, vocab_id)]
            if kept:
                doc["frames"][key] = kept
            else:
                doc["frames"].pop(key, None)
            labels_store.save_clip(settings, "triplet", clip_id, doc)
            viewed = _view({"clip_id": clip_id, "frames": {key: kept}})
            return {"rows": viewed["frames"].get(key, [])}
        row = {"id": _next_id(rows), "vocab_id": vocab_id}
        rows.append(row)
        doc["frames"][key] = rows
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return {
            "id": row["id"],
            "instrument": body.instrument,
            "verb": body.verb,
            "target": body.target,
        }

    @router.put("/api/triplet/{clip_id}/frames/{frame_index}/{triplet_id}")
    def put_triplet(clip_id: str, frame_index: int, triplet_id: int, body: TripletBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        if frame_index < 0 or frame_index >= n:
            raise HTTPException(status_code=404, detail=f"Frame index out of range: {frame_index}")
        vocab_id = _require_vocab_triple(body.instrument, body.verb, body.target)
        doc = labels_store.load_clip(settings, "triplet", clip_id)
        key = str(frame_index)
        rows = list(doc["frames"].get(key) or [])
        found = False
        for row in rows:
            if int(row.get("id", -1)) == triplet_id:
                row["vocab_id"] = vocab_id
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail=f"triplet not found: {triplet_id}")
        doc["frames"][key] = rows
        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return _view(doc)

    @router.post("/api/triplet/{clip_id}/span")
    def paint_span(clip_id: str, body: TripletSpanBody) -> dict:
        meta = _meta(clip_id)
        n = int(meta["frame_count"])
        a, b = body.from_frame, body.to_frame
        if a > b:
            a, b = b, a
        if a < 0 or b >= n:
            raise HTTPException(status_code=400, detail="span out of range")
        vocab_id = _require_vocab_triple(body.instrument, body.verb, body.target)

        doc = labels_store.load_clip(settings, "triplet", clip_id)
        for i in range(a, b + 1):
            key = str(i)
            rows = list(doc["frames"].get(key) or [])
            if body.op == "add":
                if not any(_same_vocab(row, vocab_id) for row in rows):
                    rows.append({"id": _next_id(rows), "vocab_id": vocab_id})
            else:
                rows = [row for row in rows if not _same_vocab(row, vocab_id)]
            if rows:
                doc["frames"][key] = rows
            else:
                doc["frames"].pop(key, None)

        labels_store.save_clip(settings, "triplet", clip_id, doc)
        return _view(doc)

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
        return _view(doc)

    return router
