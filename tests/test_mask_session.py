"""Compose HTTP: Geometric Predict, immediate Annotation, no Session for vocab."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.mask.predictor import FakePredictor
from endo_label.mask.session import SessionManager

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


class _RecordingGeometry(FakePredictor):
    """Fake SAM that records Geometric Predict kwargs."""

    def __init__(self) -> None:
        self.geometry_calls: list[dict] = []

    def predict_geometry(
        self,
        *,
        clip_id: str,
        frame_index: int,
        points: list[list[float]],
        point_labels: list[int],
        boxes: list[list[float]],
        box_labels: list[int],
        base_mask: dict | None = None,
        track_id: int | None = None,
    ):
        self.geometry_calls.append(
            {
                "points": [list(p) for p in points],
                "point_labels": list(point_labels),
                "base_mask": dict(base_mask) if base_mask is not None else None,
                "track_id": track_id,
            }
        )
        return super().predict_geometry(
            clip_id=clip_id,
            frame_index=frame_index,
            points=points,
            point_labels=point_labels,
            boxes=boxes,
            box_labels=box_labels,
            base_mask=base_mask,
            track_id=track_id,
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


def test_get_session_returns_leftover_points_annotation_has_none(
    tmp_path: Path,
) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    predicted = client.post("/api/session/predict", json=_POINT)
    assert predicted.status_code == 200
    tid = predicted.json()["tracks"][0]["track_id"]

    session = client.get("/api/session", params={"frame_index": 0}).json()
    track = next(row for row in session["tracks"] if row["track_id"] == tid)
    assert track["geometric_memory"] == [{"x": 0.5, "y": 0.5, "positive": True}]

    bare = client.get("/api/session").json()
    bare_track = next(row for row in bare["tracks"] if row["track_id"] == tid)
    assert "geometric_memory" not in bare_track

    listed = client.get("/api/clips/CLIPA/annotations")
    assert listed.status_code == 200
    assert "geometric_memory" not in listed.text
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame.status_code == 200
    assert "geometric_memory" not in frame.text
    assert "positive" not in frame.text
    assert client.delete("/api/session").status_code == 200
    loaded = _open(client, load=True)
    assert loaded["tracks"][0]["track_id"] == tid
    reopened = client.get("/api/session", params={"frame_index": 0}).json()
    revived = next(row for row in reopened["tracks"] if row["track_id"] == tid)
    assert revived["geometric_memory"] == []
    assert "mask" in revived


def test_second_geometric_predict_resends_leftovers_and_mask_prior(
    tmp_path: Path,
) -> None:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    recorder = _RecordingGeometry()
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
    )
    client = TestClient(
        create_app(settings, session_manager=SessionManager(settings, recorder))
    )
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200
    tid = first.json()["tracks"][0]["track_id"]
    prior = first.json()["tracks"][0]["mask"]
    assert recorder.geometry_calls[-1]["points"] == [[0.25, 0.25]]

    second = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "points": [[0.8, 0.8]],
            "point_labels": [1],
        },
    )
    assert second.status_code == 200
    last = recorder.geometry_calls[-1]
    assert last["points"] == [[0.25, 0.25], [0.8, 0.8]]
    assert last["point_labels"] == [1, 1]
    assert last["base_mask"] is not None
    assert last["base_mask"]["format"] == "rle_fg"
    assert list(last["base_mask"]["counts"]) == list(prior["counts"])

    session = client.get("/api/session", params={"frame_index": 0}).json()
    track = next(row for row in session["tracks"] if row["track_id"] == tid)
    assert track["geometric_memory"] == [
        {"x": 0.25, "y": 0.25, "positive": True},
        {"x": 0.8, "y": 0.8, "positive": True},
    ]


def test_leftover_pin_delete_repredicts_remaining_last_pin_plus_prior(
    tmp_path: Path,
) -> None:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    recorder = _RecordingGeometry()
    settings = Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
    )
    client = TestClient(
        create_app(settings, session_manager=SessionManager(settings, recorder))
    )
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200
    tid = first.json()["tracks"][0]["track_id"]
    assert (
        client.post(
            "/api/session/predict",
            json={
                "frame_index": 0,
                "track_id": tid,
                "points": [[0.8, 0.8]],
                "point_labels": [1],
            },
        ).status_code
        == 200
    )
    prior = client.get("/api/session", params={"frame_index": 0}).json()
    prior_counts = list(
        next(row for row in prior["tracks"] if row["track_id"] == tid)["mask"]["counts"]
    )

    dropped = client.delete(f"/api/session/tracks/{tid}/frames/0/points/0")
    assert dropped.status_code == 200, dropped.text
    last = recorder.geometry_calls[-1]
    assert last["points"] == [[0.8, 0.8]]
    assert last["point_labels"] == [1]
    assert last["base_mask"] is not None
    assert list(last["base_mask"]["counts"]) == prior_counts
    track = next(row for row in dropped.json()["tracks"] if row["track_id"] == tid)
    assert track["geometric_memory"] == [{"x": 0.8, "y": 0.8, "positive": True}]
    assert track["mask"]["source"] == "refined"
    assert "geometric_memory" not in client.get("/api/clips/CLIPA/annotations").text

    last_prior = list(track["mask"]["counts"])
    last_pin = client.delete(f"/api/session/tracks/{tid}/frames/0/points/0")
    assert last_pin.status_code == 200, last_pin.text
    only_prior = recorder.geometry_calls[-1]
    assert only_prior["points"] == []
    assert only_prior["point_labels"] == []
    assert only_prior["base_mask"] is not None
    assert list(only_prior["base_mask"]["counts"]) == last_prior
    empty = next(row for row in last_pin.json()["tracks"] if row["track_id"] == tid)
    assert empty["geometric_memory"] == []
    assert "mask" in empty
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame.status_code == 200
    assert frame.json()["masks"][0]["track_id"] == tid


def test_pins_stay_on_that_frame_and_clear_mask_drops_them(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200
    tid = first.json()["tracks"][0]["track_id"]
    other = client.post(
        "/api/session/predict",
        json={
            "frame_index": 1,
            "track_id": tid,
            "points": [[0.7, 0.7]],
            "point_labels": [1],
        },
    )
    assert other.status_code == 200

    on_zero = client.get("/api/session", params={"frame_index": 0}).json()
    t0 = next(row for row in on_zero["tracks"] if row["track_id"] == tid)
    assert t0["geometric_memory"] == [{"x": 0.25, "y": 0.25, "positive": True}]
    on_one = client.get("/api/session", params={"frame_index": 1}).json()
    t1 = next(row for row in on_one["tracks"] if row["track_id"] == tid)
    assert t1["geometric_memory"] == [{"x": 0.7, "y": 0.7, "positive": True}]

    cleared = client.delete(f"/api/session/tracks/{tid}/frames/0")
    assert cleared.status_code == 200
    after = client.get("/api/session", params={"frame_index": 0}).json()
    gone = next(row for row in after["tracks"] if row["track_id"] == tid)
    assert gone["geometric_memory"] == []
    assert "mask" not in gone
    kept = client.get("/api/session", params={"frame_index": 1}).json()
    still = next(row for row in kept["tracks"] if row["track_id"] == tid)
    assert still["geometric_memory"] == [{"x": 0.7, "y": 0.7, "positive": True}]
