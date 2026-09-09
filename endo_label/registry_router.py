""" /api/registry — Vocab registry, enablement, candidates (writes admin-only). """

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from endo_label.auth import require_admin
from endo_label.coordination import Account, ProjectNotFound, db_path
from endo_label.registry import (
    CandidateNotFound,
    RegistryConflict,
    RegistryItemNotFound,
    browse_payload,
    create_candidate,
    create_item,
    edit_candidate,
    promote_candidate,
    rename_item,
    set_archived,
    set_enabled,
    visible_items,
)

router = APIRouter()


class RegistryWriteBody(BaseModel):
    kind: str = ""
    name: str = ""
    instrument: str = ""
    verb: str = ""
    target: str = ""


class CandidateWriteBody(RegistryWriteBody):
    project_id: int | None = None


class ProjectBody(BaseModel):
    project_id: int


def _path(request: Request):
    return db_path(request.app.state.settings)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, (RegistryItemNotFound, CandidateNotFound, ProjectNotFound)):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, RegistryConflict):
        return HTTPException(status_code=409, detail=f"already present: {exc}")
    raise exc


@router.get("/api/registry")
def get_registry(request: Request) -> dict:
    return browse_payload(_path(request))


@router.get("/api/registry/visible")
def get_visible(request: Request, project_id: int) -> dict:
    try:
        items = visible_items(_path(request), project_id)
    except ProjectNotFound as exc:
        raise _http(exc) from None
    return {"items": [item.as_dict() for item in items]}


@router.post("/api/registry")
def post_item(
    body: RegistryWriteBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        item = create_item(
            _path(request),
            body.kind,
            name=body.name,
            instrument=body.instrument,
            verb=body.verb,
            target=body.target,
        )
    except (ValueError, RegistryConflict) as exc:
        raise _http(exc) from None
    return item.as_dict()


@router.post("/api/registry/candidates")
def post_candidate(
    body: CandidateWriteBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    if body.project_id is None:
        raise HTTPException(status_code=400, detail="project_id is required")
    try:
        candidate = create_candidate(
            _path(request),
            body.project_id,
            body.kind,
            name=body.name,
            instrument=body.instrument,
            verb=body.verb,
            target=body.target,
        )
    except (ValueError, ProjectNotFound) as exc:
        raise _http(exc) from None
    return candidate.as_dict()


@router.post("/api/registry/candidates/{candidate_id}")
def post_edit_candidate(
    candidate_id: int,
    body: RegistryWriteBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        candidate = edit_candidate(
            _path(request),
            candidate_id,
            name=body.name,
            instrument=body.instrument,
            verb=body.verb,
            target=body.target,
        )
    except (ValueError, CandidateNotFound) as exc:
        raise _http(exc) from None
    return candidate.as_dict()


@router.post("/api/registry/candidates/{candidate_id}/promote")
def post_promote(
    candidate_id: int,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        item = promote_candidate(_path(request), candidate_id)
    except (CandidateNotFound, RegistryConflict) as exc:
        raise _http(exc) from None
    return item.as_dict()


@router.post("/api/registry/{vocab_id}/rename")
def post_rename(
    vocab_id: int,
    body: RegistryWriteBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        item = rename_item(
            _path(request),
            vocab_id,
            name=body.name,
            instrument=body.instrument,
            verb=body.verb,
            target=body.target,
        )
    except (ValueError, RegistryItemNotFound, RegistryConflict) as exc:
        raise _http(exc) from None
    return item.as_dict()


@router.post("/api/registry/{vocab_id}/archive")
def post_archive(
    vocab_id: int,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        item = set_archived(_path(request), vocab_id, True)
    except (RegistryItemNotFound, RegistryConflict) as exc:
        raise _http(exc) from None
    return item.as_dict()


@router.post("/api/registry/{vocab_id}/restore")
def post_restore(
    vocab_id: int,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        item = set_archived(_path(request), vocab_id, False)
    except (RegistryItemNotFound, RegistryConflict) as exc:
        raise _http(exc) from None
    return item.as_dict()


@router.post("/api/registry/{vocab_id}/enable")
def post_enable(
    vocab_id: int,
    body: ProjectBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        set_enabled(_path(request), vocab_id, body.project_id, True)
    except (RegistryItemNotFound, ProjectNotFound) as exc:
        raise _http(exc) from None
    return {"ok": True}


@router.post("/api/registry/{vocab_id}/disable")
def post_disable(
    vocab_id: int,
    body: ProjectBody,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        set_enabled(_path(request), vocab_id, body.project_id, False)
    except (RegistryItemNotFound, ProjectNotFound) as exc:
        raise _http(exc) from None
    return {"ok": True}
