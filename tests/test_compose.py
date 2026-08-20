"""Compose: shared catalog + labels-only backends without a Session."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    frames = tmp_path / "frames" / "CLIPA"
    frames.mkdir(parents=True)
    (frames / "00001.jpg").write_bytes(b"fake-jpeg")
    (frames / "00002.jpg").write_bytes(b"fake-jpeg")
    settings = Settings(
        frames_root=tmp_path / "frames",
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    app = create_app(settings)
    return TestClient(app)


def test_health_and_clips(client: TestClient) -> None:
    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["ok"] is True
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"][0]["id"] == "CLIPA"


def test_phase_class_triplet_without_session(client: TestClient) -> None:
    assert client.get("/api/session").json().get("active") is False

    span = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert span.status_code == 200
    assert span.json()["frames"]["0"] == "Preparation"

    cl = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert cl.status_code == 200
    assert cl.json()["frames"]["0"] == ["grasper", "blurred"]

    tr = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert tr.status_code == 200
    assert tr.json()["id"] == 1

    # same Frame holds all three; no Session
    assert client.get("/api/session").json().get("active") is False


def test_vocab_add(client: TestClient) -> None:
    r = client.post("/api/vocab/class_tags", json={"name": "smoke"})
    assert r.status_code == 200
    assert "smoke" in r.json()["class_tags"]
