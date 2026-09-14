"""GET /api/projects — registered Projects, their Clips, and (for admins) their members."""

from __future__ import annotations

from fastapi import APIRouter, Request

from endo_label.coordination import Account, db_path, projects_payload

router = APIRouter()


@router.get("/api/projects")
def get_projects(request: Request) -> dict:
    """Membership is an admin fact: a labeler reads Projects, not who works on them."""
    account: Account = request.state.account
    payload = projects_payload(
        db_path(request.app.state.settings), include_members=account.admin
    )
    return {"projects": payload}
