"""Compose HTTP: Geometric Predict, immediate Annotation, no Session for vocab."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings

_POINT = {"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [1]}


def _sitting(tmp_path: Path, clip_ids: tuple[str, ...]) -> TestClient:
    frames = tmp_path / "frames"
    for clip_id in clip_ids:
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return TestClient(
        create_app(
            Settings(
                frames_root=frames,
                clip_allowlist=clip_ids,
                annotations_root=tmp_path / "mask",
                labels_root=tmp_path / "labels",
                predictor_backend="fake",
                scribble_backend="fake",
            )
        )
    )


def _open(client: TestClient, clip_id: str = "CLIPA", *, load: bool = False) -> dict:
    created = client.post(
        "/api/session",
        json={"clip_id": clip_id, "load_annotations": load},
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_session_stays_inactive_until_opened_and_vocab_does_not_open_it(
    tmp_path: Path,
) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    assert client.get("/api/session").json() == {"active": False}
    assert client.get("/api/clips/CLIPA/annotations").status_code == 404
    assert client.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    painted = client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 1},
    )
    assert painted.status_code == 200
    assert client.get("/api/session").json() == {"active": False}
    assert client.get("/api/clips/CLIPA/annotations").status_code == 404
    refused = client.post("/api/session/predict", json=_POINT)
    assert refused.status_code == 404


def test_geometric_predict_writes_annotation_and_survives_closed_session(
    tmp_path: Path,
) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    predicted = client.post("/api/session/predict", json=_POINT)
    assert predicted.status_code == 200, predicted.text
    body = predicted.json()
    assert body["empty"] is False
    assert body["tracks"][0]["label"] == "track-1"
    assert body["tracks"][0]["track_id"] == 1
    assert body["tracks"][0]["mask"]["format"] == "rle_fg"
    assert body["tracks"][0]["mask"]["source"] == "manual"

    listed = client.get("/api/clips/CLIPA/annotations")
    assert listed.status_code == 200, listed.text
    assert listed.json()["tracks"][0]["label"] == "track-1"
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame.status_code == 200
    masks = frame.json()["masks"]
    assert len(masks) == 1
    assert masks[0]["track_id"] == 1
    assert masks[0]["format"] == "rle_fg"
    assert masks[0]["size"] == [64, 64]
    assert sum(masks[0]["counts"]) == 64 * 64

    closed = client.delete("/api/session")
    assert closed.status_code == 200
    assert closed.json() == {"active": False}
    assert client.get("/api/session").json() == {"active": False}
    reloaded = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert reloaded.status_code == 200
    assert reloaded.json()["masks"][0]["track_id"] == 1
    other = client.get("/api/clips/CLIPA/annotations/frames/1")
    assert other.status_code == 200
    assert other.json()["masks"] == []


def test_load_annotations_hydrates_session_from_disk(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    assert client.post("/api/session/predict", json=_POINT).status_code == 200
    assert client.delete("/api/session").status_code == 200
    loaded = _open(client, load=True)
    assert loaded["active"] is True
    assert loaded["tracks"][0]["label"] == "track-1"
    framed = client.get("/api/session", params={"frame_index": 0})
    assert framed.json()["tracks"][0]["mask"]["format"] == "rle_fg"


def test_boxes_payload_is_rejected(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    boxed = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "points": [[0.5, 0.5]],
            "point_labels": [1],
            "boxes": [[0.1, 0.1, 0.4, 0.4]],
            "box_labels": [1],
        },
    )
    assert boxed.status_code == 400
    assert "box" in boxed.json()["detail"].lower()
    assert client.get("/api/clips/CLIPA/annotations").status_code == 404


def test_negatives_alone_do_not_create_a_track(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    carved = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [0]},
    )
    assert carved.status_code == 400
    assert client.get("/api/session").json()["tracks"] == []
    assert client.get("/api/clips/CLIPA/annotations").status_code == 404


def test_at_most_16_tracks(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    for i in range(16):
        x = 0.2 + (i * 0.03)
        row = client.post(
            "/api/session/predict",
            json={"frame_index": 0, "points": [[x, 0.4]], "point_labels": [1]},
        )
        assert row.status_code == 200, row.text
        assert row.json()["empty"] is False
    extra = client.post("/api/session/predict", json=_POINT)
    assert extra.status_code == 400
    assert "16" in extra.json()["detail"]
    assert len(client.get("/api/session").json()["tracks"]) == 16


def test_mask_predict_leaves_phase_class_triplet_untouched(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    assert client.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    assert client.post("/api/vocab/class_tags", json={"name": "grasper"}).status_code == 200
    assert client.post(
        "/api/vocab/triples",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    assert client.post(
        "/api/phase/CLIPA/span",
        json={"phase": "Preparation", "from": 0, "to": 0},
    ).status_code == 200
    assert client.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper"]}).status_code == 200
    assert client.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    assert client.get("/api/session").json()["active"] is False
    _open(client)
    assert client.post("/api/session/predict", json=_POINT).status_code == 200
    assert client.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert client.get("/api/class/CLIPA").json()["frames"] == {"0": ["grasper"]}
    assert client.get("/api/triplet/CLIPA").json()["frames"]["0"][0]["id"] == 1


def test_annotation_does_not_leak_across_clips(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA", "CLIPB"))
    _open(client, "CLIPA")
    assert client.post("/api/session/predict", json=_POINT).status_code == 200
    assert client.get("/api/clips/CLIPA/annotations").status_code == 200
    assert client.get("/api/clips/CLIPB/annotations").status_code == 404
    assert client.delete("/api/session").status_code == 200
    _open(client, "CLIPB")
    assert client.get("/api/session").json()["tracks"] == []
    assert client.get("/api/clips/CLIPB/annotations").status_code == 404
