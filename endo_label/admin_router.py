"""Admin console: Account management, Projects, Clip tags, and the tag vocabulary."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from endo_label.auth import require_admin
from endo_label.coordination import (
    Account,
    AccountExists,
    ProjectExists,
    ProjectNotFound,
    UnknownAccount,
    UnknownClip,
    account_by_username,
    all_tags,
    create_account,
    create_project,
    db_path,
    list_accounts,
    list_project_members,
    remove_project_member,
    set_clip_tags,
    set_disabled,
    set_project_members,
    set_roles,
    update_project_hospital,
)

router = APIRouter(tags=["admin"])

_admin_only = [Depends(require_admin)]


class RolesBody(BaseModel):
    admin: bool = False
    reviewer: bool = False
    annotator: bool = False


class CreateUserBody(BaseModel):
    username: str
    roles: RolesBody = Field(default_factory=RolesBody)
    password: str | None = None


class UpdateUserBody(BaseModel):
    roles: RolesBody | None = None
    disabled: bool | None = None


class CreateProjectBody(BaseModel):
    name: str
    hospital: str = ""


class UpdateProjectBody(BaseModel):
    hospital: str


class TagsBody(BaseModel):
    tags: list[str] = Field(default_factory=list)


class MembersBody(BaseModel):
    members: list[str] = Field(default_factory=list)


def _path(request: Request):
    return db_path(request.app.state.settings)


def _user(account: Account) -> dict:
    return {
        "id": account.id,
        "username": account.username,
        "roles": {
            "admin": account.admin,
            "reviewer": account.reviewer,
            "annotator": account.annotator,
        },
        "disabled": account.disabled,
    }


def _project(project) -> dict:
    return {"id": project.id, "name": project.name, "hospital": project.hospital}


@router.get("/api/admin/users", dependencies=_admin_only)
def list_users(request: Request) -> dict:
    return {"users": [_user(account) for account in list_accounts(_path(request))]}


@router.post("/api/admin/users", dependencies=_admin_only)
def create_user(body: CreateUserBody, request: Request) -> dict:
    password = body.password or secrets.token_urlsafe(12)
    roles = body.roles
    try:
        account = create_account(
            _path(request),
            body.username,
            password,
            admin=roles.admin,
            reviewer=roles.reviewer,
            annotator=roles.annotator,
        )
    except AccountExists:
        raise HTTPException(status_code=409, detail="Username already taken") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"user": _user(account), "temporary_password": password}


@router.patch("/api/admin/users/{username}", dependencies=_admin_only)
def update_user(username: str, body: UpdateUserBody, request: Request) -> dict:
    try:
        if body.roles is not None:
            roles = body.roles
            account = set_roles(
                _path(request),
                username,
                admin=roles.admin,
                reviewer=roles.reviewer,
                annotator=roles.annotator,
            )
        if body.disabled is not None:
            account = set_disabled(_path(request), username, body.disabled)
        if body.roles is None and body.disabled is None:
            account = account_by_username(_path(request), username)
    except UnknownAccount:
        raise HTTPException(status_code=404, detail="Account not found") from None
    return {"user": _user(account)}


@router.post("/api/projects", dependencies=_admin_only)
def create_project_route(body: CreateProjectBody, request: Request) -> dict:
    try:
        project = create_project(_path(request), body.name, body.hospital)
    except ProjectExists:
        raise HTTPException(status_code=409, detail="Project already exists") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"project": _project(project)}


@router.patch("/api/projects/{project_id}", dependencies=_admin_only)
def update_project_route(project_id: int, body: UpdateProjectBody, request: Request) -> dict:
    try:
        project = update_project_hospital(_path(request), project_id, body.hospital)
    except ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found") from None
    return {"project": _project(project)}


def _members(project_id: int, request: Request) -> list[str]:
    """404 for an unknown Project, so the Projects page can tell it from an empty list."""
    try:
        return list_project_members(_path(request), project_id)
    except ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found") from None


@router.get("/api/admin/projects/{project_id}/members", dependencies=_admin_only)
def list_project_members_route(project_id: int, request: Request) -> dict:
    return {"members": _members(project_id, request)}


@router.put("/api/admin/projects/{project_id}/members", dependencies=_admin_only)
def replace_project_members(project_id: int, body: MembersBody, request: Request) -> dict:
    """Replace the member list. One unknown Account refuses the whole write."""
    try:
        members = set_project_members(_path(request), project_id, body.members)
    except ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found") from None
    except UnknownAccount as exc:
        raise HTTPException(status_code=404, detail=f"Account not found: {exc}") from None
    return {"members": members}


@router.delete("/api/admin/projects/{project_id}/members/{username}", dependencies=_admin_only)
def remove_project_member_route(project_id: int, username: str, request: Request) -> dict:
    """An Account that is not a member is already out: a no-op, not a 404."""
    try:
        members = remove_project_member(_path(request), project_id, username)
    except ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found") from None
    except UnknownAccount as exc:
        raise HTTPException(status_code=404, detail=f"Account not found: {exc}") from None
    return {"members": members}


@router.get("/api/tags")
def list_tags(request: Request) -> dict:
    return {"tags": all_tags(_path(request))}


@router.put("/api/clips/{clip_id}/tags", dependencies=_admin_only)
def set_tags(clip_id: str, body: TagsBody, request: Request) -> dict:
    try:
        tags = set_clip_tags(_path(request), clip_id, body.tags)
    except UnknownClip:
        raise HTTPException(status_code=404, detail="Clip not found") from None
    return {"clip_id": clip_id, "tags": tags}
