"""Desk-wide customizable name lists for phase / class / triplet."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from endo_label.auth import require_admin, require_candidate_creator
from endo_label.capabilities import (
    may_create_candidate,
    may_edit_project_vocab,
    may_write_registry,
)
from endo_label.config import Settings
from endo_label.coordination import Account, ProjectNotFound, UnknownClip, clip_project_id, db_path
from endo_label.registry import (
    RegistryConflict,
    RegistryItemNotFound,
    create_candidate,
    create_item,
    desk_vocab,
    find_active,
    project_picker,
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


class CandidateCreateBody(BaseModel):
    kind: str
    clip_id: str = ""
    project_id: int | None = None
    name: str = ""
    instrument: str = ""
    verb: str = ""
    target: str = ""


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

    def _project_for_clip(clip_id: str) -> int:
        try:
            return clip_project_id(_path(), clip_id)
        except UnknownClip:
            raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}") from None

    @router.get("/api/vocab")
    def get_vocab(request: Request, clip_id: str | None = None) -> dict:
        if clip_id is None:
            return _vocab()
        project_id = _project_for_clip(clip_id)
        body = project_picker(_path(), project_id)
        account: Account = request.state.account
        body["clip_id"] = clip_id
        body["project_id"] = project_id
        body["permissions"] = {
            "vocab_edit": may_edit_project_vocab(
                admin=account.admin, reviewer=account.reviewer
            ),
            "registry_write": may_write_registry(admin=account.admin),
            "candidate_create": may_create_candidate(
                admin=account.admin,
                reviewer=account.reviewer,
                annotator=account.annotator,
            ),
        }
        return body

    @router.post("/api/vocab/candidates")
    def add_candidate(
        body: CandidateCreateBody,
        _: Account = Depends(require_candidate_creator),
    ) -> dict:
        if body.clip_id.strip():
            project_id = _project_for_clip(body.clip_id.strip())
        elif body.project_id is not None:
            project_id = body.project_id
        else:
            raise HTTPException(status_code=400, detail="clip_id is required")
        try:
            candidate = create_candidate(
                _path(),
                project_id,
                body.kind,
                name=body.name,
                instrument=body.instrument,
                verb=body.verb,
                target=body.target,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        except ProjectNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from None
        return candidate.as_dict()

    @router.post("/api/vocab/triples")
    def add_triple(
        body: VocabTripleBody, _: Account = Depends(require_admin)
    ) -> dict:
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
    def delete_triple(
        instrument: str,
        verb: str,
        target: str,
        _: Account = Depends(require_admin),
    ) -> dict:
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
    def rename_triple(
        body: VocabTripleRenameBody, _: Account = Depends(require_admin)
    ) -> dict:
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
    def add_name(
        list_name: str, body: VocabAddBody, _: Account = Depends(require_admin)
    ) -> dict:
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
    def rename_name(
        list_name: str, body: VocabRenameBody, _: Account = Depends(require_admin)
    ) -> dict:
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
    def delete_name(
        list_name: str, name: str, _: Account = Depends(require_admin)
    ) -> dict:
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
