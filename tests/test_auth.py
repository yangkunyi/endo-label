"""Compose seam: coordination DB, Account login, session cookie, role flags."""

from __future__ import annotations

import threading
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.__main__ import main
from endo_label.app import create_app
from endo_label.auth import SESSION_COOKIE
from endo_label.config import Settings, load_settings
from endo_label.coordination import create_account, db_path, set_disabled, set_roles


def _settings(tmp_path: Path, **extra: object) -> Settings:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True, exist_ok=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    kwargs = dict(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    kwargs.update(extra)
    return Settings(**kwargs)  # type: ignore[arg-type]


def _client(tmp_path: Path, **extra: object) -> TestClient:
    return TestClient(create_app(_settings(tmp_path, **extra)))


def _cookie_header(response) -> str:
    return response.headers.get("set-cookie") or ""


def test_unauthenticated_api_is_401_except_health_and_login(tmp_path: Path) -> None:
    client = _client(tmp_path)
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/clips").status_code == 401
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/vocab").status_code == 401
    assert client.post("/api/auth/login", json={"username": "nobody", "password": "nope"}).status_code == 401


def test_login_sets_session_cookie_and_unlocks_api(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    create_account(db_path(settings), "alice", "correct-horse", admin=True)
    client = TestClient(create_app(settings))
    wrong = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert wrong.status_code == 401
    assert SESSION_COOKIE not in (wrong.headers.get("set-cookie") or "")
    assert client.get("/api/clips").status_code == 401

    ok = client.post("/api/auth/login", json={"username": "alice", "password": "correct-horse"})
    assert ok.status_code == 200
    assert ok.json() == {
        "username": "alice",
        "roles": {"admin": True, "reviewer": False, "annotator": False},
        "capabilities": {"admin": True, "review": False, "annotate": False},
    }
    cookie = _cookie_header(ok).lower()
    assert f"{SESSION_COOKIE}=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "secure" not in cookie
    assert client.get("/api/me").json() == ok.json()
    assert client.get("/api/clips").status_code == 200

    client.post("/api/auth/logout")
    assert client.get("/api/clips").status_code == 401
    assert client.get("/api/me").status_code == 401


def test_secure_cookie_flag_adds_secure(tmp_path: Path) -> None:
    settings = _settings(tmp_path, session_cookie_secure=True)
    create_account(db_path(settings), "alice", "pw", admin=True)
    client = TestClient(create_app(settings))
    ok = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert ok.status_code == 200
    assert "secure" in _cookie_header(ok).lower()


def test_disabled_account_refused_at_login_and_on_next_request(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    path = db_path(settings)
    create_account(path, "pat", "pw", annotator=True)
    client = TestClient(create_app(settings))
    set_disabled(path, "pat", True)
    refused = client.post("/api/auth/login", json={"username": "pat", "password": "pw"})
    assert refused.status_code == 401

    set_disabled(path, "pat", False)
    ok = client.post("/api/auth/login", json={"username": "pat", "password": "pw"})
    assert ok.status_code == 200
    assert client.get("/api/me").status_code == 200

    set_disabled(path, "pat", True)
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/clips").status_code == 401
    assert client.post("/api/auth/login", json={"username": "pat", "password": "pw"}).status_code == 401


def test_role_flags_round_trip_per_user(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    path = db_path(settings)
    create_account(path, "ann", "pw", annotator=True)
    create_account(path, "rev", "pw", reviewer=True, annotator=True)
    client = TestClient(create_app(settings))

    assert client.post("/api/auth/login", json={"username": "ann", "password": "pw"}).status_code == 200
    assert client.get("/api/me").json()["roles"] == {
        "admin": False,
        "reviewer": False,
        "annotator": True,
    }
    set_roles(path, "ann", admin=True, reviewer=True, annotator=True)
    assert client.get("/api/me").json()["roles"] == {
        "admin": True,
        "reviewer": True,
        "annotator": True,
    }
    client.post("/api/auth/logout")

    assert client.post("/api/auth/login", json={"username": "rev", "password": "pw"}).status_code == 200
    assert client.get("/api/me").json() == {
        "username": "rev",
        "roles": {"admin": False, "reviewer": True, "annotator": True},
        "capabilities": {"admin": False, "review": True, "annotate": True},
    }


def test_wal_interleaved_clients_do_not_corrupt(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    path = db_path(settings)
    create_account(path, "ann", "pw", annotator=True)
    create_account(path, "rev", "pw", reviewer=True)
    a = TestClient(create_app(settings))
    b = TestClient(create_app(settings))
    errors: list[str] = []

    def hammer(client: TestClient, username: str) -> None:
        try:
            for _ in range(12):
                login = client.post("/api/auth/login", json={"username": username, "password": "pw"})
                assert login.status_code == 200, login.text
                me = client.get("/api/me")
                assert me.status_code == 200, me.text
                assert me.json()["username"] == username
                out = client.post("/api/auth/logout")
                assert out.status_code == 200, out.text
        except Exception as exc:  # noqa: BLE001 — collect worker failure
            errors.append(f"{username}: {exc}")

    threads = [
        threading.Thread(target=hammer, args=(a, "ann")),
        threading.Thread(target=hammer, args=(b, "rev")),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []

    from endo_label.coordination import BUSY_TIMEOUT_MS, connect

    con = connect(path)
    try:
        assert str(con.execute("PRAGMA journal_mode").fetchone()[0]).lower() == "wal"
        assert con.execute("PRAGMA busy_timeout").fetchone()[0] == BUSY_TIMEOUT_MS
    finally:
        con.close()


def test_create_admin_cli_prints_temp_password_and_logs_in(tmp_path: Path, capsys) -> None:
    yaml_path = tmp_path / "sitting.yaml"
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg")
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                "clip_allowlist:",
                "  - CLIPA",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    main(["create-admin", "boss", "--config", str(yaml_path)])
    printed = capsys.readouterr().out
    assert "Created admin Account 'boss'" in printed
    password = printed.split("Temporary password:", 1)[1].strip().splitlines()[0].strip()
    assert password

    client = TestClient(create_app(load_settings(yaml_path)))
    ok = client.post("/api/auth/login", json={"username": "boss", "password": password})
    assert ok.status_code == 200
    assert ok.json()["roles"]["admin"] is True

    main(["create-admin", "boss", "--config", str(yaml_path)])
    again = capsys.readouterr().out
    assert "already exists" in again.lower()


def test_owner_changes_their_own_password(tmp_path: Path) -> None:
    """Story: after first login the owner replaces the admin's temporary password."""
    settings = _settings(tmp_path)
    create_account(db_path(settings), "alice", "temp-password", annotator=True)
    client = TestClient(create_app(settings))
    assert client.post("/api/auth/login", json={"username": "alice", "password": "temp-password"}).status_code == 200

    wrong = client.post(
        "/api/auth/password",
        json={"current_password": "not-my-password", "new_password": "chosen-password"},
    )
    assert wrong.status_code == 403
    assert client.post("/api/auth/login", json={"username": "alice", "password": "temp-password"}).status_code == 200

    empty = client.post(
        "/api/auth/password",
        json={"current_password": "temp-password", "new_password": "   "},
    )
    assert empty.status_code == 400

    changed = client.post(
        "/api/auth/password",
        json={"current_password": "temp-password", "new_password": "chosen-password"},
    )
    assert changed.status_code == 200, changed.text
    # The session that changed it stays usable; the old password does not.
    assert client.get("/api/me").json()["username"] == "alice"
    fresh = TestClient(create_app(settings))
    assert fresh.post("/api/auth/login", json={"username": "alice", "password": "temp-password"}).status_code == 401
    assert fresh.post("/api/auth/login", json={"username": "alice", "password": "chosen-password"}).status_code == 200


def test_password_change_needs_a_session(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    create_account(db_path(settings), "alice", "temp-password", annotator=True)
    client = TestClient(create_app(settings))
    response = client.post(
        "/api/auth/password",
        json={"current_password": "temp-password", "new_password": "chosen-password"},
    )
    assert response.status_code == 401
