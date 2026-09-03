"""Desk-wide customizable name lists for phase / class / triplet."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label.config import Settings
from endo_label import labels_store

_LISTS = ("phases", "class_tags")
_RENAMEABLE = frozenset(labels_store.RENAME_LISTS)


class VocabAddBody(BaseModel):
    name: str = Field(..., min_length=1)


class VocabRenameBody(BaseModel):
    from_name: str = Field(..., alias="from")
    to_name: str = Field(..., alias="to")

    model_config = {"populate_by_name": True}


class VocabTripleBody(BaseModel):
    instrument: str = Field(..., min_length=1)
    verb: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["vocab"])

    def _stripped_triple(body: VocabTripleBody) -> tuple[str, str, str]:
        instrument = body.instrument.strip()
        verb = body.verb.strip()
        target = body.target.strip()
        if not instrument or not verb or not target:
            raise HTTPException(status_code=400, detail="empty name")
        return instrument, verb, target

    @router.get("/api/vocab")
    def get_vocab() -> dict:
        return labels_store.load_vocab(settings)

    @router.post("/api/vocab/triples")
    def add_triple(body: VocabTripleBody) -> dict:
        instrument, verb, target = _stripped_triple(body)
        vocab = labels_store.load_vocab(settings)
        if labels_store.vocab_has_triple(vocab, instrument, verb, target):
            raise HTTPException(
                status_code=409,
                detail=f"already present: {instrument} / {verb} / {target}",
            )
        triples = list(vocab.get("triples") or [])
        triples.append({"instrument": instrument, "verb": verb, "target": target})
        vocab["triples"] = triples
        labels_store.save_vocab(settings, vocab)
        return vocab

    @router.delete("/api/vocab/triples")
    def delete_triple(instrument: str, verb: str, target: str) -> dict:
        instrument, verb, target = instrument.strip(), verb.strip(), target.strip()
        if not instrument or not verb or not target:
            raise HTTPException(status_code=400, detail="empty name")
        vocab = labels_store.load_vocab(settings)
        if not labels_store.vocab_has_triple(vocab, instrument, verb, target):
            raise HTTPException(
                status_code=400,
                detail=f"unknown triple: {instrument} / {verb} / {target}",
            )
        return labels_store.delete_vocab_triple(settings, instrument, verb, target)

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

    @router.delete("/api/vocab/{list_name}/{name}")
    def delete_name(list_name: str, name: str) -> dict:
        if list_name not in _LISTS:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        vocab = labels_store.load_vocab(settings)
        bucket = list(vocab.get(list_name) or [])
        if name not in bucket:
            raise HTTPException(status_code=400, detail=f"unknown name: {name}")
        return labels_store.delete_vocab_name(settings, list_name, name)

    return router
