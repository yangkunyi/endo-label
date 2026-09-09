"""GET /api/projects — registered Projects and their Clips."""

from __future__ import annotations

from fastapi import APIRouter, Request

from endo_label.coordination import db_path, projects_payload

router = APIRouter()


@router.get("/api/projects")
def get_projects(request: Request) -> dict:
    return {"projects": projects_payload(db_path(request.app.state.settings))}
