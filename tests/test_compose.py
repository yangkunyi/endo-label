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


def test_phase_span_paints_every_frame_from_through_to(client: TestClient) -> None:
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "Preparation", "1": "Preparation"}
    loaded = client.get("/api/phase/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {"0": "Preparation", "1": "Preparation"}


def test_phase_span_swaps_when_from_is_after_to(client: TestClient) -> None:
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 1, "to": 0},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "Preparation", "1": "Preparation"}


def test_phase_span_equal_from_to_writes_one_frame(client: TestClient) -> None:
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "Preparation"}
    assert "1" not in painted.json()["frames"]


def test_later_phase_span_overwrites_overlap_only(client: TestClient) -> None:
    first = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Clipping and cutting", "from": 1, "to": 1},
    )
    assert second.status_code == 200
    assert second.json()["frames"] == {
        "0": "Preparation",
        "1": "Clipping and cutting",
    }


def test_clear_phase_on_this_frame_only(client: TestClient) -> None:
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    cleared = client.put("/api/phase/CLIPA/frames/0", json={"phase": None})
    assert cleared.status_code == 200
    assert "0" not in cleared.json()["frames"]
    assert cleared.json()["frames"]["1"] == "Preparation"
    loaded = client.get("/api/phase/CLIPA")
    assert loaded.json()["frames"] == {"1": "Preparation"}


def test_phase_span_outside_clip_is_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 2},
    )
    assert r.status_code == 400
    assert client.get("/api/phase/CLIPA").json()["frames"] == {}


def test_unlabeled_frame_has_no_phase_key(client: TestClient) -> None:
    empty = client.get("/api/phase/CLIPA")
    assert empty.status_code == 200
    assert empty.json()["frames"] == {}
    client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    loaded = client.get("/api/phase/CLIPA").json()["frames"]
    assert loaded["0"] == "Preparation"
    assert "1" not in loaded


def test_unknown_phase_name_is_rejected(client: TestClient) -> None:
    span = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "NotAPhase", "from": 0, "to": 1},
    )
    assert span.status_code == 400
    assert "NotAPhase" in span.json()["detail"]
    put = client.put("/api/phase/CLIPA/frames/0", json={"phase": "NotAPhase"})
    assert put.status_code == 400
    assert "NotAPhase" in put.json()["detail"]
    assert client.get("/api/phase/CLIPA").json()["frames"] == {}


def test_added_phase_name_can_be_painted(client: TestClient) -> None:
    added = client.post("/api/vocab/phases", json={"name": "MyPhase"})
    assert added.status_code == 200
    assert "MyPhase" in added.json()["phases"]
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "MyPhase", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "MyPhase", "1": "MyPhase"}


def test_add_phase_name_rejects_blank_and_duplicate(client: TestClient) -> None:
    blank = client.post("/api/vocab/phases", json={"name": "   "})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert dup.status_code == 409
    assert "Preparation" in dup.json()["detail"]


def test_phase_write_leaves_class_triplet_and_session_untouched(client: TestClient) -> None:
    assert client.get("/api/session").json().get("active") is False
    cl = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    assert cl.status_code == 200
    tr = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert tr.status_code == 200
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    rows = client.get("/api/triplet/CLIPA").json()["frames"]["0"]
    assert rows == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/session").json().get("active") is False
    client.put("/api/phase/CLIPA/frames/0", json={"phase": None})
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["id"] == 1
    assert client.get("/api/session").json().get("active") is False


def test_unknown_class_name_is_rejected(client: TestClient) -> None:
    put = client.put("/api/class/CLIPA/frames/0", json={"tags": ["NotAClass"]})
    assert put.status_code == 400
    assert "NotAClass" in put.json()["detail"]
    mixed = client.put(
        "/api/class/CLIPA/frames/0",
        json={"tags": ["grasper", "NotAClass"]},
    )
    assert mixed.status_code == 400
    assert "NotAClass" in mixed.json()["detail"]
    assert client.get("/api/class/CLIPA").json()["frames"] == {}


def test_class_tags_toggle_on_and_stack(client: TestClient) -> None:
    on = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    assert on.status_code == 200
    assert on.json()["frames"]["0"] == ["grasper"]
    stacked = client.put(
        "/api/class/CLIPA/frames/0",
        json={"tags": ["grasper", "blurred"]},
    )
    assert stacked.status_code == 200
    assert stacked.json()["frames"]["0"] == ["grasper", "blurred"]
    off = client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    assert off.status_code == 200
    assert off.json()["frames"]["0"] == ["blurred"]


def test_class_tags_stay_unique_on_a_frame(client: TestClient) -> None:
    put = client.put(
        "/api/class/CLIPA/frames/0",
        json={"tags": ["grasper", "grasper", "blurred", "grasper"]},
    )
    assert put.status_code == 200
    assert put.json()["frames"]["0"] == ["grasper", "blurred"]


def test_class_span_unions_one_tag_across_inclusive_range(client: TestClient) -> None:
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    client.put("/api/class/CLIPA/frames/1", json={"tags": ["hook"]})
    painted = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 1, "to": 0, "on": True},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {
        "0": ["blurred", "grasper"],
        "1": ["hook", "grasper"],
    }


def test_class_span_on_is_idempotent_and_preserves_other_flags(client: TestClient) -> None:
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred", "grasper"]})
    first = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 0, "to": 1, "on": True},
    )
    second = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 0, "to": 1, "on": True},
    )
    assert first.status_code == second.status_code == 200
    assert second.json()["frames"] == {
        "0": ["blurred", "grasper"],
        "1": ["grasper"],
    }


def test_class_span_off_removes_only_tag_and_drops_empty_frames(client: TestClient) -> None:
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    client.put("/api/class/CLIPA/frames/1", json={"tags": ["grasper"]})
    painted = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 0, "to": 1, "on": False},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": ["blurred"]}


def test_class_span_rejects_bad_range_or_vocab_without_partial_change(client: TestClient) -> None:
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    outside = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 0, "to": 2, "on": True},
    )
    unknown = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "NotAClass", "from": 0, "to": 1, "on": True},
    )
    assert outside.status_code == unknown.status_code == 400
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["blurred"]}


def test_class_span_leaves_phase_triplet_and_session_untouched(client: TestClient) -> None:
    client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    painted = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "blurred", "from": 0, "to": 1, "on": True},
    )
    assert painted.status_code == 200
    assert client.get("/api/phase/CLIPA").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["id"] == 1
    assert client.get("/api/session").json().get("active") is False


def test_class_span_is_durable_across_app_instances(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    first = TestClient(create_app(settings))
    painted = first.post(
        "/api/class/CLIPA/span",
        json={"tag": "blurred", "from": 0, "to": 1, "on": True},
    )
    assert painted.status_code == 200
    second = TestClient(create_app(settings))
    assert second.get("/api/class/CLIPA").json()["frames"] == {
        "0": ["blurred"],
        "1": ["blurred"],
    }


def test_triplet_span_add_is_idempotent_and_assigns_frame_local_ids(client: TestClient) -> None:
    body = {
        "instrument": "grasper",
        "verb": "retract",
        "target": "gallbladder",
        "from": 1,
        "to": 0,
        "op": "add",
    }
    first = client.post("/api/triplet/CLIPA/span", json=body)
    second = client.post("/api/triplet/CLIPA/span", json=body)
    assert first.status_code == second.status_code == 200
    assert second.json()["frames"] == {
        "0": [{
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }],
        "1": [{
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }],
    }


def test_triplet_span_remove_matches_by_name_and_preserves_other_rows(client: TestClient) -> None:
    for frame in (0, 1):
        client.post(
            f"/api/triplet/CLIPA/frames/{frame}",
            json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
        )
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "hook", "verb": "dissect", "target": "omentum"},
    )
    removed = client.post(
        "/api/triplet/CLIPA/span",
        json={
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
            "from": 0,
            "to": 1,
            "op": "remove",
        },
    )
    assert removed.status_code == 200
    assert removed.json()["frames"] == {
        "0": [{
            "id": 2,
            "instrument": "hook",
            "verb": "dissect",
            "target": "omentum",
        }]
    }


def test_triplet_span_rejects_bad_range_or_vocab_without_partial_change(client: TestClient) -> None:
    existing = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "hook", "verb": "dissect", "target": "omentum"},
    )
    assert existing.status_code == 200
    outside = client.post(
        "/api/triplet/CLIPA/span",
        json={
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
            "from": 0,
            "to": 2,
            "op": "add",
        },
    )
    unknown = client.post(
        "/api/triplet/CLIPA/span",
        json={
            "instrument": "NotAnInstrument",
            "verb": "retract",
            "target": "gallbladder",
            "from": 0,
            "to": 1,
            "op": "add",
        },
    )
    assert outside.status_code == unknown.status_code == 400
    assert client.get("/api/triplet/CLIPA").json()["frames"] == {
        "0": [{
            "id": 1,
            "instrument": "hook",
            "verb": "dissect",
            "target": "omentum",
        }]
    }


def test_triplet_span_leaves_phase_class_and_session_untouched(client: TestClient) -> None:
    client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    painted = client.post(
        "/api/triplet/CLIPA/span",
        json={
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
            "from": 0,
            "to": 1,
            "op": "add",
        },
    )
    assert painted.status_code == 200
    assert client.get("/api/phase/CLIPA").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["blurred"]}
    assert client.get("/api/session").json().get("active") is False


def test_triplet_span_is_durable_across_app_instances(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    first = TestClient(create_app(settings))
    painted = first.post(
        "/api/triplet/CLIPA/span",
        json={
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
            "from": 0,
            "to": 1,
            "op": "add",
        },
    )
    assert painted.status_code == 200
    second = TestClient(create_app(settings))
    assert second.get("/api/triplet/CLIPA").json()["frames"] == {
        "0": [{
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }],
        "1": [{
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }],
    }


def test_empty_class_list_is_unlabeled(client: TestClient) -> None:
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    cleared = client.put("/api/class/CLIPA/frames/0", json={"tags": []})
    assert cleared.status_code == 200
    assert "0" not in cleared.json()["frames"]
    assert client.get("/api/class/CLIPA").json()["frames"] == {}


def test_class_flags_do_not_copy_to_next_frame(client: TestClient) -> None:
    put = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert put.status_code == 200
    assert put.json()["frames"] == {"0": ["grasper", "blurred"]}
    assert "1" not in put.json()["frames"]
    loaded = client.get("/api/class/CLIPA")
    assert loaded.json()["frames"] == {"0": ["grasper", "blurred"]}
    assert "1" not in loaded.json()["frames"]


def test_added_class_name_can_be_toggled(client: TestClient) -> None:
    added = client.post("/api/vocab/class_tags", json={"name": "smoke"})
    assert added.status_code == 200
    assert "smoke" in added.json()["class_tags"]
    put = client.put("/api/class/CLIPA/frames/0", json={"tags": ["smoke"]})
    assert put.status_code == 200
    assert put.json()["frames"]["0"] == ["smoke"]


def test_add_class_name_rejects_blank_and_duplicate(client: TestClient) -> None:
    blank = client.post("/api/vocab/class_tags", json={"name": "   "})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/class_tags", json={"name": "grasper"})
    assert dup.status_code == 409
    assert "grasper" in dup.json()["detail"]


def test_class_write_leaves_phase_triplet_and_session_untouched(client: TestClient) -> None:
    assert client.get("/api/session").json().get("active") is False
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert painted.status_code == 200
    tr = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert tr.status_code == 200
    cl = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert cl.status_code == 200
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    rows = client.get("/api/triplet/CLIPA").json()["frames"]["0"]
    assert rows == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/session").json().get("active") is False
    client.put("/api/class/CLIPA/frames/0", json={"tags": []})
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["id"] == 1
    assert client.get("/api/session").json().get("active") is False


def test_class_survives_new_app_instance(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    clip_a = frames / "CLIPA"
    clip_a.mkdir(parents=True)
    (clip_a / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip_a / "00002.jpg").write_bytes(b"fake-jpeg-1")
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    first = TestClient(create_app(settings))
    put = first.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert put.status_code == 200
    second = TestClient(create_app(settings))
    loaded = second.get("/api/class/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {"0": ["grasper", "blurred"]}
    assert "1" not in loaded.json()["frames"]
    assert second.get("/api/session").json().get("active") is False


def test_unknown_triplet_names_are_rejected(client: TestClient) -> None:
    inst = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "NotAnInstrument", "verb": "retract", "target": "gallbladder"},
    )
    assert inst.status_code == 400
    assert "NotAnInstrument" in inst.json()["detail"]
    verb = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "NotAVerb", "target": "gallbladder"},
    )
    assert verb.status_code == 400
    assert "NotAVerb" in verb.json()["detail"]
    target = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "NotATarget"},
    )
    assert target.status_code == 400
    assert "NotATarget" in target.json()["detail"]
    assert client.get("/api/triplet/CLIPA").json()["frames"] == {}


def test_triplet_rows_stack_and_allow_identical_triples(client: TestClient) -> None:
    first = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert first.status_code == 200
    assert first.json() == {
        "id": 1,
        "instrument": "grasper",
        "verb": "retract",
        "target": "gallbladder",
    }
    assert "track" not in first.json()
    second = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "hook", "verb": "dissect", "target": "cystic-duct"},
    )
    assert second.status_code == 200
    assert second.json()["id"] == 2
    dup = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert dup.status_code == 200
    assert dup.json()["id"] == 3
    rows = client.get("/api/triplet/CLIPA").json()["frames"]["0"]
    assert rows == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        },
        {
            "id": 2,
            "instrument": "hook",
            "verb": "dissect",
            "target": "cystic-duct",
        },
        {
            "id": 3,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        },
    ]
    ids = [row["id"] for row in rows]
    assert len(ids) == len(set(ids))
    assert all("track" not in row for row in rows)


def test_triplet_row_put_updates_that_row_only(client: TestClient) -> None:
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "hook", "verb": "dissect", "target": "cystic-duct"},
    )
    client.post(
        "/api/triplet/CLIPA/frames/1",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    updated = client.put(
        "/api/triplet/CLIPA/frames/0/1",
        json={"instrument": "bipolar", "verb": "grasp", "target": "omentum"},
    )
    assert updated.status_code == 200
    assert updated.json()["frames"] == {
        "0": [
            {
                "id": 1,
                "instrument": "bipolar",
                "verb": "grasp",
                "target": "omentum",
            },
            {
                "id": 2,
                "instrument": "hook",
                "verb": "dissect",
                "target": "cystic-duct",
            },
        ],
        "1": [
            {
                "id": 1,
                "instrument": "grasper",
                "verb": "retract",
                "target": "gallbladder",
            },
        ],
    }


def test_triplet_row_put_rejects_unknown_names_without_change(client: TestClient) -> None:
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    bad = client.put(
        "/api/triplet/CLIPA/frames/0/1",
        json={"instrument": "NotAnInstrument", "verb": "retract", "target": "gallbladder"},
    )
    assert bad.status_code == 400
    assert "NotAnInstrument" in bad.json()["detail"]
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]


def test_triplet_row_put_missing_id_is_not_found(client: TestClient) -> None:
    missing = client.put(
        "/api/triplet/CLIPA/frames/0/9",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert missing.status_code == 404
    assert "9" in missing.json()["detail"]


def test_delete_one_triplet_row_by_id(client: TestClient) -> None:
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "hook", "verb": "dissect", "target": "cystic-duct"},
    )
    deleted = client.delete("/api/triplet/CLIPA/frames/0/1")
    assert deleted.status_code == 200
    rows = deleted.json()["frames"]["0"]
    assert rows == [
        {
            "id": 2,
            "instrument": "hook",
            "verb": "dissect",
            "target": "cystic-duct",
        }
    ]
    loaded = client.get("/api/triplet/CLIPA")
    assert loaded.json()["frames"]["0"] == rows


def test_delete_last_triplet_row_is_unlabeled(client: TestClient) -> None:
    added = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert added.status_code == 200
    cleared = client.delete("/api/triplet/CLIPA/frames/0/1")
    assert cleared.status_code == 200
    assert "0" not in cleared.json()["frames"]
    assert client.get("/api/triplet/CLIPA").json()["frames"] == {}


def test_added_triplet_names_can_be_used_in_a_row(client: TestClient) -> None:
    inst = client.post("/api/vocab/instruments", json={"name": "my-tool"})
    assert inst.status_code == 200
    assert "my-tool" in inst.json()["instruments"]
    verb = client.post("/api/vocab/verbs", json={"name": "my-verb"})
    assert verb.status_code == 200
    assert "my-verb" in verb.json()["verbs"]
    target = client.post("/api/vocab/targets", json={"name": "my-target"})
    assert target.status_code == 200
    assert "my-target" in target.json()["targets"]
    row = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "my-tool", "verb": "my-verb", "target": "my-target"},
    )
    assert row.status_code == 200
    assert row.json() == {
        "id": 1,
        "instrument": "my-tool",
        "verb": "my-verb",
        "target": "my-target",
    }


def test_add_triplet_name_rejects_blank_and_duplicate(client: TestClient) -> None:
    blank = client.post("/api/vocab/instruments", json={"name": "   "})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/instruments", json={"name": "grasper"})
    assert dup.status_code == 409
    assert "grasper" in dup.json()["detail"]
    blank_verb = client.post("/api/vocab/verbs", json={"name": "   "})
    assert blank_verb.status_code == 400
    dup_verb = client.post("/api/vocab/verbs", json={"name": "retract"})
    assert dup_verb.status_code == 409
    blank_target = client.post("/api/vocab/targets", json={"name": "   "})
    assert blank_target.status_code == 400
    dup_target = client.post("/api/vocab/targets", json={"name": "gallbladder"})
    assert dup_target.status_code == 409


def test_triplet_rows_do_not_copy_to_next_frame(client: TestClient) -> None:
    added = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert added.status_code == 200
    loaded = client.get("/api/triplet/CLIPA")
    assert loaded.json()["frames"] == {
        "0": [
            {
                "id": 1,
                "instrument": "grasper",
                "verb": "retract",
                "target": "gallbladder",
            }
        ]
    }
    assert "1" not in loaded.json()["frames"]


def test_triplet_write_leaves_phase_class_and_session_untouched(client: TestClient) -> None:
    assert client.get("/api/session").json().get("active") is False
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert painted.status_code == 200
    cl = client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert cl.status_code == 200
    row = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert row.status_code == 200
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper", "blurred"]}
    assert client.get("/api/session").json().get("active") is False
    client.delete("/api/triplet/CLIPA/frames/0/1")
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper", "blurred"]}
    assert client.get("/api/session").json().get("active") is False


def test_triplet_survives_new_app_instance(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    clip_a = frames / "CLIPA"
    clip_a.mkdir(parents=True)
    (clip_a / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip_a / "00002.jpg").write_bytes(b"fake-jpeg-1")
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    first = TestClient(create_app(settings))
    added = first.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert added.status_code == 200
    second = TestClient(create_app(settings))
    loaded = second.get("/api/triplet/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {
        "0": [
            {
                "id": 1,
                "instrument": "grasper",
                "verb": "retract",
                "target": "gallbladder",
            }
        ]
    }
    assert "1" not in loaded.json()["frames"]
    assert second.get("/api/session").json().get("active") is False


def test_phase_survives_new_app_instance(tmp_path: Path) -> None:
    frames = tmp_path / "frames"
    clip_a = frames / "CLIPA"
    clip_a.mkdir(parents=True)
    (clip_a / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip_a / "00002.jpg").write_bytes(b"fake-jpeg-1")
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )
    first = TestClient(create_app(settings))
    painted = first.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    second = TestClient(create_app(settings))
    loaded = second.get("/api/phase/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {"0": "Preparation", "1": "Preparation"}
    assert second.get("/api/session").json().get("active") is False
