"""Compose: shared catalog + labels-only backends without a Session."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings, load_settings

_VOCAB_LISTS = ("phases", "class_tags", "instruments", "verbs", "targets")


def _add_names(client: TestClient, **lists: str | list[str]) -> None:
    for list_name, names in lists.items():
        if isinstance(names, str):
            names = [names]
        for name in names:
            added = client.post(f"/api/vocab/{list_name}", json={"name": name})
            assert added.status_code == 200, added.text


def _sitting(tmp_path: Path, clip_ids: tuple[str, ...]) -> TestClient:
    frames = tmp_path / "frames"
    for clip_id in clip_ids:
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    hidden = frames / "HIDDENCLIP"
    hidden.mkdir()
    (hidden / "00001.jpg").write_bytes(b"hidden-jpeg")
    return TestClient(
        create_app(
            Settings(
                frames_root=frames,
                clip_allowlist=clip_ids,
                annotations_root=tmp_path / "mask",
                labels_root=tmp_path / "labels",
                predictor_backend="fake",
            )
        )
    )


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return _sitting(tmp_path, ("CLIPA",))


@pytest.fixture
def two_clips(tmp_path: Path) -> TestClient:
    return _sitting(tmp_path, ("CLIPA", "CLIPB"))


def test_health_and_clips(client: TestClient) -> None:
    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["ok"] is True
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [
        {"id": "CLIPA", "kind": "jpeg", "frame_count": 2, "fps": 25},
    ]


def test_yaml_clips_skip_bad_path_and_unknown_kind(tmp_path: Path) -> None:
    good = tmp_path / "frames" / "GOOD"
    good.mkdir(parents=True)
    (good / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (good / "00002.jpg").write_bytes(b"fake-jpeg-1")
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake-mp4")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                "clips:",
                "  - id: GOOD",
                "    kind: jpeg",
                f"    path: {good}",
                "  - id: MISSING",
                "    kind: jpeg",
                f"    path: {tmp_path / 'no-such-dir'}",
                "  - id: WEIRD",
                "    kind: hologram",
                f"    path: {good}",
                "  - id: VID",
                "    kind: video",
                f"    path: {video}",
                f"labels_root: {tmp_path / 'labels'}",
                f"annotations_root: {tmp_path / 'mask'}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    client = TestClient(create_app(load_settings(yaml_path)))
    clips = client.get("/api/clips")
    assert clips.status_code == 200
    assert clips.json()["clips"] == [
        {"id": "GOOD", "kind": "jpeg", "frame_count": 2, "fps": 25},
        {"id": "VID", "kind": "video", "frame_count": 0, "fps": 25},
    ]
    meta = client.get("/api/clips/GOOD")
    assert meta.status_code == 200
    assert meta.json()["kind"] == "jpeg"
    assert client.get("/api/clips/GOOD/frames/0").content == b"fake-jpeg-0"
    assert client.get("/api/clips/MISSING").status_code == 404
    assert client.get("/api/clips/VID").json()["kind"] == "video"
    assert client.get("/api/clips/VID").json()["frame_count"] == 0
    # fake-jpeg bytes cannot decode; media now attempts a transcode and 500s
    assert client.get("/api/clips/GOOD/media").status_code == 500


_TINY_MP4 = Path(__file__).resolve().parent / "fixtures" / "tiny.mp4"


def test_video_clip_media_is_read_only_and_maps_frames(tmp_path: Path) -> None:
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                "clips:",
                "  - id: VID",
                "    kind: video",
                f"    path: {_TINY_MP4}",
                f"labels_root: {tmp_path / 'labels'}",
                f"annotations_root: {tmp_path / 'mask'}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    before = _TINY_MP4.stat().st_mtime_ns
    client = TestClient(create_app(load_settings(yaml_path)))
    listed = client.get("/api/clips").json()["clips"]
    assert listed == [{"id": "VID", "kind": "video", "frame_count": 2, "fps": 25}]
    meta = client.get("/api/clips/VID").json()
    assert meta["frame_count"] == 2
    assert meta["fps"] == 25
    media = client.get("/api/clips/VID/media")
    assert media.status_code == 200
    assert media.content == _TINY_MP4.read_bytes()
    assert _TINY_MP4.stat().st_mtime_ns == before
    assert client.get("/api/phase/VID").status_code == 200
    assert client.get("/api/clips/VID/frames/0").status_code == 404


def test_listing_clips_does_not_write_frame_pool(tmp_path: Path) -> None:
    good = tmp_path / "frames" / "GOOD"
    good.mkdir(parents=True)
    jpeg = good / "00001.jpg"
    jpeg.write_bytes(b"fake-jpeg-0")
    before = jpeg.stat().st_mtime_ns
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                "clips:",
                "  - id: GOOD",
                "    kind: jpeg",
                f"    path: {good}",
                f"labels_root: {tmp_path / 'labels'}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    client = TestClient(create_app(load_settings(yaml_path)))
    assert client.get("/api/clips").status_code == 200
    assert client.get("/api/clips/GOOD/frames/0").status_code == 200
    assert jpeg.stat().st_mtime_ns == before


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
    assert body["kind"] == "jpeg"
    assert body["fps"] == 25
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
    _add_names(client, phases="Preparation", class_tags=["grasper", "blurred"], instruments="grasper", verbs="retract", targets="gallbladder")
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


def test_fresh_vocab_lists_are_empty(client: TestClient) -> None:
    vocab = client.get("/api/vocab")
    assert vocab.status_code == 200
    body = vocab.json()
    for key in _VOCAB_LISTS:
        assert body[key] == []


def test_missing_vocab_list_keys_are_empty_not_old_seeds(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    path = tmp_path / "labels" / "vocab.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"phases": ["CustomPhase"]}\n', encoding="utf-8")
    body = client.get("/api/vocab").json()
    assert body["phases"] == ["CustomPhase"]
    assert body["class_tags"] == []
    assert body["instruments"] == []
    assert body["verbs"] == []
    assert body["targets"] == []


def test_existing_vocab_json_is_not_wiped_on_startup(tmp_path: Path) -> None:
    labels = tmp_path / "labels"
    labels.mkdir(parents=True)
    payload = {
        "phases": ["KeptPhase"],
        "class_tags": ["KeptClass"],
        "instruments": ["KeptTool"],
        "verbs": ["KeptVerb"],
        "targets": ["KeptTarget"],
    }
    path = labels / "vocab.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    before = path.read_text(encoding="utf-8")
    client = _sitting(tmp_path, ("CLIPA",))
    body = client.get("/api/vocab").json()
    for key, names in payload.items():
        assert body[key] == names
    assert path.read_text(encoding="utf-8") == before


def test_class_tag_grasper_is_not_triplet_instrument_grasper(client: TestClient) -> None:
    _add_names(client, class_tags="grasper")
    body = client.get("/api/vocab").json()
    assert body["class_tags"] == ["grasper"]
    assert body["instruments"] == []
    assert client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]}).status_code == 200
    refused = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert refused.status_code == 400
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
    assert client.get("/api/vocab").json()["class_tags"] == ["grasper"]
    row = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert row.status_code == 200
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["instrument"] == "grasper"


def test_phase_span_paints_every_frame_from_through_to(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
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
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 1, "to": 0},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "Preparation", "1": "Preparation"}


def test_phase_span_equal_from_to_writes_one_frame(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": "Preparation"}
    assert "1" not in painted.json()["frames"]


def test_later_phase_span_overwrites_overlap_only(client: TestClient) -> None:
    _add_names(client, phases=["Preparation", "Clipping and cutting"])
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
    _add_names(client, phases="Preparation")
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
    _add_names(client, phases="Preparation")
    r = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 2},
    )
    assert r.status_code == 400
    assert client.get("/api/phase/CLIPA").json()["frames"] == {}


def test_phase_span_null_clears_every_frame_from_through_to(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    cleared = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": None, "from": 0, "to": 1},
    )
    assert cleared.status_code == 200
    assert cleared.json()["frames"] == {}
    loaded = client.get("/api/phase/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {}


def test_phase_span_null_swaps_when_from_is_after_to(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    cleared = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": None, "from": 1, "to": 0},
    )
    assert cleared.status_code == 200
    assert cleared.json()["frames"] == {}


def test_phase_span_null_equal_from_to_clears_one_frame(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    cleared = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": None, "from": 0, "to": 0},
    )
    assert cleared.status_code == 200
    assert "0" not in cleared.json()["frames"]
    assert cleared.json()["frames"]["1"] == "Preparation"


def test_phase_span_null_outside_clip_is_rejected(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    rejected = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": None, "from": 0, "to": 2},
    )
    assert rejected.status_code == 400
    assert client.get("/api/phase/CLIPA").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }


def test_phase_span_null_leaves_class_triplet_and_session_untouched(client: TestClient) -> None:
    _add_names(client, phases="Preparation", class_tags="grasper", instruments="grasper", verbs="retract", targets="gallbladder")
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
    cleared = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": None, "from": 0, "to": 1},
    )
    assert cleared.status_code == 200
    assert cleared.json()["frames"] == {}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/session").json().get("active") is False


def test_unlabeled_frame_has_no_phase_key(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
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
    _add_names(client, phases="Preparation")
    blank = client.post("/api/vocab/phases", json={"name": "   "})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/phases", json={"name": "Preparation"})
    assert dup.status_code == 409
    assert "Preparation" in dup.json()["detail"]


def test_phase_write_leaves_class_triplet_and_session_untouched(client: TestClient) -> None:
    _add_names(client, phases="Preparation", class_tags="grasper", instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, class_tags="grasper")
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
    _add_names(client, class_tags=["grasper", "blurred"])
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
    _add_names(client, class_tags=["grasper", "blurred"])
    put = client.put(
        "/api/class/CLIPA/frames/0",
        json={"tags": ["grasper", "grasper", "blurred", "grasper"]},
    )
    assert put.status_code == 200
    assert put.json()["frames"]["0"] == ["grasper", "blurred"]


def test_class_span_unions_one_tag_across_inclusive_range(client: TestClient) -> None:
    _add_names(client, class_tags=["grasper", "hook", "blurred"])
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
    _add_names(client, class_tags=["grasper", "blurred"])
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
    _add_names(client, class_tags=["grasper", "blurred"])
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    client.put("/api/class/CLIPA/frames/1", json={"tags": ["grasper"]})
    painted = client.post(
        "/api/class/CLIPA/span",
        json={"tag": "grasper", "from": 0, "to": 1, "on": False},
    )
    assert painted.status_code == 200
    assert painted.json()["frames"] == {"0": ["blurred"]}


def test_class_span_rejects_bad_range_or_vocab_without_partial_change(client: TestClient) -> None:
    _add_names(client, class_tags=["grasper", "blurred"])
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
    _add_names(client, phases="Preparation", class_tags=["grasper", "blurred"], instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(first, class_tags="blurred")
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, instruments=["grasper", "hook"], verbs=["retract", "dissect"], targets=["gallbladder", "omentum"])
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
    _add_names(client, instruments=["grasper", "hook"], verbs=["retract", "dissect"], targets=["gallbladder", "omentum"])
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
    _add_names(client, phases="Preparation", class_tags=["grasper", "blurred"], instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(first, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, class_tags="grasper")
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    cleared = client.put("/api/class/CLIPA/frames/0", json={"tags": []})
    assert cleared.status_code == 200
    assert "0" not in cleared.json()["frames"]
    assert client.get("/api/class/CLIPA").json()["frames"] == {}


def test_class_flags_do_not_copy_to_next_frame(client: TestClient) -> None:
    _add_names(client, class_tags=["grasper", "blurred"])
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
    _add_names(client, class_tags="grasper")
    blank = client.post("/api/vocab/class_tags", json={"name": "   "})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/class_tags", json={"name": "grasper"})
    assert dup.status_code == 409
    assert "grasper" in dup.json()["detail"]


def test_class_write_leaves_phase_triplet_and_session_untouched(client: TestClient) -> None:
    _add_names(client, phases="Preparation", class_tags=["grasper", "blurred"], instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(first, class_tags=["grasper", "blurred"])
    put = first.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    assert put.status_code == 200
    second = TestClient(create_app(settings))
    loaded = second.get("/api/class/CLIPA")
    assert loaded.status_code == 200
    assert loaded.json()["frames"] == {"0": ["grasper", "blurred"]}
    assert "1" not in loaded.json()["frames"]
    assert second.get("/api/session").json().get("active") is False


def test_unknown_triplet_names_are_rejected(client: TestClient) -> None:
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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


def test_triplet_rows_stack_and_toggle_identical_triple(client: TestClient) -> None:
    _add_names(
        client,
        phases="Preparation",
        class_tags="blurred",
        instruments=["grasper", "hook"],
        verbs=["retract", "dissect"],
        targets=["gallbladder", "cystic-duct"],
    )
    assert client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    ).status_code == 200
    assert client.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]}).status_code == 200
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
    rows = client.get("/api/triplet/CLIPA").json()["frames"]["0"]
    assert rows == [
        {
            "id": 2,
            "instrument": "hook",
            "verb": "dissect",
            "target": "cystic-duct",
        },
    ]
    assert all("track" not in row for row in rows)
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["blurred"]}
    assert client.get("/api/session").json().get("active") is False


def test_triplet_post_collapses_leftover_duplicate_rows(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _add_names(
        client,
        instruments=["grasper", "hook"],
        verbs=["retract", "dissect"],
        targets=["gallbladder", "cystic-duct"],
    )
    path = tmp_path / "labels" / "triplet" / "CLIPA.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "clip_id": "CLIPA",
                "frames": {
                    "0": [
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
                },
            }
        ),
        encoding="utf-8",
    )
    off = client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert off.status_code == 200
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 2,
            "instrument": "hook",
            "verb": "dissect",
            "target": "cystic-duct",
        },
    ]


def test_triplet_row_put_updates_that_row_only(client: TestClient) -> None:
    _add_names(client, instruments=["grasper", "hook", "bipolar"], verbs=["grasp", "retract", "dissect"], targets=["gallbladder", "cystic-duct", "omentum"])
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
    missing = client.put(
        "/api/triplet/CLIPA/frames/0/9",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert missing.status_code == 404
    assert "9" in missing.json()["detail"]


def test_delete_one_triplet_row_by_id(client: TestClient) -> None:
    _add_names(client, instruments=["grasper", "hook"], verbs=["retract", "dissect"], targets=["gallbladder", "cystic-duct"])
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(client, phases="Preparation", class_tags=["grasper", "blurred"], instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(first, instruments="grasper", verbs="retract", targets="gallbladder")
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
    _add_names(first, phases="Preparation")
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


def test_phase_rename_rewrites_every_clip_of_that_kind(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, phases=["Preparation", "Clipping and cutting"], class_tags="grasper", instruments="grasper", verbs="retract", targets="gallbladder")
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 1})
    client.post("/api/phase/CLIPB/span", json={"phase": "Preparation", "from": 0, "to": 0})
    client.put("/api/phase/CLIPB/frames/1", json={"phase": "Clipping and cutting"})

    renamed = client.post(
        "/api/vocab/phases/rename",
        json={"from": "Preparation", "to": "Prep"},
    )
    assert renamed.status_code == 200
    assert "Prep" in renamed.json()["phases"]
    assert "Preparation" not in renamed.json()["phases"]
    assert client.get("/api/vocab").json()["phases"] == renamed.json()["phases"]

    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Prep", "1": "Prep"}
    assert client.get("/api/phase/CLIPB").json()["frames"] == {
        "0": "Prep",
        "1": "Clipping and cutting",
    }
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/session").json().get("active") is False


def test_phase_rename_rejects_blank_and_duplicate_without_change(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, phases=["Preparation", "Clipping and cutting"])
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 1})
    client.post("/api/phase/CLIPB/span", json={"phase": "Preparation", "from": 0, "to": 1})
    before = client.get("/api/vocab").json()["phases"]

    blank = client.post("/api/vocab/phases/rename", json={"from": "Preparation", "to": "   "})
    assert blank.status_code == 400
    dup = client.post(
        "/api/vocab/phases/rename",
        json={"from": "Preparation", "to": "Clipping and cutting"},
    )
    assert dup.status_code == 409
    assert "Clipping and cutting" in dup.json()["detail"]

    assert client.get("/api/vocab").json()["phases"] == before
    assert client.get("/api/phase/CLIPA").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }
    assert client.get("/api/phase/CLIPB").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }


def test_class_tag_rename_rewrites_class_clips_not_triplet_strings(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, phases="Preparation", class_tags=["grasper", "hook", "blurred"], instruments=["grasper", "hook"], verbs=["grasp", "retract"], targets=["gallbladder", "omentum"])
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 0})
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    client.put("/api/class/CLIPA/frames/1", json={"tags": ["hook"]})
    client.put("/api/class/CLIPB/frames/0", json={"tags": ["grasper"]})
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post(
        "/api/triplet/CLIPB/frames/1",
        json={"instrument": "grasper", "verb": "grasp", "target": "omentum"},
    )

    renamed = client.post(
        "/api/vocab/class_tags/rename",
        json={"from": "grasper", "to": "jaw"},
    )
    assert renamed.status_code == 200
    assert "jaw" in renamed.json()["class_tags"]
    assert "grasper" not in renamed.json()["class_tags"]
    assert "grasper" in renamed.json()["instruments"]

    assert client.get("/api/class/CLIPA").json()["frames"] == {
        "0": ["jaw", "blurred"],
        "1": ["hook"],
    }
    assert client.get("/api/class/CLIPB").json()["frames"] == {"0": ["jaw"]}
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/triplet/CLIPB").json()["frames"]["1"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "grasp",
            "target": "omentum",
        }
    ]


def test_class_tag_rename_rejects_blank_and_duplicate_without_change(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, class_tags=["grasper", "hook"])
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    client.put("/api/class/CLIPB/frames/1", json={"tags": ["grasper", "hook"]})
    before = client.get("/api/vocab").json()["class_tags"]

    blank = client.post("/api/vocab/class_tags/rename", json={"from": "grasper", "to": ""})
    assert blank.status_code == 400
    dup = client.post("/api/vocab/class_tags/rename", json={"from": "grasper", "to": "hook"})
    assert dup.status_code == 409

    assert client.get("/api/vocab").json()["class_tags"] == before
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/class/CLIPB").json()["frames"] == {"1": ["grasper", "hook"]}


def test_triplet_list_rename_is_rejected_and_leaves_rows(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    refused = client.post(
        "/api/vocab/instruments/rename",
        json={"from": "grasper", "to": "jaw"},
    )
    assert refused.status_code == 400
    assert client.get("/api/vocab").json()["instruments"][0] == "grasper"
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["instrument"] == "grasper"


def test_phase_delete_rewrites_every_clip_of_that_kind(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(
        client,
        phases=["Preparation", "Clipping and cutting"],
        class_tags="grasper",
        instruments="grasper",
        verbs="retract",
        targets="gallbladder",
    )
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]})
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 1})
    client.post("/api/phase/CLIPB/span", json={"phase": "Preparation", "from": 0, "to": 0})
    client.put("/api/phase/CLIPB/frames/1", json={"phase": "Clipping and cutting"})

    deleted = client.delete("/api/vocab/phases/Preparation")
    assert deleted.status_code == 200
    assert "Preparation" not in deleted.json()["phases"]
    assert "Clipping and cutting" in deleted.json()["phases"]
    assert client.get("/api/vocab").json()["phases"] == deleted.json()["phases"]

    assert client.get("/api/phase/CLIPA").json()["frames"] == {}
    assert client.get("/api/phase/CLIPB").json()["frames"] == {"1": "Clipping and cutting"}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/session").json().get("active") is False


def test_phase_delete_restores_clips_on_half_failure(two_clips: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    client = two_clips
    _add_names(client, phases="Preparation")
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 1})
    client.post("/api/phase/CLIPB/span", json={"phase": "Preparation", "from": 0, "to": 1})

    from endo_label import labels_store

    original = labels_store._write
    clip_writes = {"n": 0}

    def flaky(path: Path, data: dict) -> None:
        if path.parent.name == "phase":
            clip_writes["n"] += 1
            if clip_writes["n"] >= 2:
                raise OSError("disk full")
        original(path, data)

    monkeypatch.setattr(labels_store, "_write", flaky)
    with pytest.raises(OSError, match="disk full"):
        client.delete("/api/vocab/phases/Preparation")
    assert client.get("/api/vocab").json()["phases"] == ["Preparation"]
    assert client.get("/api/phase/CLIPA").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }
    assert client.get("/api/phase/CLIPB").json()["frames"] == {
        "0": "Preparation",
        "1": "Preparation",
    }


def test_class_tag_delete_rewrites_class_clips_not_triplet_strings(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(
        client,
        phases="Preparation",
        class_tags=["grasper", "hook", "blurred"],
        instruments=["grasper", "hook"],
        verbs=["grasp", "retract"],
        targets=["gallbladder", "omentum"],
    )
    client.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 0})
    client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})
    client.put("/api/class/CLIPA/frames/1", json={"tags": ["hook"]})
    client.put("/api/class/CLIPB/frames/0", json={"tags": ["grasper"]})
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post(
        "/api/triplet/CLIPB/frames/1",
        json={"instrument": "grasper", "verb": "grasp", "target": "omentum"},
    )

    deleted = client.delete("/api/vocab/class_tags/grasper")
    assert deleted.status_code == 200
    assert "grasper" not in deleted.json()["class_tags"]
    assert "hook" in deleted.json()["class_tags"]
    assert "grasper" in deleted.json()["instruments"]

    assert client.get("/api/class/CLIPA").json()["frames"] == {
        "0": ["blurred"],
        "1": ["hook"],
    }
    assert client.get("/api/class/CLIPB").json()["frames"] == {}
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "retract",
            "target": "gallbladder",
        }
    ]
    assert client.get("/api/triplet/CLIPB").json()["frames"]["1"] == [
        {
            "id": 1,
            "instrument": "grasper",
            "verb": "grasp",
            "target": "omentum",
        }
    ]


def test_instrument_delete_refused_while_row_uses_it_then_allowed(two_clips: TestClient) -> None:
    client = two_clips
    _add_names(client, instruments="grasper", verbs="retract", targets="gallbladder")
    client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    client.post(
        "/api/triplet/CLIPB/frames/1",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    before = client.get("/api/vocab").json()["instruments"]
    rows_a = client.get("/api/triplet/CLIPA").json()["frames"]
    rows_b = client.get("/api/triplet/CLIPB").json()["frames"]

    refused = client.delete("/api/vocab/instruments/grasper")
    assert refused.status_code == 409
    assert "grasper" in refused.json()["detail"]
    assert client.get("/api/vocab").json()["instruments"] == before
    assert client.get("/api/triplet/CLIPA").json()["frames"] == rows_a
    assert client.get("/api/triplet/CLIPB").json()["frames"] == rows_b

    client.delete("/api/triplet/CLIPA/frames/0/1")
    still = client.delete("/api/vocab/instruments/grasper")
    assert still.status_code == 409
    client.delete("/api/triplet/CLIPB/frames/1/1")

    deleted = client.delete("/api/vocab/instruments/grasper")
    assert deleted.status_code == 200
    assert "grasper" not in deleted.json()["instruments"]
    assert client.get("/api/triplet/CLIPA").json()["frames"] == {}
    assert client.get("/api/triplet/CLIPB").json()["frames"] == {}


def test_vocab_delete_unknown_name_is_rejected(client: TestClient) -> None:
    _add_names(client, phases="Preparation")
    missing = client.delete("/api/vocab/phases/NotAPhase")
    assert missing.status_code == 400
    assert client.get("/api/vocab").json()["phases"] == ["Preparation"]


def test_existing_vocab_json_seed_is_removed_only_by_delete(tmp_path: Path) -> None:
    labels = tmp_path / "labels"
    labels.mkdir(parents=True)
    payload = {
        "phases": ["Preparation"],
        "class_tags": ["grasper"],
        "instruments": ["grasper"],
        "verbs": ["retract"],
        "targets": ["gallbladder"],
    }
    (labels / "vocab.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    client = _sitting(tmp_path, ("CLIPA",))
    assert client.get("/api/vocab").json()["phases"] == ["Preparation"]
    deleted = client.delete("/api/vocab/phases/Preparation")
    assert deleted.status_code == 200
    assert deleted.json()["phases"] == []
    assert client.get("/api/vocab").json()["class_tags"] == ["grasper"]
    assert client.get("/api/vocab").json()["instruments"] == ["grasper"]
