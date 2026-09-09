"""Compose four backends: phase, class, triplet, mask. Mask Session is optional."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from endo_label.auth import install_auth, router as auth_router
from endo_label.config import Settings, load_settings
from endo_label.coordination import apply_config_registrations
from endo_label.frame_class.router import make_router as class_router
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


def _mount_built_desk(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return

    @app.get("/", include_in_schema=False)
    def desk_root() -> FileResponse:
        return FileResponse(index)

    @app.get("/{full_path:path}", include_in_schema=False)
    def desk_spa(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        found = _desk_file(dist, full_path)
        if found is not None:
            return FileResponse(found)
        return FileResponse(index)


def create_app(
    settings: Settings | None = None,
    web_dist: Path | None = None,
    session_manager: SessionManager | None = None,
):
    cfg = settings if settings is not None else load_settings()
    apply_config_registrations(cfg)
    app = create_mask_app(cfg, session_manager=session_manager)
    install_auth(app)
    app.include_router(auth_router)
    app.include_router(projects_router)
    app.include_router(registry_router)
    app.include_router(phase_router(cfg))
    app.include_router(class_router(cfg))
    app.include_router(triplet_router(cfg))
    app.include_router(vocab_router(cfg))
    app.state.backends = ("phase", "class", "triplet", "mask")
    _mount_built_desk(app, web_dist if web_dist is not None else _DEFAULT_WEB_DIST)
    return app
