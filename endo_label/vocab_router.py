"""Desk-wide customizable name lists for phase / class / triplet."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label.config import Settings
from endo_label import labels_store

_LISTS = ("phases", "class_tags", "instruments", "verbs", "targets")
_RENAMEABLE = frozenset(labels_store.RENAME_LISTS)


class VocabAddBody(BaseModel):
    name: str = Field(..., min_length=1)


class VocabRenameBody(BaseModel):
    from_name: str = Field(..., alias="from")
    to_name: str = Field(..., alias="to")

    model_config = {"populate_by_name": True}


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

    @router.post("/api/vocab/{list_name}/rename")
    def rename_name(list_name: str, body: VocabRenameBody) -> dict:
        if list_name not in _LISTS:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        if list_name not in _RENAMEABLE:
            raise HTTPException(status_code=400, detail=f"rename not supported: {list_name}")
        old = body.from_name.strip()
        new = body.to_name.strip()
        if not new:
            raise HTTPException(status_code=400, detail="empty name")
        vocab = labels_store.load_vocab(settings)
        bucket = list(vocab.get(list_name) or [])
        if old not in bucket:
            raise HTTPException(status_code=400, detail=f"unknown name: {old}")
        if new in bucket:
            raise HTTPException(status_code=409, detail=f"already present: {new}")
        return labels_store.rename_vocab_name(settings, list_name, old, new)

    return router
