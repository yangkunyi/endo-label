"""Compose four backends: phase, class, triplet, mask. Mask Session is optional."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.requests import Request
from starlette.routing import Match, Route, get_route_path

from endo_label.admin_router import router as admin_router
from endo_label.auth import install_auth, router as auth_router
from endo_label.config import Settings, load_settings
from endo_label.coordination import apply_config_registrations
from endo_label.events import EventBroker, router as events_router
from endo_label.frame_class.router import make_router as class_router
from endo_label.items_router import router as items_router
from endo_label.mask.http import create_app as create_mask_app
from endo_label.mask.session import SessionManager
from endo_label.phase.router import make_router as phase_router
from endo_label.projects_router import router as projects_router
from endo_label.registry_router import router as registry_router
from endo_label.triplet.router import make_router as triplet_router
from endo_label.vocab_router import make_router as vocab_router

_DEFAULT_WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"


def _desk_file(dist: Path, relative: str) -> Path | None:
    if not relative or relative.endswith("/"):
        return None
    root = dist.resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _is_api_path(route_path: str) -> bool:
    return route_path == "/api" or route_path.startswith("/api/")


class _DeskRoute(Route):
    """A desk route that never claims an API path, so the desk never decides API routing.

    Starlette matches the route table by path before method, so a GET catch-all that
    matches ``/api/…`` only partially turns an unmatched API path into a 405 when the
    desk is built and a 404 when it is not. Refusing to match ``/api`` leaves that
    answer to the router: 404 for a path no route claims, 405 only where a real
    endpoint's path matched but its method did not.
    """

    def matches(self, scope):
        match, child_scope = super().matches(scope)
        if match is not Match.NONE and _is_api_path(get_route_path(scope)):
            return Match.NONE, {}
        return match, child_scope


def _mount_built_desk(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return

    def desk_root(request: Request) -> FileResponse:
        return FileResponse(index)

    def desk_spa(request: Request) -> FileResponse:
        found = _desk_file(dist, request.path_params["full_path"])
        if found is not None:
            return FileResponse(found)
        return FileResponse(index)

    app.router.routes.append(
        _DeskRoute("/", desk_root, methods=["GET"], include_in_schema=False)
    )
    app.router.routes.append(
        _DeskRoute(
            "/{full_path:path}", desk_spa, methods=["GET"], include_in_schema=False
        )
    )


def create_app(
    settings: Settings | None = None,
    web_dist: Path | None = None,
    session_manager: SessionManager | None = None,
):
    cfg = settings if settings is not None else load_settings()
    apply_config_registrations(cfg)
    app = create_mask_app(cfg, session_manager=session_manager)
    app.state.events = EventBroker()
    install_auth(app)
    app.include_router(auth_router)
    app.include_router(events_router)
    app.include_router(admin_router)
    app.include_router(projects_router)
    app.include_router(registry_router)
    app.include_router(items_router)
    app.include_router(phase_router(cfg))
    app.include_router(class_router(cfg))
    app.include_router(triplet_router(cfg))
    app.include_router(vocab_router(cfg))
    app.state.backends = ("phase", "class", "triplet", "mask")
    _mount_built_desk(app, web_dist if web_dist is not None else _DEFAULT_WEB_DIST)
    return app
