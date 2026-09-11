"""Admin Assignment board, state-machine transitions, and balanced auto-assign."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from endo_label.auth import require_admin
from endo_label.coordination import (
    AssignmentConflict,
    AssignmentNotFound,
    NoteRequired,
    ReviewerIsAnnotator,
    TransitionForbidden,
    UnknownAccount,
    assign_item,
    assign_reviewer,
    auto_assign_items,
    db_path,
    deliver_item,
    items_payload,
    pass_item,
    recall_item,
    reassign_item,
    reject_item,
    rereview_item,
    submit_item,
    unassign_item,
    undeliver_item,
)

router = APIRouter(tags=["items"])

_admin_only = [Depends(require_admin)]


class AssignBody(BaseModel):
    assignee: str


class ReviewerBody(BaseModel):
    reviewer: str


class RejectBody(BaseModel):
    note: str = ""


class AutoAssignItem(BaseModel):
    clip_id: str
    task_type: str


class AutoAssignBody(BaseModel):
    assignees: list[str] = Field(..., min_length=1)
    items: list[AutoAssignItem] | None = None
    clip_ids: list[str] | None = None
    task_type: str | None = None
    project: str | None = None


def _path(request: Request):
    return db_path(request.app.state.settings)


def _account_id(request: Request) -> int:
    return int(request.state.account.id)


def _body_items(body: AutoAssignBody) -> list[tuple[str, str]] | None:
    if body.items is None:
        return None
    return [(item.clip_id, item.task_type) for item in body.items]


def _mutate(fn):
    try:
        return fn()
    except (AssignmentNotFound, UnknownAccount):
        raise HTTPException(status_code=404, detail="Not Found") from None
    except (AssignmentConflict, ReviewerIsAnnotator):
        raise HTTPException(status_code=409, detail="Conflict") from None
    except TransitionForbidden:
        raise HTTPException(status_code=403, detail="Forbidden") from None
    except NoteRequired:
        raise HTTPException(status_code=400, detail="A reject note is required") from None


@router.get("/api/items", dependencies=_admin_only)
def list_items(
    request: Request,
    project: str | None = None,
    tag: str | None = None,
) -> dict:
    return {"items": items_payload(_path(request), project=project, tag=tag)}


@router.post("/api/items/auto-assign", dependencies=_admin_only)
def auto_assign(body: AutoAssignBody, request: Request) -> dict:
    return _mutate(
        lambda: auto_assign_items(
            _path(request),
            usernames=body.assignees,
            items=_body_items(body),
            clip_ids=body.clip_ids,
            task_type=body.task_type,
            project=body.project,
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/assign", dependencies=_admin_only)
def assign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _mutate(lambda: assign_item(_path(request), clip_id, task_type, body.assignee))


@router.post("/api/items/{clip_id}/{task_type}/reassign", dependencies=_admin_only)
def reassign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _mutate(lambda: reassign_item(_path(request), clip_id, task_type, body.assignee))


@router.post("/api/items/{clip_id}/{task_type}/unassign", dependencies=_admin_only)
def unassign(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(lambda: unassign_item(_path(request), clip_id, task_type))


@router.post("/api/items/{clip_id}/{task_type}/submit")
def submit(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: submit_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/recall")
def recall(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: recall_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/reviewer", dependencies=_admin_only)
def reviewer(clip_id: str, task_type: str, body: ReviewerBody, request: Request) -> dict:
    return _mutate(
        lambda: assign_reviewer(
            _path(request),
            clip_id,
            task_type,
            body.reviewer,
            account_id=_account_id(request),
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/pass")
def review_pass(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: pass_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/reject")
def review_reject(clip_id: str, task_type: str, body: RejectBody, request: Request) -> dict:
    return _mutate(
        lambda: reject_item(
            _path(request),
            clip_id,
            task_type,
            body.note,
            account_id=_account_id(request),
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/deliver")
def deliver(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: deliver_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )


@router.delete("/api/items/{clip_id}/{task_type}/deliver")
def undeliver(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: undeliver_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )


@router.post("/api/items/{clip_id}/{task_type}/re-review")
def re_review(clip_id: str, task_type: str, request: Request) -> dict:
    return _mutate(
        lambda: rereview_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        )
    )
