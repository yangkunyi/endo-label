"""Compose seam: mask Sessions keyed by (user, Clip), inference lock, ownership."""

from __future__ import annotations

import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from endo_label.mask.predictor import FakePredictor
from endo_label.mask.session import SessionManager
from tests.sitting_http import ensure_members, ensure_registered, login, seed_admin

_POINT = {"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [1]}


def _settings(tmp_path: Path, **extra) -> Settings:
    frames = tmp_path / "frames"
    for clip_id in ("CLIPA", "CLIPB", "CLIPC"):
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA", "CLIPB", "CLIPC"),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
        **extra,
    )


def _shared_app(tmp_path: Path, *, predictor=None, **extra):
    settings = _settings(tmp_path, **extra)
    seed_admin(settings)
    ensure_registered(settings)
    create_account(db_path(settings), "alice", "pw", annotator=True)
    create_account(db_path(settings), "bob", "pw", annotator=True)
    ensure_members(settings, "alice", "bob")
    manager = SessionManager(settings, predictor) if predictor is not None else None
    return create_app(settings, session_manager=manager)


def _clients(app):
    admin = TestClient(app)
    alice = TestClient(app)
    bob = TestClient(app)
    login(admin)
    login(alice, "alice", "pw")
    login(bob, "bob", "pw")
    return admin, alice, bob


def _assign(admin: TestClient, clip_id: str, username: str) -> None:
    assigned = admin.post(
        f"/api/items/{clip_id}/mask/assign", json={"assignee": username}
    )
    assert assigned.status_code == 200, assigned.text


def test_two_users_open_sessions_and_clip_switch_keeps_and_resumes(tmp_path: Path) -> None:
    app = _shared_app(tmp_path)
    admin, alice, bob = _clients(app)
    _assign(admin, "CLIPA", "alice")
    _assign(admin, "CLIPB", "alice")

    # A Predict auto-opens the Session on first mask action.
    first = alice.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert first.status_code == 200, first.text
    assert first.json()["tracks"][0]["track_id"] == 1
    opened_a = alice.get("/api/session", params={"clip_id": "CLIPA"})
    assert opened_a.json()["active"] is True
    assert opened_a.json()["clip_id"] == "CLIPA"

    # The second user is not blocked by the first user's Session.
    opened_b = bob.post("/api/session", json={"clip_id": "CLIPB"})
    assert opened_b.status_code == 201, opened_b.text
    assert opened_b.json()["clip_id"] == "CLIPB"
    assert opened_b.json()["session_id"] != opened_a.json()["session_id"]

    # Switching Clips does not destroy the old Session.
    switched = alice.post("/api/session", json={"clip_id": "CLIPB"})
    assert switched.status_code == 201, switched.text
    assert switched.json()["clip_id"] == "CLIPB"
    assert switched.json()["session_id"] != opened_a.json()["session_id"]

    resumed = alice.get("/api/session", params={"clip_id": "CLIPA", "frame_index": 0})
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["active"] is True
    assert resumed.json()["session_id"] == opened_a.json()["session_id"]
    assert [t["track_id"] for t in resumed.json()["tracks"]] == [1]

    # The resumed Session is writable again.
    again = alice.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert again.status_code == 200, again.text


def test_lru_eviction_closes_old_session_and_caps_are_config_driven(
    tmp_path: Path,
) -> None:
    # Per-user cap 1: opening a second Clip evicts the first.
    app = _shared_app(tmp_path / "per_user", mask_sessions_per_user=1)
    admin, alice, _bob = _clients(app)
    for clip_id in ("CLIPA", "CLIPB"):
        _assign(admin, clip_id, "alice")

    opened_a = alice.post("/api/session", json={"clip_id": "CLIPA"})
    assert opened_a.status_code == 201, opened_a.text
    opened_b = alice.post("/api/session", json={"clip_id": "CLIPB"})
    assert opened_b.status_code == 201, opened_b.text

    evicted = alice.get("/api/session", params={"clip_id": "CLIPA"})
    assert evicted.status_code == 200, evicted.text
    assert evicted.json() == {"active": False}
    kept = alice.get("/api/session", params={"clip_id": "CLIPB"})
    assert kept.json()["session_id"] == opened_b.json()["session_id"]

    # The evicted Clip auto-opens a fresh Session on the next mask action.
    reopened = alice.post("/api/session", json={"clip_id": "CLIPA"})
    assert reopened.status_code == 201, reopened.text
    assert reopened.json()["session_id"] != opened_a.json()["session_id"]

    # Per-user cap 2: the same first Clip survives the switch.
    app2 = _shared_app(tmp_path / "per_user_two", mask_sessions_per_user=2)
    admin2, alice2, _ = _clients(app2)
    for clip_id in ("CLIPA", "CLIPB"):
        _assign(admin2, clip_id, "alice")
    first = alice2.post("/api/session", json={"clip_id": "CLIPA"})
    assert first.status_code == 201, first.text
    second = alice2.post("/api/session", json={"clip_id": "CLIPB"})
    assert second.status_code == 201, second.text
    still_there = alice2.get("/api/session", params={"clip_id": "CLIPA"})
    assert still_there.json()["session_id"] == first.json()["session_id"]

    # Global cap 1 overrides the per-user cap.
    app3 = _shared_app(tmp_path / "global", mask_sessions_global=1)
    _admin3, alice3, bob3 = _clients(app3)
    a = alice3.post("/api/session", json={"clip_id": "CLIPA"})
    assert a.status_code == 201, a.text
    b = bob3.post("/api/session", json={"clip_id": "CLIPB"})
    assert b.status_code == 201, b.text
    assert alice3.get("/api/session", params={"clip_id": "CLIPA"}).json() == {
        "active": False
    }
    assert bob3.get("/api/session", params={"clip_id": "CLIPB"}).json()["active"] is True


class _GatedPredictor(FakePredictor):
    """Fake SAM that blocks inside inference until released, tracking overlap."""

    def __init__(self) -> None:
        self._count_lock = threading.Lock()
        self.inside = 0
        self.max_inside = 0
        self.block = False
        self.entered = threading.Event()
        self.release = threading.Event()

    def predict_geometry(self, **kwargs):
        with self._count_lock:
            self.inside += 1
            self.max_inside = max(self.max_inside, self.inside)
        self.entered.set()
        try:
            if self.block:
                self.release.wait(10)
            return super().predict_geometry(**kwargs)
        finally:
            with self._count_lock:
                self.inside -= 1


def test_concurrent_predicts_serialize_through_inference_lock(tmp_path: Path) -> None:
    gate = _GatedPredictor()
    gate.block = True
    app = _shared_app(tmp_path, predictor=gate)
    admin, alice, bob = _clients(app)
    _assign(admin, "CLIPA", "alice")
    _assign(admin, "CLIPB", "bob")

    results: dict[str, object] = {}

    def predict(client: TestClient, name: str, clip_id: str) -> None:
        results[name] = client.post(
            "/api/session/predict", json={**_POINT, "clip_id": clip_id}
        )

    first = threading.Thread(target=predict, args=(alice, "alice", "CLIPA"))
    second = threading.Thread(target=predict, args=(bob, "bob", "CLIPB"))
    first.start()
    assert gate.entered.wait(5)
    second.start()
    # The second Predict waits on the lock; inference never overlaps.
    time.sleep(0.2)
    assert gate.max_inside == 1
    assert second.is_alive()
    gate.release.set()
    first.join(10)
    second.join(10)
    assert results["alice"].status_code == 200, results["alice"].text
    assert results["bob"].status_code == 200, results["bob"].text
    assert gate.max_inside == 1


def test_predict_times_out_with_agreed_error_under_slow_inference(
    tmp_path: Path,
) -> None:
    gate = _GatedPredictor()
    gate.block = True
    app = _shared_app(
        tmp_path, predictor=gate, mask_inference_timeout=0.25
    )
    admin, alice, bob = _clients(app)
    _assign(admin, "CLIPA", "alice")
    _assign(admin, "CLIPB", "bob")

    held: dict[str, object] = {}

    def predict(client: TestClient) -> None:
        held["response"] = client.post(
            "/api/session/predict", json={**_POINT, "clip_id": "CLIPA"}
        )

    holder = threading.Thread(target=predict, args=(alice,))
    holder.start()
    assert gate.entered.wait(5)
    try:
        refused = bob.post(
            "/api/session/predict", json={**_POINT, "clip_id": "CLIPB"}
        )
        assert refused.status_code == 503, refused.text
        assert refused.json()["detail"] == (
            "Another inference is running; try again later"
        )
    finally:
        gate.release.set()
        holder.join(10)
    assert held["response"].status_code == 200, held["response"].text


def test_mask_writes_by_non_assignee_are_refused(tmp_path: Path) -> None:
    app = _shared_app(tmp_path)
    admin, alice, bob = _clients(app)
    _assign(admin, "CLIPA", "alice")

    allowed = alice.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert allowed.status_code == 200, allowed.text

    refused = bob.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert refused.status_code == 403, refused.text
    assert admin.post(
        "/api/session/predict", json={**_POINT, "clip_id": "CLIPA"}
    ).status_code == 403
    assert bob.post(
        "/api/session/save", params={"clip_id": "CLIPA"}
    ).status_code == 403

    # An active Session on the Clip does not grant write permission.
    opened = bob.post("/api/session", json={"clip_id": "CLIPA"})
    assert opened.status_code == 201, opened.text
    assert bob.post("/api/session/predict", json=_POINT).status_code == 403

    # Reassignment moves the write permission; labels stay on the Clip.
    reassigned = admin.post(
        "/api/items/CLIPA/mask/reassign", json={"assignee": "bob"}
    )
    assert reassigned.status_code == 200, reassigned.text
    assert bob.post(
        "/api/session/predict", json={**_POINT, "clip_id": "CLIPA"}
    ).status_code == 200
    assert alice.post(
        "/api/session/predict", json={**_POINT, "clip_id": "CLIPA"}
    ).status_code == 403
