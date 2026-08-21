"""Compose: shared catalog + labels-only backends without a Session."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    frames = tmp_path / "frames"
    clip_a = frames / "CLIPA"
    clip_a.mkdir(parents=True)
    (clip_a / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip_a / "00002.jpg").write_bytes(b"fake-jpeg-1")
    hidden = frames / "HIDDENCLIP"
    hidden.mkdir()
    (hidden / "00001.jpg").write_bytes(b"hidden-jpeg")
    settings = Settings(
        frames_root=frames,
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
    assert clips.json()["clips"] == [{"id": "CLIPA", "frame_count": 2}]


def test_missing_clip_is_not_found(client: TestClient) -> None:
    r = client.get("/api/clips/NOPE")
    assert r.status_code == 404
    assert "NOPE" in r.json()["detail"]


def test_non_allowlisted_clip_is_not_found(client: TestClient) -> None:
    r = client.get("/api/clips/HIDDENCLIP")
    assert r.status_code == 404
    assert "HIDDENCLIP" in r.json()["detail"]
    listed = {row["id"] for row in client.get("/api/clips").json()["clips"]}
    assert "HIDDENCLIP" not in listed


def test_clip_meta_and_frame_jpeg(client: TestClient) -> None:
    meta = client.get("/api/clips/CLIPA")
    assert meta.status_code == 200
    body = meta.json()
    assert body["id"] == "CLIPA"
    assert body["frame_count"] == 2
    assert body["frames"] == [
        {"index": 0, "stem": "00001"},
        {"index": 1, "stem": "00002"},
    ]
    f0 = client.get("/api/clips/CLIPA/frames/0")
    assert f0.status_code == 200
    assert f0.content == b"fake-jpeg-0"
    f1 = client.get("/api/clips/CLIPA/frames/1")
    assert f1.status_code == 200
    assert f1.content == b"fake-jpeg-1"
    missing = client.get("/api/clips/CLIPA/frames/9")
    assert missing.status_code == 404


def test_reading_frames_does_not_start_session_or_write_labels(client: TestClient) -> None:
    assert client.get("/api/session").json().get("active") is False
    assert client.get("/api/clips/CLIPA/frames/0").status_code == 200
    assert client.get("/api/clips/CLIPA/frames/1").status_code == 200
    assert client.get("/api/session").json().get("active") is False
    assert client.get("/api/phase/CLIPA").json()["frames"] == {}
    assert client.get("/api/class/CLIPA").json()["frames"] == {}
    assert client.get("/api/triplet/CLIPA").json()["frames"] == {}


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
