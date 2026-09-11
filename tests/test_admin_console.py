"""Compose seam: admin console — Account management, Projects, delivery, filters."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.__main__ import main
from endo_label.app import create_app
from endo_label.config import Settings, load_settings
from endo_label.coordination import create_account, create_project, db_path, register_clip
from tests.sitting_http import authed_client, ensure_registered, login, seed_admin


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )


def _shared_app(tmp_path: Path):
    settings = _settings(tmp_path)
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)
    return settings, create_app(settings)


def test_admin_manages_accounts_while_non_admin_is_refused(tmp_path: Path) -> None:
    _settings_obj, app = _shared_app(tmp_path)
    admin = TestClient(app)
    alice = TestClient(app)
    login(admin)
    login(alice, "alice", "pw")

    # Non-admin callers are refused on every management surface.
    assert alice.get("/api/admin/users").status_code == 403
    assert (
        alice.post(
            "/api/admin/users",
            json={"username": "bob", "roles": {"annotator": True}},
        ).status_code
        == 403
    )
    assert (
        alice.patch(
            "/api/admin/users/alice",
            json={"roles": {"admin": True, "reviewer": True, "annotator": True}},
        ).status_code
        == 403
    )
    assert alice.patch("/api/admin/users/alice", json={"disabled": True}).status_code == 403

    # Create with an explicit temporary password, then log in as that Account.
    created = admin.post(
        "/api/admin/users",
        json={"username": "bob", "roles": {"annotator": True}, "password": "temp-pw"},
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["user"]["username"] == "bob"
    assert body["user"]["roles"] == {"admin": False, "reviewer": False, "annotator": True}
    assert body["user"]["disabled"] is False
    assert body["temporary_password"] == "temp-pw"
    bob = TestClient(app)
    assert bob.post("/api/auth/login", json={"username": "bob", "password": "temp-pw"}).status_code == 200

    # Omitting the password generates one that works.
    generated = admin.post(
        "/api/admin/users",
        json={"username": "dana", "roles": {"reviewer": True}},
    )
    assert generated.status_code == 200, generated.text
    temp = generated.json()["temporary_password"]
    assert temp
    dana = TestClient(app)
    assert dana.post("/api/auth/login", json={"username": "dana", "password": temp}).status_code == 200
    assert dana.get("/api/me").json()["roles"] == {
        "admin": False,
        "reviewer": True,
        "annotator": False,
    }

    # Duplicate usernames are refused.
    assert (
        admin.post("/api/admin/users", json={"username": "bob", "roles": {"annotator": True}}).status_code
        == 409
    )

    # Listing shows every Account and its flags.
    users = {row["username"]: row for row in admin.get("/api/admin/users").json()["users"]}
    assert {"admin", "alice", "carol", "bob", "dana"} <= set(users)
    assert users["carol"]["roles"] == {"admin": False, "reviewer": True, "annotator": False}
    assert users["bob"]["disabled"] is False

    # Role edits apply to the live Account.
    edited = admin.patch(
        "/api/admin/users/alice",
        json={"roles": {"admin": False, "reviewer": True, "annotator": True}},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["user"]["roles"] == {
        "admin": False,
        "reviewer": True,
        "annotator": True,
    }
    assert alice.get("/api/me").json()["roles"] == {
        "admin": False,
        "reviewer": True,
        "annotator": True,
    }

    # Disabling kicks the live session out at the very next request.
    disabled = admin.patch("/api/admin/users/alice", json={"disabled": True})
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["user"]["disabled"] is True
    assert alice.get("/api/me").status_code == 401
    assert (
        alice.post("/api/auth/login", json={"username": "alice", "password": "pw"}).status_code == 401
    )

    # Re-enabling restores login.
    assert admin.patch("/api/admin/users/alice", json={"disabled": False}).status_code == 200
    alice_again = TestClient(app)
    login(alice_again, "alice", "pw")
    assert alice_again.get("/api/me").status_code == 200

    # Unknown Accounts are 404, not 403.
    assert admin.patch("/api/admin/users/nobody", json={"disabled": True}).status_code == 404


def _jpeg_clip(root: Path, clip_id: str, n: int = 2) -> Path:
    clip = root / clip_id
    clip.mkdir(parents=True)
    for index in range(n):
        (clip / f"{index + 1:05d}.jpg").write_bytes(f"jpeg-{clip_id}-{index}".encode())
    return clip


def test_delivered_marker_and_project_tag_filtered_queries(tmp_path: Path) -> None:
    settings, app = _shared_app(tmp_path)
    path = db_path(settings)
    west = create_project(path, "West Study", "West China")
    east = create_project(path, "East Study", "Huashan")
    register_clip(
        path,
        project_id=west.id,
        clip_id="CLIPC",
        kind="jpeg",
        media_path=_jpeg_clip(settings.frames_root, "CLIPC"),
    )
    register_clip(
        path,
        project_id=east.id,
        clip_id="CLIPD",
        kind="jpeg",
        media_path=_jpeg_clip(settings.frames_root, "CLIPD"),
    )

    admin = TestClient(app)
    alice = TestClient(app)
    carol = TestClient(app)
    login(admin)
    login(alice, "alice", "pw")
    login(carol, "carol", "pw")

    # Tags are admin-written metadata; tag vocabulary is readable by any Account.
    assert alice.put("/api/clips/CLIPA/tags", json={"tags": ["chole"]}).status_code == 403
    assert admin.put("/api/clips/CLIPA/tags", json={"tags": ["chole", "west"]}).status_code == 200
    assert admin.put("/api/clips/CLIPC/tags", json={"tags": ["west"]}).status_code == 200
    assert admin.put("/api/clips/CLIPD/tags", json={"tags": ["east"]}).status_code == 200
    assert admin.put("/api/clips/CLIPA/tags", json={"tags": ["chole", "west"]}).json() == {
        "clip_id": "CLIPA",
        "tags": ["chole", "west"],
    }
    assert admin.put("/api/clips/NOPE/tags", json={"tags": ["x"]}).status_code == 404
    assert admin.get("/api/tags").json()["tags"] == ["chole", "east", "west"]

    # Clip directory filters by Project and by Clip tag.
    tagged = admin.get("/api/clips", params={"tag": "west"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CLIPA", "CLIPC"]
    western = admin.get("/api/clips", params={"project": "West Study"}).json()["clips"]
    assert [row["id"] for row in western] == ["CLIPC"]

    # Task list / board membership carries the Project and tags for the row.
    items = admin.get("/api/items").json()["items"]
    clipa = [row for row in items if row["clip_id"] == "CLIPA"]
    assert clipa and all(row["project"] == "Test" for row in clipa)
    assert all(row["tags"] == ["chole", "west"] for row in clipa)

    by_project = admin.get("/api/items", params={"project": "West Study"}).json()["items"]
    assert {row["clip_id"] for row in by_project} == {"CLIPC"}
    by_tag = admin.get("/api/items", params={"tag": "west"}).json()["items"]
    assert {row["clip_id"] for row in by_tag} == {"CLIPA", "CLIPC"}
    combined = admin.get(
        "/api/items", params={"project": "Test", "tag": "west"}
    ).json()["items"]
    assert {row["clip_id"] for row in combined} == {"CLIPA"}
    assert admin.get("/api/items", params={"tag": "nope"}).json()["items"] == []

    # Delivered marker: admin/reviewer set it, the first timestamp sticks.
    allowed = admin.post("/api/items/CLIPA/phase/deliver")
    assert allowed.status_code == 200, allowed.text
    delivered_at = allowed.json()["delivered_at"]
    assert delivered_at is not None
    assert datetime.fromisoformat(delivered_at).tzinfo is not None

    again = admin.post("/api/items/CLIPA/phase/deliver")
    assert again.status_code == 200, again.text
    assert again.json()["delivered_at"] == delivered_at

    listed = [
        row
        for row in admin.get("/api/items").json()["items"]
        if row["clip_id"] == "CLIPA" and row["task_type"] == "phase"
    ][0]
    assert listed["delivered_at"] == delivered_at

    assert alice.post("/api/items/CLIPA/phase/deliver").status_code == 403
    assert carol.post("/api/items/CLIPA/phase/deliver").status_code == 200

    # Delivery rides outside the state machine: it survives submit → pass.
    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert (
        admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    )
    passed = carol.post("/api/items/CLIPA/phase/pass")
    assert passed.status_code == 200, passed.text
    assert passed.json()["state"] == "Done"
    assert passed.json()["delivered_at"] == delivered_at

    cleared = admin.delete("/api/items/CLIPA/phase/deliver")
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["delivered_at"] is None
    assert alice.delete("/api/items/CLIPA/phase/deliver").status_code == 403
    assert admin.post("/api/items/NOPE/phase/deliver").status_code == 404


def test_admin_creates_projects_and_edits_the_hospital_field(tmp_path: Path) -> None:
    _settings_obj, app = _shared_app(tmp_path)
    admin = TestClient(app)
    alice = TestClient(app)
    login(admin)
    login(alice, "alice", "pw")

    assert (
        alice.post("/api/projects", json={"name": "West Study", "hospital": "West China"}).status_code
        == 403
    )
    assert alice.patch("/api/projects/1", json={"hospital": "Elsewhere"}).status_code == 403

    created = admin.post(
        "/api/projects",
        json={"name": "West Study", "hospital": "West China"},
    )
    assert created.status_code == 200, created.text
    project = created.json()["project"]
    assert project["name"] == "West Study"
    assert project["hospital"] == "West China"

    assert (
        admin.post("/api/projects", json={"name": "West Study", "hospital": ""}).status_code == 409
    )
    assert admin.post("/api/projects", json={"name": "   ", "hospital": ""}).status_code == 400

    edited = admin.patch(f"/api/projects/{project['id']}", json={"hospital": "Huashan"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["project"] == {
        "id": project["id"],
        "name": "West Study",
        "hospital": "Huashan",
    }
    listed = {row["name"]: row for row in admin.get("/api/projects").json()["projects"]}
    assert listed["West Study"]["hospital"] == "Huashan"
    assert admin.patch("/api/projects/9999", json={"hospital": "Nowhere"}).status_code == 404


def test_sitting_config_registers_clip_tags_for_filtering(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    media = _jpeg_clip(frames, "CASE01")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                f"annotations_root: {tmp_path / 'mask'}",
                "projects:",
                "  - name: West Study",
                "    hospital: West China",
                "    clips:",
                "      - id: CASE01",
                "        kind: jpeg",
                f"        path: {media}",
                "        tags:",
                "          - west",
                "          - chole",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == ["chole", "west"]
    tagged = client.get("/api/clips", params={"tag": "west"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CASE01"]
    items = client.get(
        "/api/items", params={"project": "West Study", "tag": "chole"}
    ).json()["items"]
    assert {row["clip_id"] for row in items} == {"CASE01"}
    assert all(row["tags"] == ["chole", "west"] for row in items)


def test_register_clip_cli_accepts_repeated_tags(tmp_path: Path, capsys) -> None:
    frames = tmp_path / "frames"
    media = _jpeg_clip(frames, "CASE02")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                f"annotations_root: {tmp_path / 'mask'}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    main(["create-project", "East Study", "--hospital", "Huashan", "--config", str(yaml_path)])
    main(
        [
            "register-clip",
            "CASE02",
            "--project",
            "East Study",
            "--kind",
            "jpeg",
            "--path",
            str(media),
            "--tag",
            "east",
            "--tag",
            "chole",
            "--config",
            str(yaml_path),
        ]
    )
    capsys.readouterr()
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == ["chole", "east"]
    tagged = client.get("/api/clips", params={"tag": "east"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CASE02"]
