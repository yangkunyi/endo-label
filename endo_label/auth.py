"""Login HTTP: server-side session cookie and /api/me."""

from __future__ import annotations

from typing import NoReturn

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from endo_label.capabilities import (
    account_capabilities,
    may_create_candidate,
    may_edit_project_vocab,
)
from endo_label.coordination import (
    Account,
    AssignmentNotFound,
    LabelWriteForbidden,
    VersionConflict,
    account_for_session,
    assert_label_writer,
    authenticate,
    authorize_label_write,
    clip_version,
    create_session,
    db_path,
    delete_session,
    item_payload,
    set_password,
)

SESSION_COOKIE = "session_id"

router = APIRouter()

_PUBLIC_API = frozenset({"/api/health", "/api/auth/login", "/api/auth/logout"})


class LoginBody(BaseModel):
    username: str
    password: str


class PasswordBody(BaseModel):
    current_password: str
    new_password: str


def _me(account: Account) -> dict:
    return {
        "username": account.username,
        "roles": {
            "admin": account.admin,
            "reviewer": account.reviewer,
            "annotator": account.annotator,
        },
        "capabilities": account_capabilities(
            admin=account.admin,
            reviewer=account.reviewer,
            annotator=account.annotator,
        ),
    }


def require_admin(request: Request) -> Account:
    account: Account = request.state.account
    if not account.admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return account


def install_auth(app) -> None:
    @app.middleware("http")
    async def require_account(request: Request, call_next):
        path = request.url.path
        if (
            request.method == "OPTIONS"
            or not path.startswith("/api/")
            or path in _PUBLIC_API
        ):
            return await call_next(request)
        settings = request.app.state.settings
        token = request.cookies.get(SESSION_COOKIE)
        account = account_for_session(db_path(settings), token) if token else None
        if account is None or account.disabled:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        request.state.account = account
        return await call_next(request)


def require_admin(request: Request) -> Account:
    account: Account = request.state.account
    if not account.admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return account


def require_candidate_creator(request: Request) -> Account:
    account: Account = request.state.account
    if not may_create_candidate(
        admin=account.admin, reviewer=account.reviewer, annotator=account.annotator
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    return account


def require_project_vocab_editor(request: Request) -> Account:
    account: Account = request.state.account
    if not may_edit_project_vocab(admin=account.admin, reviewer=account.reviewer):
        raise HTTPException(status_code=403, detail="Forbidden")
    return account


def _label_write_http(exc: Exception) -> NoReturn:
    if isinstance(exc, AssignmentNotFound):
        raise HTTPException(status_code=404, detail="Not Found") from None
    if isinstance(exc, LabelWriteForbidden):
        raise HTTPException(status_code=403, detail="Forbidden") from None
    if isinstance(exc, VersionConflict):
        raise HTTPException(status_code=409, detail="Version conflict") from None
    raise exc


def require_label_assignee(request: Request, clip_id: str, task_type: str) -> None:
    account: Account = request.state.account
    try:
        assert_label_writer(
            db_path(request.app.state.settings),
            account_id=account.id,
            clip_id=clip_id,
            task_type=task_type,
        )
    except Exception as exc:
        _label_write_http(exc)


def require_label_write(
    request: Request,
    clip_id: str,
    task_type: str,
    version: int | None = None,
) -> int:
    account: Account = request.state.account
    try:
        return authorize_label_write(
            db_path(request.app.state.settings),
            account_id=account.id,
            clip_id=clip_id,
            task_type=task_type,
            version=version,
        )
    except Exception as exc:
        _label_write_http(exc)


def with_clip_version(request: Request, clip_id: str, doc: dict) -> dict:
    out = dict(doc)
    out["version"] = clip_version(db_path(request.app.state.settings), clip_id)
    return out


def with_new_version(doc: dict, version: int) -> dict:
    out = dict(doc)
    out["version"] = version
    return out


@router.post("/api/auth/login")
def login(body: LoginBody, response: Response, request: Request) -> dict:
    settings = request.app.state.settings
    path = db_path(settings)
    account = authenticate(path, body.username, body.password)
    if account is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = create_session(path, account.id)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )
    return _me(account)


@router.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        delete_session(db_path(request.app.state.settings), token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.post("/api/auth/password")
def change_password(body: PasswordBody, request: Request) -> dict:
    """The Account's own password change: prove the current one, set the new one."""
    account: Account = request.state.account
    path = db_path(request.app.state.settings)
    if authenticate(path, account.username, body.current_password) is None:
        raise HTTPException(status_code=403, detail="Current password is wrong")
    new_password = body.new_password.strip()
    if not new_password:
        raise HTTPException(status_code=400, detail="The new password cannot be empty")
    set_password(path, account.id, new_password)
    return {"ok": True}


@router.get("/api/me")
def me(
    request: Request,
    clip_id: str | None = None,
    task_type: str | None = None,
) -> dict:
    """Identity plus capabilities. With a Clip and Task type, the item's own matrix cell."""
    account: Account = request.state.account
    payload = _me(account)
    if clip_id and task_type:
        item = item_payload(db_path(request.app.state.settings), account, clip_id, task_type)
        if item is None:
            raise HTTPException(status_code=404, detail="Not Found")
        payload["item"] = item
    return payload
