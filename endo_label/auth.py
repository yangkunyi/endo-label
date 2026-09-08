"""Login HTTP: server-side session cookie and /api/me."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from endo_label.coordination import (
    Account,
    account_for_session,
    authenticate,
    create_session,
    db_path,
    delete_session,
)

SESSION_COOKIE = "session_id"

router = APIRouter()

_PUBLIC_API = frozenset({"/api/health", "/api/auth/login", "/api/auth/logout"})


class LoginBody(BaseModel):
    username: str
    password: str


def _me(account: Account) -> dict:
    return {
        "username": account.username,
        "roles": {
            "admin": account.admin,
            "reviewer": account.reviewer,
            "annotator": account.annotator,
        },
    }


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


@router.get("/api/me")
def me(request: Request) -> dict:
    return _me(request.state.account)
