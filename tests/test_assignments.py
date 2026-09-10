"""Compose seam: Assignment ownership, labels-on-Clip, and Clip version."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from tests.sitting_http import ensure_registered, login, seed_admin

_PHASE = "Preparation"
_PHASE_TWO = "CalotTriangleDissection"


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
    create_account(db_path(settings), "alice", "pw", annotator=True)
    create_account(db_path(settings), "bob", "pw", annotator=True)
    return create_app(settings)


def test_assignee_owns_writes_and_labels_stay_on_clip(tmp_path: Path) -> None:
    app = _shared_app(tmp_path)
    admin = TestClient(app)
    alice = TestClient(app)
    bob = TestClient(app)
    login(admin)
    login(alice, "alice", "pw")
    login(bob, "bob", "pw")

    added = admin.post("/api/vocab/phases", json={"name": _PHASE})
    assert added.status_code == 200, added.text

    forbidden = alice.post(
        "/api/items/CLIPA/phase/assign",
        json={"assignee": "alice"},
    )
    assert forbidden.status_code == 403

    assigned = admin.post(
        "/api/items/CLIPA/phase/assign",
        json={"assignee": "alice"},
    )
    assert assigned.status_code == 200, assigned.text

    alice_write = alice.put(
        "/api/phase/CLIPA/frames/0",
        json={"phase": _PHASE},
    )
    assert alice_write.status_code == 200, alice_write.text
    assert alice_write.json()["frames"]["0"] == _PHASE

    assert bob.put("/api/phase/CLIPA/frames/0", json={"phase": _PHASE}).status_code == 403
    assert admin.put("/api/phase/CLIPA/frames/0", json={"phase": _PHASE}).status_code == 403

    reassigned = admin.post(
        "/api/items/CLIPA/phase/reassign",
        json={"assignee": "bob"},
    )
    assert reassigned.status_code == 200, reassigned.text
    assert alice.get("/api/phase/CLIPA").json()["frames"]["0"] == _PHASE
    assert alice.put("/api/phase/CLIPA/frames/1", json={"phase": _PHASE}).status_code == 403

    bob_write = bob.put("/api/phase/CLIPA/frames/1", json={"phase": _PHASE})
    assert bob_write.status_code == 200, bob_write.text
    kept = alice.get("/api/phase/CLIPA").json()["frames"]
    assert kept["0"] == _PHASE
    assert kept["1"] == _PHASE

    unassigned = admin.post("/api/items/CLIPA/phase/unassign")
    assert unassigned.status_code == 200, unassigned.text
    assert alice.put("/api/phase/CLIPA/frames/0", json={"phase": _PHASE}).status_code == 403
    assert bob.put("/api/phase/CLIPA/frames/1", json={"phase": _PHASE}).status_code == 403
    still = bob.get("/api/phase/CLIPA").json()["frames"]
    assert still["0"] == _PHASE
    assert still["1"] == _PHASE


def test_stale_clip_version_is_rejected_then_fresh_version_succeeds(tmp_path: Path) -> None:
    app = _shared_app(tmp_path)
    admin = TestClient(app)
    client_a = TestClient(app)
    client_b = TestClient(app)
    login(admin)
    login(client_a, "alice", "pw")
    login(client_b, "alice", "pw")

    assert admin.post("/api/vocab/phases", json={"name": _PHASE}).status_code == 200
    assert admin.post("/api/vocab/phases", json={"name": _PHASE_TWO}).status_code == 200
    assigned = admin.post(
        "/api/items/CLIPA/phase/assign",
        json={"assignee": "alice"},
    )
    assert assigned.status_code == 200, assigned.text

    held = client_a.get("/api/phase/CLIPA")
    assert held.status_code == 200, held.text
    version = held.json()["version"]
    assert isinstance(version, int)

    first = client_b.put(
        "/api/phase/CLIPA/frames/0",
        json={"phase": _PHASE, "version": version},
    )
    assert first.status_code == 200, first.text

    stale = client_a.put(
        "/api/phase/CLIPA/frames/1",
        json={"phase": _PHASE_TWO, "version": version},
    )
    assert stale.status_code == 409

    fresh = client_a.get("/api/phase/CLIPA")
    assert fresh.status_code == 200, fresh.text
    retry = client_a.put(
        "/api/phase/CLIPA/frames/1",
        json={"phase": _PHASE_TWO, "version": fresh.json()["version"]},
    )
    assert retry.status_code == 200, retry.text
    frames = client_a.get("/api/phase/CLIPA").json()["frames"]
    assert frames["0"] == _PHASE
    assert frames["1"] == _PHASE_TWO
