"""Compose seam: whose Clips the directory answers with (ticket pilot-ux/08).

`GET /api/clips` is `mine` for everyone and `all` for the admin alone. The
filter is the server's: a non-admin asking for `all` is refused, not quietly
narrowed, and `mine` is the Account holding an Assignment on the Clip — as its
assignee or its reviewer, in any state.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import (
    assign_item,
    create_account,
    create_project,
    db_path,
    register_clip,
)
from tests.sitting_http import ADMIN_PASSWORD, ADMIN_USERNAME, login, seed_admin

EVERY_CLIP_REFUSAL = "Only an admin can see every Clip."


def _jpeg_clip(root: Path, clip_id: str, n: int = 2) -> Path:
    clip = root / clip_id
    clip.mkdir(parents=True)
    for index in range(n):
        (clip / f"{index + 1:05d}.jpg").write_bytes(f"jpeg-{clip_id}-{index}".encode())
    return clip


def _world(tmp_path: Path) -> tuple[Settings, Path, FastAPI]:
    """Three tagged Clips in two Projects, an admin, an annotator and a reviewer."""
    frames = tmp_path / "frames"
    settings = Settings(
        frames_root=frames,
        clip_allowlist=(),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    seed_admin(settings)
    path = db_path(settings)
    west = create_project(path, "West Study", "West China")
    east = create_project(path, "East Study", "Huashan")
    register_clip(
        path,
        project_id=west.id,
        clip_id="CLIPA",
        kind="jpeg",
        media_path=_jpeg_clip(frames, "CLIPA"),
        tags=["west"],
    )
    register_clip(
        path,
        project_id=west.id,
        clip_id="CLIPB",
        kind="jpeg",
        media_path=_jpeg_clip(frames, "CLIPB"),
        tags=["west", "chole"],
    )
    register_clip(
        path,
        project_id=east.id,
        clip_id="CLIPC",
        kind="jpeg",
        media_path=_jpeg_clip(frames, "CLIPC"),
        tags=["east"],
    )
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)
    return settings, path, create_app(settings)


def _client(
    app: FastAPI,
    username: str = ADMIN_USERNAME,
    password: str = ADMIN_PASSWORD,
) -> TestClient:
    client = TestClient(app)
    login(client, username=username, password=password)
    return client


def _ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [row["id"] for row in response.json()["clips"]]


def test_a_non_admin_sees_only_the_clips_they_hold_an_assignment_on(tmp_path: Path) -> None:
    _settings_obj, path, app = _world(tmp_path)
    alice = _client(app, "alice", "pw")

    # Nothing is theirs yet, so the directory is empty — not the catalog.
    assert alice.get("/api/clips").json() == {"clips": []}

    assign_item(path, "CLIPA", "phase", "alice")
    assert _ids(alice.get("/api/clips")) == ["CLIPA"]

    # Any Task type counts: a mask-only Assignment is still theirs to see.
    assign_item(path, "CLIPC", "mask", "alice")
    assert _ids(alice.get("/api/clips")) == ["CLIPA", "CLIPC"]

    # The admin's own Clips do not leak in through the admin's assignments.
    assign_item(path, "CLIPB", "phase", ADMIN_USERNAME)
    assert _ids(alice.get("/api/clips")) == ["CLIPA", "CLIPC"]


def test_mine_includes_the_clip_a_reviewer_is_reviewing(tmp_path: Path) -> None:
    _settings_obj, _path, app = _world(tmp_path)
    admin = _client(app)
    carol = _client(app, "carol", "pw")

    assert carol.get("/api/clips").json() == {"clips": []}
    assert admin.post("/api/items/CLIPB/phase/assign", json={"assignee": "alice"}).status_code == 200
    assert admin.post("/api/items/CLIPB/phase/submit").status_code == 200
    assert (
        admin.post("/api/items/CLIPB/phase/reviewer", json={"reviewer": "carol"}).status_code
        == 200
    )

    # The reviewer holds the item in Reviewing: an Assignment either way is mine.
    assert _ids(carol.get("/api/clips")) == ["CLIPB"]


def test_a_non_admin_asking_for_every_clip_is_refused_not_filtered(tmp_path: Path) -> None:
    _settings_obj, path, app = _world(tmp_path)
    alice = _client(app, "alice", "pw")
    assign_item(path, "CLIPA", "phase", "alice")

    refused = alice.get("/api/clips", params={"scope": "all"})
    assert refused.status_code == 403
    assert refused.json() == {"detail": EVERY_CLIP_REFUSAL}

    # Project and tag do not smuggle the catalog past the refusal either.
    for params in (
        {"scope": "all", "project": "East Study"},
        {"scope": "all", "tag": "east"},
        {"scope": "all", "project": "West Study", "tag": "chole"},
    ):
        assert alice.get("/api/clips", params=params).status_code == 403

    # Their own directory is untouched by the refused call.
    assert _ids(alice.get("/api/clips")) == ["CLIPA"]


def test_an_admin_defaults_to_their_own_clips_and_may_ask_for_all(tmp_path: Path) -> None:
    _settings_obj, path, app = _world(tmp_path)
    admin = _client(app)

    assert admin.get("/api/clips").json() == {"clips": []}
    assign_item(path, "CLIPA", "phase", ADMIN_USERNAME)
    assert _ids(admin.get("/api/clips")) == ["CLIPA"]
    assert _ids(admin.get("/api/clips", params={"scope": "all"})) == [
        "CLIPA",
        "CLIPB",
        "CLIPC",
    ]
    # The default is the same as asking for it by name.
    assert _ids(admin.get("/api/clips", params={"scope": "mine"})) == ["CLIPA"]


def test_any_other_scope_value_means_mine(tmp_path: Path) -> None:
    _settings_obj, path, app = _world(tmp_path)
    alice = _client(app, "alice", "pw")
    assign_item(path, "CLIPA", "phase", "alice")

    for params in ({}, {"scope": ""}, {"scope": "mine"}, {"scope": "every"}, {"scope": "ALL"}):
        assert _ids(alice.get("/api/clips", params=params)) == ["CLIPA"], params


def test_project_and_tag_filters_narrow_the_list_and_combine(tmp_path: Path) -> None:
    _settings_obj, path, app = _world(tmp_path)
    admin = _client(app)
    for clip_id in ("CLIPA", "CLIPB", "CLIPC"):
        assign_item(path, clip_id, "phase", ADMIN_USERNAME)

    assert _ids(admin.get("/api/clips", params={"project": "West Study"})) == [
        "CLIPA",
        "CLIPB",
    ]
    assert _ids(admin.get("/api/clips", params={"tag": "chole"})) == ["CLIPB"]
    assert _ids(
        admin.get("/api/clips", params={"project": "West Study", "tag": "chole"})
    ) == ["CLIPB"]
    # Combined filters that cannot both hold are an empty list, not a fallback.
    assert (
        admin.get("/api/clips", params={"project": "East Study", "tag": "chole"}).json()
        == {"clips": []}
    )

    # The same filters serve the admin's whole catalog.
    assert _ids(admin.get("/api/clips", params={"tag": "east", "scope": "all"})) == ["CLIPC"]

    # …and a non-admin's narrower one.
    alice = _client(app, "alice", "pw")
    assert alice.get("/api/clips", params={"project": "West Study"}).json() == {"clips": []}
