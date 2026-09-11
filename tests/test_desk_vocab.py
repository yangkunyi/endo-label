"""Compose seam: the desk picker set and vocab permissions.

Two acceptance seams live here:
  1. the picker offers this Project's enabled words plus its candidates, and a
     desk-created candidate lands in the admin promotion queue;
  2. candidate creation and vocab editing answer to a role x action matrix.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import (
    create_account,
    create_project,
    db_path,
    register_clip,
)
from tests.sitting_http import login, seed_admin

_ROLES: dict[str, dict[str, bool]] = {
    "admin": {"admin": True, "reviewer": False, "annotator": False},
    "reviewer": {"admin": False, "reviewer": True, "annotator": False},
    "annotator": {"admin": False, "reviewer": False, "annotator": True},
    "norole": {"admin": False, "reviewer": False, "annotator": False},
}


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    for clip_id in ("CLIPA", "CLIPB"):
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=(),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )


def _world(
    tmp_path: Path,
) -> tuple[dict[str, TestClient], Settings, int, int]:
    """A West project holding CLIPA and an East project holding CLIPB."""
    settings = _settings(tmp_path)
    seed_admin(settings)
    path = db_path(settings)
    frames = settings.frames_root
    west = create_project(path, "West", "Hospital A")
    east = create_project(path, "East", "Hospital B")
    register_clip(
        path, project_id=west.id, clip_id="CLIPA", kind="jpeg", media_path=frames / "CLIPA"
    )
    register_clip(
        path, project_id=east.id, clip_id="CLIPB", kind="jpeg", media_path=frames / "CLIPB"
    )
    for username, roles in _ROLES.items():
        if username == "admin":
            continue
        create_account(path, username, "pw", **roles)
    app = create_app(settings)
    clients = {username: TestClient(app) for username in _ROLES}
    for username, client in clients.items():
        if username == "admin":
            login(client)
        else:
            login(client, username, "pw")
    return clients, settings, west.id, east.id


def _candidate(client: TestClient, project_id: int, **identity: str) -> dict:
    created = client.post(
        "/api/registry/candidates", json={"project_id": project_id, **identity}
    )
    assert created.status_code == 200, created.text
    return created.json()


def _triple(instrument: str, verb: str, target: str) -> dict[str, str]:
    return {"instrument": instrument, "verb": verb, "target": target}


def test_picker_set_is_the_projects_enabled_words_plus_its_candidates(tmp_path: Path) -> None:
    clients, _settings_obj, west, east = _world(tmp_path)
    admin = clients["admin"]

    prep = admin.post("/api/registry", json={"kind": "phase", "name": "Preparation"}).json()
    closure = admin.post("/api/registry", json={"kind": "phase", "name": "Closure"}).json()
    blurred = admin.post("/api/registry", json={"kind": "class", "name": "blurred"}).json()
    triple = admin.post(
        "/api/registry", json={"kind": "triplet", **_triple("grasper", "retract", "gallbladder")}
    ).json()
    archived = admin.post("/api/registry", json={"kind": "phase", "name": "Retired"}).json()

    for vocab_id, project_id in (
        (prep["id"], west),
        (triple["id"], west),
        (archived["id"], west),
        (closure["id"], east),
        (blurred["id"], east),
    ):
        enabled = admin.post(
            f"/api/registry/{vocab_id}/enable", json={"project_id": project_id}
        )
        assert enabled.status_code == 200, enabled.text
    assert admin.post(f"/api/registry/{archived['id']}/archive").status_code == 200

    _candidate(admin, west, kind="phase", name="Calot")
    _candidate(admin, west, kind="triplet", **_triple("hook", "pull", "fundus"))

    annotator = clients["annotator"]
    west_vocab = annotator.get("/api/vocab", params={"clip_id": "CLIPA"})
    assert west_vocab.status_code == 200, west_vocab.text
    body = west_vocab.json()
    assert body["phases"] == ["Preparation", "Calot"]
    assert body["class_tags"] == []
    assert body["triples"] == [
        _triple("grasper", "retract", "gallbladder"),
        _triple("hook", "pull", "fundus"),
    ]
    # The rows carry the registry id and whether they are still a candidate,
    # so the desk can retract an enabled word or edit a pending one.
    rows = body["items"]
    first = rows[0]
    assert (first["kind"], first["name"], first["candidate"]) == ("phase", "Preparation", False)
    assert isinstance(first["id"], int)
    assert any(
        row["kind"] == "phase" and row["name"] == "Calot" and row["candidate"] is True
        for row in rows
    )
    assert all(row["name"] != "Retired" for row in rows)

    # The other Project's enabled set and candidates never leak across.
    east_vocab = annotator.get("/api/vocab", params={"clip_id": "CLIPB"}).json()
    assert east_vocab["phases"] == ["Closure"]
    assert east_vocab["class_tags"] == ["blurred"]
    assert east_vocab["triples"] == []

    # The registry's Project-scoped visible set agrees with the picker.
    visible = annotator.get(
        "/api/registry/visible", params={"clip_id": "CLIPA"}
    ).json()["items"]
    assert [row["name"] for row in visible if row["kind"] == "phase"] == [
        "Preparation",
        "Calot",
    ]
    assert all(row["name"] != "Closure" for row in visible)

    # With no Clip the legacy desk-wide set still answers (ticket 17 compatibility).
    legacy = annotator.get("/api/vocab").json()
    assert "Calot" not in legacy["phases"]
    assert "Preparation" in legacy["phases"]


def test_desk_created_candidate_lands_in_the_promotion_queue(tmp_path: Path) -> None:
    clients, _settings_obj, west, east = _world(tmp_path)
    annotator = clients["annotator"]

    created = annotator.post(
        "/api/vocab/candidates",
        json={"clip_id": "CLIPA", "kind": "phase", "name": "Calot"},
    )
    assert created.status_code == 200, created.text
    candidate = created.json()
    assert candidate["project_id"] == west
    assert candidate["kind"] == "phase"
    assert candidate["name"] == "Calot"

    # The admin promotion queue shows it under this Project, not the other.
    queue = clients["admin"].get("/api/registry").json()
    by_project = {row["id"]: row for row in queue["projects"]}
    assert by_project[west]["candidates"] == [candidate]
    assert by_project[east]["candidates"] == []

    # The annotator's own picker offers it right away.
    assert annotator.get("/api/vocab", params={"clip_id": "CLIPA"}).json()["phases"] == [
        "Calot"
    ]
    assert clients["reviewer"].get(
        "/api/vocab", params={"clip_id": "CLIPB"}
    ).json()["phases"] == []


def test_desk_candidate_create_unknown_clip_is_not_found(tmp_path: Path) -> None:
    clients, _settings_obj, _west, _east = _world(tmp_path)
    missing = clients["annotator"].post(
        "/api/vocab/candidates",
        json={"clip_id": "NOPE", "kind": "phase", "name": "Calot"},
    )
    assert missing.status_code == 404, missing.text


@pytest.mark.parametrize("role", list(_ROLES))
def test_candidate_creation_and_vocab_editing_role_matrix(tmp_path: Path, role: str) -> None:
    clients, _settings_obj, west, _east = _world(tmp_path)
    admin = clients["admin"]
    client = clients[role]

    vocab_id = admin.post(
        "/api/registry", json={"kind": "phase", "name": "Preparation"}
    ).json()["id"]
    candidate = _candidate(admin, west, kind="phase", name=f"Calot-{role}")
    candidate_id = candidate["id"]

    actions: dict[str, tuple[object, set[str]]] = {
        "candidate_create": (
            client.post(
                "/api/vocab/candidates",
                json={"clip_id": "CLIPA", "kind": "phase", "name": f"New-{role}"},
            ),
            {"admin", "reviewer", "annotator"},
        ),
        "candidate_edit": (
            client.post(
                f"/api/registry/candidates/{candidate_id}",
                json={"name": f"Calot-{role}-edited"},
            ),
            {"admin", "reviewer"},
        ),
        "project_enable": (
            client.post(f"/api/registry/{vocab_id}/enable", json={"project_id": west}),
            {"admin", "reviewer"},
        ),
        "project_disable": (
            client.post(f"/api/registry/{vocab_id}/disable", json={"project_id": west}),
            {"admin", "reviewer"},
        ),
        "global_vocab_add": (
            client.post("/api/vocab/phases", json={"name": f"Phase-{role}"}),
            {"admin"},
        ),
        "global_registry_add": (
            client.post("/api/registry", json={"kind": "class", "name": f"tag-{role}"}),
            {"admin"},
        ),
        "promote": (
            client.post(f"/api/registry/candidates/{candidate_id}/promote"),
            {"admin"},
        ),
    }

    scoped = client.get("/api/vocab", params={"clip_id": "CLIPA"})
    assert scoped.status_code == 200, scoped.text
    assert scoped.json()["permissions"] == {
        "vocab_edit": role in {"admin", "reviewer"},
        "registry_write": role == "admin",
        "candidate_create": role in {"admin", "reviewer", "annotator"},
    }

    for action, (response, allowed) in actions.items():
        assert response.status_code == (200 if role in allowed else 403), (
            action,
            role,
            response.status_code,
            response.text,
        )
