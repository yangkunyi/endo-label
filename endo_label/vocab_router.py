"""Desk-wide customizable name lists for phase / class / triplet."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from endo_label.config import Settings
from endo_label.coordination import db_path
from endo_label.registry import (
    RegistryConflict,
    RegistryItemNotFound,
    create_item,
    desk_vocab,
    find_active,
    rename_item,
    set_archived,
)

_LISTS = {"phases": "phase", "class_tags": "class"}


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


class VocabTripleRenameBody(BaseModel):
    from_triple: VocabTripleBody = Field(..., alias="from")
    to_triple: VocabTripleBody = Field(..., alias="to")

    model_config = {"populate_by_name": True}


def make_router(settings: Settings) -> APIRouter:
    router = APIRouter(tags=["vocab"])

    def _path():
        return db_path(settings)

    def _vocab() -> dict:
        return desk_vocab(_path())

    def _stripped_triple(body: VocabTripleBody) -> tuple[str, str, str]:
        instrument = body.instrument.strip()
        verb = body.verb.strip()
        target = body.target.strip()
        if not instrument or not verb or not target:
            raise HTTPException(status_code=400, detail="empty name")
        return instrument, verb, target

    def _already_present(exc: RegistryConflict) -> HTTPException:
        return HTTPException(status_code=409, detail=f"already present: {exc}")

    @router.get("/api/vocab")
    def get_vocab() -> dict:
        return _vocab()

    @router.post("/api/vocab/triples")
    def add_triple(body: VocabTripleBody) -> dict:
        instrument, verb, target = _stripped_triple(body)
        try:
            create_item(
                _path(),
                "triplet",
                instrument=instrument,
                verb=verb,
                target=target,
            )
        except RegistryConflict as exc:
            raise _already_present(exc) from None
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from None
        return _vocab()

    @router.delete("/api/vocab/triples")
    def delete_triple(instrument: str, verb: str, target: str) -> dict:
        instrument, verb, target = instrument.strip(), verb.strip(), target.strip()
        if not instrument or not verb or not target:
            raise HTTPException(status_code=400, detail="empty name")
        try:
            item = find_active(
                _path(),
                "triplet",
                instrument=instrument,
                verb=verb,
                target=target,
            )
        except (ValueError, RegistryItemNotFound):
            raise HTTPException(
                status_code=400,
                detail=f"unknown triple: {instrument} / {verb} / {target}",
            ) from None
        set_archived(_path(), item.id, True)
        return _vocab()

    @router.post("/api/vocab/triples/rename")
    def rename_triple(body: VocabTripleRenameBody) -> dict:
        from_inst, from_verb, from_targ = _stripped_triple(body.from_triple)
        to_inst, to_verb, to_targ = _stripped_triple(body.to_triple)
        try:
            item = find_active(
                _path(),
                "triplet",
                instrument=from_inst,
                verb=from_verb,
                target=from_targ,
            )
        except (ValueError, RegistryItemNotFound):
            raise HTTPException(
                status_code=400,
                detail=f"unknown triple: {from_inst} / {from_verb} / {from_targ}",
            ) from None
        try:
            rename_item(
                _path(),
                item.id,
                instrument=to_inst,
                verb=to_verb,
                target=to_targ,
            )
        except RegistryConflict as exc:
            raise _already_present(exc) from None
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from None
        return _vocab()

    @router.post("/api/vocab/{list_name}")
    def add_name(list_name: str, body: VocabAddBody) -> dict:
        kind = _LISTS.get(list_name)
        if kind is None:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="empty name")
        try:
            create_item(_path(), kind, name=name)
        except RegistryConflict as exc:
            raise _already_present(exc) from None
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from None
        return _vocab()

    @router.post("/api/vocab/{list_name}/rename")
    def rename_name(list_name: str, body: VocabRenameBody) -> dict:
        kind = _LISTS.get(list_name)
        if kind is None:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        old = body.from_name.strip()
        new = body.to_name.strip()
        if not new:
            raise HTTPException(status_code=400, detail="empty name")
        try:
            item = find_active(_path(), kind, name=old)
        except (ValueError, RegistryItemNotFound):
            raise HTTPException(status_code=400, detail=f"unknown name: {old}") from None
        try:
            rename_item(_path(), item.id, name=new)
        except RegistryConflict as exc:
            raise _already_present(exc) from None
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from None
        return _vocab()

    @router.delete("/api/vocab/{list_name}/{name}")
    def delete_name(list_name: str, name: str) -> dict:
        kind = _LISTS.get(list_name)
        if kind is None:
            raise HTTPException(status_code=404, detail=f"unknown list: {list_name}")
        try:
            item = find_active(_path(), kind, name=name)
        except (ValueError, RegistryItemNotFound):
            raise HTTPException(status_code=400, detail=f"unknown name: {name}") from None
        set_archived(_path(), item.id, True)
        return _vocab()

    return router
