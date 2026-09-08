"""TestClient helpers: seed an admin Account and log in."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import AccountExists, create_account, db_path, hash_password

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


def login(
    client: TestClient,
    username: str = ADMIN_USERNAME,
    password: str = ADMIN_PASSWORD,
) -> None:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text


def authed_client(settings: Settings, *, web_dist: Path | None = None) -> TestClient:
    seed_admin(settings)
    client = TestClient(create_app(settings, web_dist=web_dist))
    login(client)
    return client
