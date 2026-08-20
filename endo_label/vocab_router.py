"""Desk-wide customizable name lists for phase / class / triplet."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label.config import Settings
from endo_label import labels_store

_LISTS = ("phases", "class_tags", "instruments", "verbs", "targets")


class VocabAddBody(BaseModel):
    name: str = Field(..., min_length=1)


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["vocab"])

    @router.get("/api/vocab")
    def get_vocab() -> dict:
        return labels_store.load_vocab(settings)

    @router.post("/api/vocab/{list_name}")
    def add_name(list_name: str, body: VocabAddBody) -> dict:
        if list_name not in _LISTS:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        vocab = labels_store.load_vocab(settings)
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="empty name")
        bucket = list(vocab.get(list_name) or [])
        if name in bucket:
            raise HTTPException(status_code=409, detail=f"already present: {name}")
        bucket.append(name)
        vocab[list_name] = bucket
        labels_store.save_vocab(settings, vocab)
        return vocab

    return router
