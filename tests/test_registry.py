"""Compose seam: Vocab registry, per-Project enablement, candidate promotion."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, create_project, db_path, list_projects
from tests.sitting_http import authed_client, login, seed_admin, ensure_registered


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


def _admin(tmp_path: Path) -> tuple[TestClient, Settings]:
    settings = _settings(tmp_path)
    return authed_client(settings), settings


def _item(payload: dict, **expect: object) -> dict:
    for key, value in expect.items():
        assert payload[key] == value
    return payload


def test_admin_creates_renames_and_browses_registry_names(tmp_path: Path) -> None:
    client, _settings_obj = _admin(tmp_path)

    created = client.post("/api/registry", json={"kind": "phase", "name": "Preparation"})
    assert created.status_code == 200, created.text
    phase = _item(created.json(), kind="phase", name="Preparation", archived=False)
    assert isinstance(phase["id"], int)

    renamed = client.post(f"/api/registry/{phase['id']}/rename", json={"name": "Prep"})
    assert renamed.status_code == 200, renamed.text
    _item(renamed.json(), id=phase["id"], kind="phase", name="Prep", archived=False)

    tagged = client.post("/api/registry", json={"kind": "class", "name": "blurred"})
    assert tagged.status_code == 200, tagged.text
    triple = client.post(
        "/api/registry",
        json={
            "kind": "triplet",
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        },
    )
    assert triple.status_code == 200, triple.text
    _item(
        triple.json(),
        kind="triplet",
        instrument="grasper",
        verb="retract",
        target="gallbladder",
        archived=False,
    )

    browse = client.get("/api/registry")
    assert browse.status_code == 200, browse.text
    body = browse.json()
    names = {(row["kind"], row["name"], row["instrument"], row["verb"], row["target"]) for row in body["items"]}
    assert ("phase", "Prep", "", "", "") in names
    assert ("class", "blurred", "", "", "") in names
    assert ("triplet", "", "grasper", "retract", "gallbladder") in names
    assert body["projects"][0]["name"] == "Test"
    assert body["projects"][0]["enabled_ids"] == []
    assert body["projects"][0]["candidates"] == []


def test_non_admin_registry_writes_are_forbidden(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    seed_admin(settings)
    ensure_registered(settings)
    create_account(db_path(settings), "ann", "secret", annotator=True)
    client = TestClient(create_app(settings))
    login(client, username="ann", password="secret")

    writes = [
        client.post("/api/registry", json={"kind": "phase", "name": "Preparation"}),
        client.post("/api/registry/1/rename", json={"name": "Prep"}),
        client.post("/api/registry/1/archive"),
        client.post("/api/registry/1/restore"),
        client.post("/api/registry/1/enable", json={"project_id": 1}),
        client.post("/api/registry/1/disable", json={"project_id": 1}),
        client.post(
            "/api/registry/candidates",
            json={"project_id": 1, "kind": "phase", "name": "Calot"},
        ),
        client.post("/api/registry/candidates/1", json={"name": "Calot dissection"}),
        client.post("/api/registry/candidates/1/promote"),
    ]
    assert all(row.status_code == 403 for row in writes), [row.status_code for row in writes]

    listed = client.get("/api/registry")
    assert listed.status_code == 200, listed.text


def test_archive_and_restore_keep_the_same_id(tmp_path: Path) -> None:
    client, settings = _admin(tmp_path)
    project_id = list_projects(db_path(settings))[0].id
    created = client.post("/api/registry", json={"kind": "phase", "name": "Preparation"})
    vocab_id = created.json()["id"]
    assert client.post(f"/api/registry/{vocab_id}/enable", json={"project_id": project_id}).status_code == 200

    archived = client.post(f"/api/registry/{vocab_id}/archive")
    assert archived.status_code == 200, archived.text
    _item(archived.json(), id=vocab_id, name="Preparation", archived=True)
    visible = client.get("/api/registry/visible", params={"project_id": project_id})
    assert visible.status_code == 200, visible.text
    assert visible.json()["items"] == []

    restored = client.post(f"/api/registry/{vocab_id}/restore")
    assert restored.status_code == 200, restored.text
    _item(restored.json(), id=vocab_id, name="Preparation", archived=False)
    shown = client.get("/api/registry/visible", params={"project_id": project_id})
    assert [row["id"] for row in shown.json()["items"]] == [vocab_id]


def test_enable_matrix_decides_each_projects_visible_set(tmp_path: Path) -> None:
    client, settings = _admin(tmp_path)
    path = db_path(settings)
    west = list_projects(path)[0]
    east = create_project(path, "East", "Huashan")
    phase = client.post("/api/registry", json={"kind": "phase", "name": "Preparation"}).json()
    other = client.post("/api/registry", json={"kind": "class", "name": "blurred"}).json()

    enabled = client.post(
        f"/api/registry/{phase['id']}/enable", json={"project_id": west.id}
    )
    assert enabled.status_code == 200, enabled.text
    client.post(f"/api/registry/{other['id']}/enable", json={"project_id": east.id})

    west_visible = client.get("/api/registry/visible", params={"project_id": west.id})
    east_visible = client.get("/api/registry/visible", params={"project_id": east.id})
    assert [row["name"] for row in west_visible.json()["items"]] == ["Preparation"]
    assert [row["name"] for row in east_visible.json()["items"]] == ["blurred"]

    disabled = client.post(
        f"/api/registry/{phase['id']}/disable", json={"project_id": west.id}
    )
    assert disabled.status_code == 200, disabled.text
    assert client.get("/api/registry/visible", params={"project_id": west.id}).json()["items"] == []

    browse = client.get("/api/registry").json()
    by_name = {row["name"]: row for row in browse["projects"]}
    assert phase["id"] not in by_name["Test"]["enabled_ids"]
    assert other["id"] in by_name["East"]["enabled_ids"]


def test_promoting_a_candidate_turns_it_into_a_global_id(tmp_path: Path) -> None:
    client, settings = _admin(tmp_path)
    project_id = list_projects(db_path(settings))[0].id

    created = client.post(
        "/api/registry/candidates",
        json={"project_id": project_id, "kind": "phase", "name": "Calot"},
    )
    assert created.status_code == 200, created.text
    candidate = created.json()
    assert candidate["name"] == "Calot"
    assert candidate["kind"] == "phase"
    assert candidate["project_id"] == project_id

    edited = client.post(
        f"/api/registry/candidates/{candidate['id']}", json={"name": "Calot dissection"}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["name"] == "Calot dissection"

    queued = client.get("/api/registry").json()
    assert queued["projects"][0]["candidates"] == [
        {
            "id": candidate["id"],
            "project_id": project_id,
            "kind": "phase",
            "name": "Calot dissection",
            "instrument": "",
            "verb": "",
            "target": "",
        }
    ]

    promoted = client.post(f"/api/registry/candidates/{candidate['id']}/promote")
    assert promoted.status_code == 200, promoted.text
    item = promoted.json()
    assert item["kind"] == "phase"
    assert item["name"] == "Calot dissection"
    assert item["archived"] is False
    assert isinstance(item["id"], int)

    browse = client.get("/api/registry").json()
    assert browse["projects"][0]["candidates"] == []
    assert any(row["id"] == item["id"] and row["name"] == "Calot dissection" for row in browse["items"])
    assert item["id"] in browse["projects"][0]["enabled_ids"]
    visible = client.get("/api/registry/visible", params={"project_id": project_id})
    assert [row["id"] for row in visible.json()["items"]] == [item["id"]]


def test_legacy_string_vocab_endpoints_still_work(tmp_path: Path) -> None:
    client, _settings_obj = _admin(tmp_path)
    added = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert added.status_code == 200, added.text
    assert added.json()["phases"] == ["Preparation"]
    listed = client.get("/api/vocab")
    assert listed.status_code == 200
    assert listed.json()["phases"] == ["Preparation"]
