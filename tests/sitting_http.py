"""TestClient helpers: seed an admin Account and log in."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import ClipEntry, Settings
from endo_label.coordination import (
    AccountExists,
    create_account,
    db_path,
    get_or_create_project,
    hash_password,
    register_clip,
)

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "secret"
_ADMIN_HASH: str | None = None


def admin_password_hash() -> str:
    global _ADMIN_HASH
    if _ADMIN_HASH is None:
        _ADMIN_HASH = hash_password(ADMIN_PASSWORD)
    return _ADMIN_HASH


def seed_admin(settings: Settings) -> None:
    try:
        create_account(
            db_path(settings),
            ADMIN_USERNAME,
            ADMIN_PASSWORD,
            admin=True,
            password_hash=admin_password_hash(),
        )
    except AccountExists:
        return


def ensure_registered(settings: Settings) -> None:
    """Register Settings.clips / clip_allowlist so existing compose tests keep a directory."""
    if settings.projects:
        return
    entries = settings.clips
    if not entries:
        entries = tuple(
            ClipEntry(id=clip_id, kind="jpeg", path=settings.frames_root / clip_id)
            for clip_id in settings.clip_allowlist
        )
    if not entries:
        return
    path = db_path(settings)
    project = get_or_create_project(path, "Test", hospital="Test hospital")
    for entry in entries:
        register_clip(
            path,
            project_id=project.id,
            clip_id=entry.id,
            kind=entry.kind,
            media_path=entry.path,
        )


def login(
    client: TestClient,
    username: str = ADMIN_USERNAME,
    password: str = ADMIN_PASSWORD,
) -> None:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text


def authed_client(settings: Settings, *, web_dist: Path | None = None) -> TestClient:
    seed_admin(settings)
    ensure_registered(settings)
    client = TestClient(create_app(settings, web_dist=web_dist))
    login(client)
    return client
