"""Compose seam: admin console — Account management, Projects, delivery, filters."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.__main__ import main
from endo_label.app import create_app
from endo_label.config import Settings, load_settings
from endo_label.coordination import create_account, create_project, db_path, register_clip
from tests.sitting_http import authed_client, ensure_members, ensure_registered, login, seed_admin


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
    ensure_members(settings, "alice", "carol")
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

    # Clip directory filters by Project and by Clip tag. The directory is
    # "mine" by default, so an admin asking about the whole catalog says so.
    tagged = admin.get("/api/clips", params={"tag": "west", "scope": "all"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CLIPA", "CLIPC"]
    western = admin.get(
        "/api/clips", params={"project": "West Study", "scope": "all"}
    ).json()["clips"]
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


def _sitting_with_tags(tmp_path: Path, media: Path, tags: list[str] | str | None) -> Path:
    """One sitting YAML whose single Clip carries `tags`.

    A list is written as the list form (`[]` when empty) and a string as the one
    comma-separated value — `""` included, which is the blank value no tag name is
    read out of. `None` writes no `tags:` key at all.
    """
    lines = [
        f"frames_root: {media.parent}",
        f"labels_root: {tmp_path / 'labels'}",
        f"annotations_root: {tmp_path / 'mask'}",
        "projects:",
        "  - name: West Study",
        "    hospital: West China",
        "    clips:",
        "      - id: CASE01",
        "        kind: jpeg",
        f"        path: {media}",
    ]
    if isinstance(tags, str):
        lines.append(f'        tags: "{tags}"')
    elif tags is not None:
        lines.append(f"        tags: [{', '.join(tags)}]")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return yaml_path


def test_sitting_config_registers_clip_tags_for_filtering(tmp_path: Path) -> None:
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    yaml_path = _sitting_with_tags(tmp_path, media, ["west", "chole"])
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == ["chole", "west"]
    tagged = client.get("/api/clips", params={"tag": "west"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CASE01"]
    items = client.get(
        "/api/items", params={"project": "West Study", "tag": "chole"}
    ).json()["items"]
    assert {row["clip_id"] for row in items} == {"CASE01"}
    assert all(row["tags"] == ["chole", "west"] for row in items)


def test_a_tag_dropped_from_the_config_leaves_the_clip(tmp_path: Path) -> None:
    """A stated `tags:` is the Clip's tags in full, so dropping one drops it."""
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    yaml_path = _sitting_with_tags(tmp_path, media, ["west", "chole"])
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == ["chole", "west"]

    # One tag goes: the other stays, the dropped one stops matching every filter.
    yaml_path = _sitting_with_tags(tmp_path, media, ["west"])
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == ["west"]
    assert client.get("/api/clips", params={"tag": "chole"}).json()["clips"] == []
    assert client.get("/api/items", params={"tag": "chole"}).json()["items"] == []
    assert all(row["tags"] == ["west"] for row in client.get("/api/items").json()["items"])

    # The last tag goes: an explicitly empty `tags: []` still states the list, so the
    # Clip loses it (a bare or absent key would instead say nothing).
    yaml_path = _sitting_with_tags(tmp_path, media, [])
    client = authed_client(load_settings(yaml_path))
    assert client.get("/api/tags").json()["tags"] == []
    assert client.get("/api/clips", params={"tag": "west"}).json()["clips"] == []
    assert all(row["tags"] == [] for row in client.get("/api/items").json()["items"])


def _boot(yaml_path: Path) -> TestClient:
    """One desk boot over a YAML file — the restart that re-reads it on every `create_app`."""
    return authed_client(load_settings(yaml_path))


def test_a_config_entry_without_tags_keeps_the_tags_the_api_wrote(tmp_path: Path) -> None:
    """A registration with no `tags:` says nothing, so the API's write survives the restart."""
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    yaml_path = _sitting_with_tags(tmp_path, media, None)
    admin = _boot(yaml_path)
    assert admin.get("/api/tags").json()["tags"] == []
    assert admin.put("/api/clips/CASE01/tags", json={"tags": ["chole"]}).status_code == 200

    # Each restart re-registers CASE01 from the same file, which states no tags:
    # the tags written through the API are still the Clip's.
    for _ in range(2):
        admin = _boot(yaml_path)
        assert admin.get("/api/tags").json()["tags"] == ["chole"]
        tagged = admin.get("/api/clips", params={"tag": "chole"}).json()["clips"]
        assert [row["id"] for row in tagged] == ["CASE01"]
        assert all(row["tags"] == ["chole"] for row in admin.get("/api/items").json()["items"])


def test_a_config_entry_that_states_tags_owns_them_again(tmp_path: Path) -> None:
    """Stating tags again is a statement about the Clip, so it outranks the earlier API write."""
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    admin = _boot(_sitting_with_tags(tmp_path, media, None))
    assert admin.put("/api/clips/CASE01/tags", json={"tags": ["chole"]}).status_code == 200
    assert admin.get("/api/tags").json()["tags"] == ["chole"]

    admin = _boot(_sitting_with_tags(tmp_path, media, ["west", "chole"]))
    assert admin.get("/api/tags").json()["tags"] == ["chole", "west"]
    assert all(
        row["tags"] == ["chole", "west"] for row in admin.get("/api/items").json()["items"]
    )


def test_a_blank_tags_value_states_nothing_about_the_clips_tags(tmp_path: Path) -> None:
    """`tags: ""` names no tag, and a value naming none is no statement (ADR 0028).

    Only a list is a statement in itself; the string form is the comma-separated
    convenience, so a blank one has nothing to say and must leave the store's tags
    as an absent key does — while `tags: []` still clears them.
    """
    media = _jpeg_clip(tmp_path / "frames", "CASE01")
    admin = _boot(_sitting_with_tags(tmp_path, media, None))
    assert admin.put("/api/clips/CASE01/tags", json={"tags": ["chole"]}).status_code == 200

    # Each restart re-reads the same entry, now carrying a blank string: not a
    # statement that the Clip has no tags, so the admin's tag survives it.
    for _ in range(2):
        admin = _boot(_sitting_with_tags(tmp_path, media, ""))
        assert admin.get("/api/tags").json()["tags"] == ["chole"]
        tagged = admin.get("/api/clips", params={"tag": "chole"}).json()["clips"]
        assert [row["id"] for row in tagged] == ["CASE01"]

    # The string form is still a statement when it names tags, and the list form
    # is one even when it names none: that is how a config clears a Clip.
    admin = _boot(_sitting_with_tags(tmp_path, media, "west, chole"))
    assert admin.get("/api/tags").json()["tags"] == ["chole", "west"]
    admin = _boot(_sitting_with_tags(tmp_path, media, []))
    assert admin.get("/api/tags").json()["tags"] == []
    assert admin.get("/api/clips", params={"tag": "chole"}).json()["clips"] == []


def _plain_sitting(tmp_path: Path, frames: Path) -> Path:
    """A sitting YAML with no `projects:`, so only the CLI registers Clips into it."""
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
    return yaml_path


def _register_cli(
    yaml_path: Path, media: Path, clip_id: str, tags: list[str] | None
) -> None:
    """`endo_label register-clip`, with one `--tag` per tag — or none at all for `None`."""
    argv = [
        "register-clip",
        clip_id,
        "--project",
        "East Study",
        "--kind",
        "jpeg",
        "--path",
        str(media),
    ]
    for tag in tags or ():
        argv += ["--tag", tag]
    main([*argv, "--config", str(yaml_path)])


def test_register_clip_cli_accepts_repeated_tags(tmp_path: Path, capsys) -> None:
    frames = tmp_path / "frames"
    media = _jpeg_clip(frames, "CASE02")
    yaml_path = _plain_sitting(tmp_path, frames)
    main(["create-project", "East Study", "--hospital", "Huashan", "--config", str(yaml_path)])
    _register_cli(yaml_path, media, "CASE02", ["east", "chole"])
    capsys.readouterr()
    client = _boot(yaml_path)
    assert client.get("/api/tags").json()["tags"] == ["chole", "east"]
    tagged = client.get("/api/clips", params={"tag": "east"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CASE02"]


def test_register_clip_cli_states_tags_only_when_it_is_given_some(
    tmp_path: Path, capsys
) -> None:
    """No `--tag` says nothing; `--tag` states the Clip's tags in full."""
    frames = tmp_path / "frames"
    media = _jpeg_clip(frames, "CASE03")
    yaml_path = _plain_sitting(tmp_path, frames)
    main(["create-project", "East Study", "--hospital", "Huashan", "--config", str(yaml_path)])
    _register_cli(yaml_path, media, "CASE03", ["west", "chole"])
    admin = _boot(yaml_path)
    assert admin.get("/api/tags").json()["tags"] == ["chole", "west"]

    # The admin re-tags the Clip; re-registering the same Clip without --tag is not
    # a statement about tags, so it must not undo that.
    assert admin.put("/api/clips/CASE03/tags", json={"tags": ["east"]}).status_code == 200
    _register_cli(yaml_path, media, "CASE03", None)
    capsys.readouterr()
    admin = _boot(yaml_path)
    assert admin.get("/api/tags").json()["tags"] == ["east"]
    tagged = admin.get("/api/clips", params={"tag": "east"}).json()["clips"]
    assert [row["id"] for row in tagged] == ["CASE03"]

    # `--tag` again is the Clip's tags in full, so the API's tag leaves the store.
    _register_cli(yaml_path, media, "CASE03", ["chole"])
    capsys.readouterr()
    admin = _boot(yaml_path)
    assert admin.get("/api/tags").json()["tags"] == ["chole"]
    assert admin.get("/api/clips", params={"tag": "east"}).json()["clips"] == []

    # `--tag ''` is a stated empty list, which is how the CLI clears them.
    _register_cli(yaml_path, media, "CASE03", [""])
    capsys.readouterr()
    admin = _boot(yaml_path)
    assert admin.get("/api/tags").json()["tags"] == []
    assert admin.get("/api/clips", params={"tag": "chole"}).json()["clips"] == []
