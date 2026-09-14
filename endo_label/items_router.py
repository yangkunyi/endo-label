"""Admin Assignment board, state-machine transitions, and balanced auto-assign."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from endo_label.auth import require_admin
from endo_label.coordination import (
    AssignmentConflict,
    AssignmentNotFound,
    NotAProjectMember,
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
    my_items,
    pass_item,
    recall_item,
    reassign_item,
    reject_item,
    rereview_item,
    submit_item,
    unassign_item,
    undeliver_item,
)
from endo_label.events import publish_transition

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
    """Map a coordination failure to its HTTP status; return the item on success."""
    try:
        return fn()
    except (AssignmentNotFound, UnknownAccount):
        raise HTTPException(status_code=404, detail="Not Found") from None
    except NotAProjectMember as exc:
        # A membership refusal is the one 409 whose sentence the admin has to act on.
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except (AssignmentConflict, ReviewerIsAnnotator):
        raise HTTPException(status_code=409, detail="Conflict") from None
    except TransitionForbidden as exc:
        raise HTTPException(status_code=403, detail=str(exc) or "Forbidden") from None
    except NoteRequired:
        raise HTTPException(status_code=400, detail="A reject note is required") from None


def _transition(request: Request, action: str, fn) -> dict:
    """Run one assignment transition, then publish it to every event subscriber."""
    payload = _mutate(fn)
    publish_transition(request.app, action, payload)
    return payload


@router.get("/api/items", dependencies=_admin_only)
def list_items(
    request: Request,
    project: str | None = None,
    tag: str | None = None,
) -> dict:
    return {"items": items_payload(_path(request), project=project, tag=tag)}


@router.get("/api/me/items")
def list_my_items(request: Request) -> dict:
    """The caller's own items: assignee work plus items they review."""
    return {"items": my_items(_path(request), request.state.account)}


@router.post("/api/items/auto-assign", dependencies=_admin_only)
def auto_assign(body: AutoAssignBody, request: Request) -> dict:
    payload = _mutate(
        lambda: auto_assign_items(
            _path(request),
            usernames=body.assignees,
            items=_body_items(body),
            clip_ids=body.clip_ids,
            task_type=body.task_type,
            project=body.project,
        )
    )
    for row in payload["assigned"]:
        # Balanced auto-assign only ever moves an item Unassigned -> Labeling.
        publish_transition(request.app, "auto_assign", {**row, "state": "Labeling"})
    return payload


@router.post("/api/items/{clip_id}/{task_type}/assign", dependencies=_admin_only)
def assign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _transition(
        request,
        "assign",
        lambda: assign_item(_path(request), clip_id, task_type, body.assignee),
    )


@router.post("/api/items/{clip_id}/{task_type}/reassign", dependencies=_admin_only)
def reassign(clip_id: str, task_type: str, body: AssignBody, request: Request) -> dict:
    return _transition(
        request,
        "reassign",
        lambda: reassign_item(_path(request), clip_id, task_type, body.assignee),
    )


@router.post("/api/items/{clip_id}/{task_type}/unassign", dependencies=_admin_only)
def unassign(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request, "unassign", lambda: unassign_item(_path(request), clip_id, task_type)
    )


@router.post("/api/items/{clip_id}/{task_type}/submit")
def submit(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "submit",
        lambda: submit_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/recall")
def recall(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "recall",
        lambda: recall_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/reviewer", dependencies=_admin_only)
def reviewer(clip_id: str, task_type: str, body: ReviewerBody, request: Request) -> dict:
    return _transition(
        request,
        "assign_reviewer",
        lambda: assign_reviewer(
            _path(request),
            clip_id,
            task_type,
            body.reviewer,
            account_id=_account_id(request),
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/pass")
def review_pass(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "pass",
        lambda: pass_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/reject")
def review_reject(clip_id: str, task_type: str, body: RejectBody, request: Request) -> dict:
    return _transition(
        request,
        "reject",
        lambda: reject_item(
            _path(request),
            clip_id,
            task_type,
            body.note,
            account_id=_account_id(request),
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/deliver")
def deliver(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "deliver",
        lambda: deliver_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )


@router.delete("/api/items/{clip_id}/{task_type}/deliver")
def undeliver(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "undeliver",
        lambda: undeliver_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )


@router.post("/api/items/{clip_id}/{task_type}/re-review")
def re_review(clip_id: str, task_type: str, request: Request) -> dict:
    return _transition(
        request,
        "re_review",
        lambda: rereview_item(
            _path(request), clip_id, task_type, account_id=_account_id(request)
        ),
    )
