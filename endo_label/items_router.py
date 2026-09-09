"""Admin Assignment board and assign / reassign / unassign."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from endo_label.auth import require_admin
from endo_label.coordination import (
    AssignmentConflict,
    AssignmentNotFound,
    UnknownAccount,
    assign_item,
    db_path,
    items_payload,
    reassign_item,
    unassign_item,
)

router = APIRouter(tags=["items"], dependencies=[Depends(require_admin)])


class AssignBody(BaseModel):
    assignee: str


def _path(request: Request):
    return db_path(request.app.state.settings)


def _mutate(fn):
    try:
        return fn()
    except (AssignmentNotFound, UnknownAccount):
        raise HTTPException(status_code=404, detail="Not Found") from None
    except AssignmentConflict:
        raise HTTPException(status_code=409, detail="Conflict") from None


@router.get("/api/items")
def list_items(request: Request) -> dict:
    return {"items": items_payload(_path(request))}


@router.post("/api/items/{clip_id}/{task_type}/assign")
def assign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _mutate(lambda: assign_item(_path(request), clip_id, task_type, body.assignee))


@router.post("/api/items/{clip_id}/{task_type}/reassign")
def reassign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _mutate(lambda: reassign_item(_path(request), clip_id, task_type, body.assignee))


@router.post("/api/items/{clip_id}/{task_type}/unassign")
def unassign(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(lambda: unassign_item(_path(request), clip_id, task_type))
