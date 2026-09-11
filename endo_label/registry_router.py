""" /api/registry — Vocab registry, enablement, candidates (writes admin-only). """

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from endo_label.auth import require_admin, require_project_vocab_editor
from endo_label.coordination import (
    Account,
    ProjectNotFound,
    UnknownClip,
    clip_project_id,
    db_path,
)
from endo_label import labels_store
from endo_label.registry import (
    CandidateNotFound,
    candidates_for_project,
    RegistryConflict,
    RegistryItemNotFound,
    browse_payload,
    create_candidate,
    create_item,
    delete_item,
    edit_candidate,
    get_item,
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
def get_visible(
    request: Request,
    project_id: int | None = None,
    clip_id: str | None = None,
) -> dict:
    if project_id is None and clip_id is not None:
        try:
            project_id = clip_project_id(_path(request), clip_id)
        except UnknownClip:
            raise HTTPException(
                status_code=404, detail=f"Clip not found: {clip_id}"
            ) from None
    if project_id is None:
        raise HTTPException(status_code=400, detail="project_id is required")
    try:
        items = visible_items(_path(request), project_id)
        candidates = candidates_for_project(_path(request), project_id)
    except ProjectNotFound as exc:
        raise _http(exc) from None
    return {
        "items": [{**item.as_dict(), "candidate": False} for item in items]
        + [{**candidate.as_dict(), "archived": False, "candidate": True} for candidate in candidates]
    }


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
    _: Account = Depends(require_project_vocab_editor),
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


@router.delete("/api/registry/{vocab_id}")
def delete_registry_item(
    vocab_id: int,
    request: Request,
    _: Account = Depends(require_admin),
) -> dict:
    try:
        get_item(_path(request), vocab_id)
    except RegistryItemNotFound as exc:
        raise _http(exc) from None
    if vocab_id in labels_store.referenced_vocab_ids(request.app.state.settings):
        raise HTTPException(status_code=409, detail="referenced")
    try:
        delete_item(_path(request), vocab_id)
    except RegistryItemNotFound as exc:
        raise _http(exc) from None
    return {"ok": True}


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
    _: Account = Depends(require_project_vocab_editor),
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
    _: Account = Depends(require_project_vocab_editor),
) -> dict:
    try:
        set_enabled(_path(request), vocab_id, body.project_id, False)
    except (RegistryItemNotFound, ProjectNotFound) as exc:
        raise _http(exc) from None
    return {"ok": True}
