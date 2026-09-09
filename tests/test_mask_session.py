"""Compose HTTP: Geometric Predict, Scribble + Handoff, immediate Annotation."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from tests.sitting_http import authed_client, login, seed_admin
from endo_label.mask import annotations
from endo_label.mask.mask_codec import decode_rle, encode_rle
from endo_label.mask.predictor import FakePredictor
from endo_label.mask.scribble import (
    FakeScribbleModel,
    UnreadyScribbleModel,
    resolve_scribble_widths,
)
from endo_label.mask.session import SessionManager

_POINT = {"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [1]}
_STROKE = [[0.4, 0.5], [0.6, 0.5]]


def _settings_for(
    tmp_path: Path,
    clip_ids: tuple[str, ...],
    *,
    frames: int = 2,
) -> Settings:
    frames_root = tmp_path / "frames"
    for clip_id in clip_ids:
        clip = frames_root / clip_id
        clip.mkdir(parents=True)
        for index in range(frames):
            (clip / f"{index + 1:05d}.jpg").write_bytes(b"fake-jpeg")
    return Settings(
        frames_root=frames_root,
        clip_allowlist=clip_ids,
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
    )


def _sitting(
    tmp_path: Path,
    clip_ids: tuple[str, ...],
    *,
    frames: int = 2,
) -> TestClient:
    return authed_client(_settings_for(tmp_path, clip_ids, frames=frames))


def _authed_session(settings: Settings, session_manager: SessionManager) -> TestClient:
    seed_admin(settings)
    client = TestClient(create_app(settings, session_manager=session_manager))
    login(client)
    return client


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


def _sitting_with(
    tmp_path: Path,
    predictor: FakePredictor | None = None,
    scribble: FakeScribbleModel | UnreadyScribbleModel | None = None,
) -> TestClient:
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
        scribble_backend="fake",
    )
    return _authed_session(
        settings, SessionManager(settings, predictor, scribble=scribble)
    )


class _ScriptedSam(_RecordingGeometry):
    """Fake SAM that can be told to raise or return empty on Geometric Predict."""

    def __init__(self) -> None:
        super().__init__()
        self.mode = "ok"  # ok | raise | empty
        self.last_result: dict | None = None

    def predict_geometry(self, **kwargs):
        if self.mode == "raise":
            raise RuntimeError("SAM worker exploded")
        out = super().predict_geometry(**kwargs)
        if self.mode == "empty":
            return None
        self.last_result = out
        return out


class _RecordingScribble(FakeScribbleModel):
    """Fake Scribble that records effective per-stroke widths."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[dict] = []

    def predict(self, **kwargs):
        self.calls.append(
            {
                "labels": list(kwargs["scribble_labels"]),
                "widths": resolve_scribble_widths(
                    kwargs["scribbles"], kwargs["scribble_widths"]
                ),
            }
        )
        return super().predict(**kwargs)


class _RecordingMemoryScribble(FakeScribbleModel):
    """Fake Scribble that records mask-memory loads and clears."""

    def __init__(self) -> None:
        super().__init__()
        self.loads: list[dict] = []
        self.clears: list[dict] = []

    def load_memory(
        self,
        *,
        session_id: str,
        track_id: int,
        frame_index: int,
        mask: dict,
    ) -> None:
        self.loads.append(
            {
                "session_id": session_id,
                "track_id": track_id,
                "frame_index": frame_index,
                "counts": list(mask.get("counts") or []),
            }
        )
        super().load_memory(
            session_id=session_id,
            track_id=track_id,
            frame_index=frame_index,
            mask=mask,
        )

    def clear_memory(
        self,
        *,
        session_id: str,
        track_id: int | None = None,
        frame_index: int | None = None,
    ) -> None:
        self.clears.append(
            {
                "session_id": session_id,
                "track_id": track_id,
                "frame_index": frame_index,
            }
        )
        super().clear_memory(
            session_id=session_id, track_id=track_id, frame_index=frame_index
        )


def _track_frame(client: TestClient, track_id: int, frame_index: int = 0) -> dict:
    session = client.get("/api/session", params={"frame_index": frame_index}).json()
    return next(row for row in session["tracks"] if row["track_id"] == track_id)


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
    client = _authed_session(settings, SessionManager(settings, recorder))
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
    client = _authed_session(settings, SessionManager(settings, recorder))
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


def test_positive_stroke_creates_track_via_scribble_handoff(tmp_path: Path) -> None:
    sam = _ScriptedSam()
    scrib = _RecordingScribble()
    client = _sitting_with(tmp_path, predictor=sam, scribble=scrib)
    _open(client)
    predicted = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "scribbles": [_STROKE],
            "scribble_labels": [1],
            "scribble_widths": [12],
        },
    )
    assert predicted.status_code == 200, predicted.text
    body = predicted.json()
    assert body["empty"] is False
    track = body["tracks"][0]
    assert track["track_id"] == 1
    assert track["mask"]["source"] == "manual"
    assert track["mask"]["model_provenance"] == {"mask_handoff": True}

    # Scribble ran with the stamped width; SAM received the complete silhouette.
    assert scrib.calls[0]["labels"] == [1]
    assert scrib.calls[0]["widths"] == [12]
    assert len(sam.geometry_calls) == 1
    base = sam.geometry_calls[0]["base_mask"]
    assert base is not None and base["format"] == "rle_fg"
    assert sum(base["counts"]) > 300  # complete region, not a thin ink ribbon

    # Visible mask is SAM's return; no polish step rewrote it.
    assert list(track["mask"]["counts"]) == list(sam.last_result["counts"])

    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame.status_code == 200
    assert frame.json()["masks"][0]["track_id"] == 1
    assert client.get("/api/session", params={"frame_index": 0}).json()[
        "tracks"
    ][0]["mask"]["model_provenance"] == {"mask_handoff": True}


def test_negative_stroke_alone_does_not_create_a_track(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    carved = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "scribbles": [_STROKE],
            "scribble_labels": [0],
        },
    )
    assert carved.status_code == 400
    assert client.get("/api/session").json()["tracks"] == []
    assert client.get("/api/clips/CLIPA/annotations").status_code == 404


def test_negative_stroke_carves_existing_mask_loaded_into_scribble_memory(
    tmp_path: Path,
) -> None:
    client = _sitting_with(tmp_path, scribble=FakeScribbleModel())
    _open(client)
    seeded = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "scribbles": [[[0.25, 0.25], [0.35, 0.25]]],
            "scribble_labels": [1],
        },
    )
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]

    carved = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.2, 0.15]]],
            "scribble_labels": [0],
        },
    )
    assert carved.status_code == 200, carved.text
    track = carved.json()["tracks"][0]
    assert track["mask"]["source"] == "refined"
    assert track["mask"]["model_provenance"] == {"mask_handoff": True}
    grid = decode_rle(track["mask"])
    assert grid[9][12] == 0  # carved upper-left corner at (0.2, 0.15)
    assert grid[22][25] == 1  # seeded silhouette survives at (0.4, 0.35)


def test_scribble_worker_down_503_on_strokes_points_still_work(
    tmp_path: Path,
) -> None:
    client = _sitting_with(
        tmp_path, scribble=UnreadyScribbleModel(message="Scribble GPU down")
    )
    _open(client)
    seeded = client.post("/api/session/predict", json=_POINT)
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]
    prior_counts = list(seeded.json()["tracks"][0]["mask"]["counts"])

    stroked = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [_STROKE],
            "scribble_labels": [1],
        },
    )
    assert stroked.status_code == 503
    assert "Scribble GPU down" in stroked.json()["detail"]

    track = _track_frame(client, tid)
    assert list(track["mask"]["counts"]) == prior_counts
    assert track["mask"]["source"] == "manual"

    fresh = client.post(
        "/api/session/predict",
        json={
            "frame_index": 1,
            "scribbles": [_STROKE],
            "scribble_labels": [1],
        },
    )
    assert fresh.status_code == 503
    assert [row["track_id"] for row in client.get("/api/session").json()["tracks"]] == [tid]

    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert [m["track_id"] for m in frame.json()["masks"]] == [tid]

    again = client.post("/api/session/predict", json=_POINT)
    assert again.status_code == 200, again.text


def test_failed_handoff_keeps_previous_mask_and_rolls_back_scribble_memory(
    tmp_path: Path,
) -> None:
    sam = _ScriptedSam()
    client = _sitting_with(tmp_path, predictor=sam, scribble=FakeScribbleModel())
    _open(client)
    first = client.post("/api/session/predict", json=_POINT)
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    prior_counts = list(first.json()["tracks"][0]["mask"]["counts"])

    sam.mode = "raise"
    failed = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.8, 0.8], [0.9, 0.9]]],
            "scribble_labels": [1],
        },
    )
    assert failed.status_code == 500
    assert "SAM worker exploded" in failed.json()["detail"]

    track = _track_frame(client, tid)
    assert list(track["mask"]["counts"]) == prior_counts
    assert track["mask"]["source"] == "manual"
    assert track["geometric_memory"] == [{"x": 0.5, "y": 0.5, "positive": True}]
    assert [m["track_id"] for m in
            client.get("/api/clips/CLIPA/annotations/frames/0").json()["masks"]] == [tid]

    sam.mode = "ok"
    recovered = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.15, 0.8], [0.25, 0.8]]],
            "scribble_labels": [1],
        },
    )
    assert recovered.status_code == 200, recovered.text
    grid = decode_rle(recovered.json()["tracks"][0]["mask"])
    assert grid[51][12] == 1  # recovered stroke at (0.2, 0.8) landed
    assert grid[54][54] == 0  # failed stroke ink at (0.85, 0.85) did not survive


def test_empty_sam_after_scribble_is_not_a_commit(tmp_path: Path) -> None:
    sam = _ScriptedSam()
    client = _sitting_with(tmp_path, predictor=sam, scribble=FakeScribbleModel())
    _open(client)
    first = client.post("/api/session/predict", json=_POINT)
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    prior_counts = list(first.json()["tracks"][0]["mask"]["counts"])

    sam.mode = "empty"
    emptied = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.8, 0.8], [0.9, 0.9]]],
            "scribble_labels": [1],
        },
    )
    assert emptied.status_code == 200, emptied.text
    body = emptied.json()
    assert body["empty"] is True
    assert body["message"]
    track = _track_frame(client, tid)
    assert list(track["mask"]["counts"]) == prior_counts

    sam.mode = "ok"
    recovered = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.15, 0.8], [0.25, 0.8]]],
            "scribble_labels": [1],
        },
    )
    assert recovered.status_code == 200, recovered.text
    grid = decode_rle(recovered.json()["tracks"][0]["mask"])
    assert grid[51][12] == 1  # recovered stroke landed on the prior
    assert grid[54][54] == 0  # the emptied stroke's ink was rolled back


def test_scribble_widths_are_validated_and_forwarded_per_stroke(
    tmp_path: Path,
) -> None:
    scrib = _RecordingScribble()
    client = _sitting_with(tmp_path, scribble=scrib)
    _open(client)

    for widths in ([0], [41], [8, 8]):
        bad = client.post(
            "/api/session/predict",
            json={
                "frame_index": 0,
                "scribbles": [_STROKE],
                "scribble_labels": [1],
                "scribble_widths": widths,
            },
        )
        assert bad.status_code == 400, (widths, bad.text)
        assert "scribble_widths" in bad.json()["detail"]
    assert client.get("/api/session").json()["tracks"] == []

    stamped = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "scribbles": [_STROKE, [[0.2, 0.2], [0.3, 0.2]]],
            "scribble_labels": [1, 1],
            "scribble_widths": [24, 3],
        },
    )
    assert stamped.status_code == 200, stamped.text
    assert scrib.calls[-1]["widths"] == [24, 3]

    defaulted = client.post(
        "/api/session/predict",
        json={
            "frame_index": 1,
            "scribbles": [_STROKE],
            "scribble_labels": [1],
        },
    )
    assert defaulted.status_code == 200, defaulted.text
    assert scrib.calls[-1]["widths"] == [8]  # omitted widths mean the default 8


def _undo(client: TestClient, frame_index: int = 0) -> dict:
    response = client.post("/api/session/undo", json={"frame_index": frame_index})
    assert response.status_code == 200, response.text
    return response.json()


def _seed_two_predicts(client: TestClient) -> tuple[int, list[int], list[int]]:
    """Positive point at (0.25, 0.25), then a refine at (0.8, 0.8) on frame 0."""
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    first_counts = list(first.json()["tracks"][0]["mask"]["counts"])
    second = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "points": [[0.8, 0.8]],
            "point_labels": [1],
        },
    )
    assert second.status_code == 200, second.text
    return tid, first_counts, list(second.json()["tracks"][0]["mask"]["counts"])


def test_undo_after_predict_restores_previous_mask_pins_and_prior(
    tmp_path: Path,
) -> None:
    recorder = _RecordingGeometry()
    client = _sitting_with(tmp_path, recorder)
    _open(client)
    tid, first_counts, second_counts = _seed_two_predicts(client)
    assert second_counts != first_counts

    undone = _undo(client)
    assert undone["undone"] is True
    track = next(
        row for row in undone["session"]["tracks"] if row["track_id"] == tid
    )
    assert list(track["mask"]["counts"]) == first_counts
    assert track["mask"]["source"] == "manual"
    assert track["geometric_memory"] == [{"x": 0.25, "y": 0.25, "positive": True}]

    # Annotation on disk matches the restored Track-on-Frame; no Save ran.
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame.status_code == 200
    restored = frame.json()["masks"][0]
    assert restored["track_id"] == tid
    assert list(restored["counts"]) == first_counts
    assert restored["source"] == "manual"
    assert "geometric_memory" not in frame.text

    # The next Geometric Predict resends the restored pins on the restored Prior.
    refined = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "points": [[0.5, 0.1]],
            "point_labels": [1],
        },
    )
    assert refined.status_code == 200, refined.text
    last = recorder.geometry_calls[-1]
    assert last["points"] == [[0.25, 0.25], [0.5, 0.1]]
    assert list(last["base_mask"]["counts"]) == first_counts


def test_undo_after_leftover_delete_restores_that_pin_and_mask(
    tmp_path: Path,
) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    tid, _, prior_counts = _seed_two_predicts(client)
    dropped = client.delete(f"/api/session/tracks/{tid}/frames/0/points/0")
    assert dropped.status_code == 200, dropped.text
    track = next(
        row for row in dropped.json()["tracks"] if row["track_id"] == tid
    )
    assert track["geometric_memory"] == [{"x": 0.8, "y": 0.8, "positive": True}]

    undone = _undo(client)
    assert undone["undone"] is True
    restored = next(
        row for row in undone["session"]["tracks"] if row["track_id"] == tid
    )
    assert restored["geometric_memory"] == [
        {"x": 0.25, "y": 0.25, "positive": True},
        {"x": 0.8, "y": 0.8, "positive": True},
    ]
    assert list(restored["mask"]["counts"]) == prior_counts
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert list(frame.json()["masks"][0]["counts"]) == prior_counts


def test_undo_after_clear_mask_restores_that_cell(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    tid, _, second_counts = _seed_two_predicts(client)
    cleared = client.delete(f"/api/session/tracks/{tid}/frames/0")
    assert cleared.status_code == 200, cleared.text
    track = next(
        row for row in cleared.json()["tracks"] if row["track_id"] == tid
    )
    assert "mask" not in track
    assert track["geometric_memory"] == []
    assert client.get("/api/clips/CLIPA/annotations/frames/0").json()["masks"] == []

    undone = _undo(client)
    assert undone["undone"] is True
    restored = next(
        row for row in undone["session"]["tracks"] if row["track_id"] == tid
    )
    assert list(restored["mask"]["counts"]) == second_counts
    assert restored["mask"]["source"] == "refined"
    assert restored["geometric_memory"] == [
        {"x": 0.25, "y": 0.25, "positive": True},
        {"x": 0.8, "y": 0.8, "positive": True},
    ]
    frame = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert list(frame.json()["masks"][0]["counts"]) == second_counts


def test_empty_undo_is_200_noop_and_there_is_no_redo(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",))
    _open(client)
    before = client.get("/api/session", params={"frame_index": 0}).json()

    noop = _undo(client)
    assert noop["undone"] is False
    assert noop["session"] == before

    redo = client.post("/api/session/redo", json={"frame_index": 0})
    assert redo.status_code == 404


def test_undo_is_scoped_to_the_requested_frame(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    tid, first_counts, second_counts = _seed_two_predicts(client)
    other = client.post(
        "/api/session/predict",
        json={
            "frame_index": 1,
            "track_id": tid,
            "points": [[0.5, 0.5]],
            "point_labels": [1],
        },
    )
    assert other.status_code == 200, other.text
    other_counts = list(other.json()["tracks"][0]["mask"]["counts"])

    # Undo targets this Frame's last committed edit, not the Session-wide one.
    undone = _undo(client, frame_index=1)
    assert undone["undone"] is True
    row = next(
        t for t in undone["session"]["tracks"] if t["track_id"] == tid
    )
    assert "mask" not in row
    assert list(_track_frame(client, tid)["mask"]["counts"]) == second_counts

    # The frame-0 stack is untouched: Undo there rolls the refine back first.
    undone_zero = _undo(client, frame_index=0)
    assert undone_zero["undone"] is True
    assert list(_track_frame(client, tid)["mask"]["counts"]) == first_counts

    # Then the creating Predict, which removes the maskless Track with it.
    undone_create = _undo(client, frame_index=0)
    assert undone_create["undone"] is True
    assert undone_create["session"]["tracks"] == []

    # Nothing left on this Frame: the next Undo on frame 0 is a no-op.
    again = _undo(client, frame_index=0)
    assert again["undone"] is False
    assert client.get("/api/clips/CLIPA/annotations").json()["tracks"] == []


def test_undo_of_creating_predict_keeps_track_with_masks_on_other_frames(
    tmp_path: Path,
) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    other = client.post(
        "/api/session/predict",
        json={
            "frame_index": 1,
            "track_id": tid,
            "points": [[0.5, 0.5]],
            "point_labels": [1],
        },
    )
    assert other.status_code == 200, other.text
    other_counts = list(other.json()["tracks"][0]["mask"]["counts"])

    undone = _undo(client, frame_index=0)
    assert undone["undone"] is True
    tracks = undone["session"]["tracks"]
    assert [t["track_id"] for t in tracks] == [tid]
    assert "mask" not in tracks[0]
    # The Track survives: it still holds its mask on frame 1.
    assert list(_track_frame(client, tid, frame_index=1)["mask"]["counts"]) == (
        other_counts
    )


def test_undo_after_scribble_carve_restores_the_prior_silhouette(
    tmp_path: Path,
) -> None:
    scrib = _RecordingMemoryScribble()
    client = _sitting_with(tmp_path, scribble=scrib)
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "scribbles": [[[0.2, 0.4], [0.4, 0.4]]],
            "scribble_labels": [1],
        },
    )
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    prior_counts = list(first.json()["tracks"][0]["mask"]["counts"])

    carved = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "scribbles": [[[0.25, 0.45], [0.32, 0.45]]],
            "scribble_labels": [0],
        },
    )
    assert carved.status_code == 200, carved.text
    assert list(carved.json()["tracks"][0]["mask"]["counts"]) != prior_counts

    undone = _undo(client)
    assert undone["undone"] is True
    track = next(
        row for row in undone["session"]["tracks"] if row["track_id"] == tid
    )
    assert list(track["mask"]["counts"]) == prior_counts

    # Undo reloaded the pre-edit silhouette into Scribble mask-memory, not
    # just the Track mask; the last load is the undo's restore.
    restored = scrib.loads[-1]
    assert restored["track_id"] == tid
    assert restored["frame_index"] == 0
    assert list(restored["counts"]) == prior_counts


def test_undo_of_refine_restores_the_concept_score(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    concept = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "text": "grasper"},
    )
    assert concept.status_code == 200, concept.text
    tid = concept.json()["tracks"][0]["track_id"]
    score = concept.json()["tracks"][0]["score"]
    assert score is not None

    refined = client.post(
        "/api/session/predict",
        json={
            "frame_index": 0,
            "track_id": tid,
            "points": [[0.8, 0.8]],
            "point_labels": [1],
        },
    )
    assert refined.status_code == 200, refined.text
    assert refined.json()["tracks"][0]["score"] is None

    undone = _undo(client)
    assert undone["undone"] is True
    track = next(
        row for row in undone["session"]["tracks"] if row["track_id"] == tid
    )
    assert track["score"] == score


def test_undo_conflicts_while_propagate_job_runs(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    seeded = client.post("/api/session/predict", json=_POINT)
    assert seeded.status_code == 200, seeded.text
    job = _start_propagate(client)
    assert job["status"] == "queued"

    refused = client.post("/api/session/undo", json={"frame_index": 0})
    assert refused.status_code == 409, refused.text
    assert "Propagate Job is running" in refused.json()["detail"]


def test_undo_on_out_of_range_frame_is_404(tmp_path: Path) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    response = client.post("/api/session/undo", json={"frame_index": 99})
    assert response.status_code == 404, response.text
    assert "out of range" in response.json()["detail"]


def test_track_label_patch_persists_annotation_immediately(
    tmp_path: Path,
) -> None:
    client = _sitting_with(tmp_path)
    _open(client)
    tid, _, _ = _seed_two_predicts(client)

    renamed = client.patch(
        f"/api/session/tracks/{tid}", json={"label": "grasper tip"}
    )
    assert renamed.status_code == 200, renamed.text

    summary = client.get("/api/clips/CLIPA/annotations")
    assert summary.status_code == 200
    labels = {t["track_id"]: t["label"] for t in summary.json()["tracks"]}
    assert labels[tid] == "grasper tip"


def _start_propagate(client: TestClient, **overrides) -> dict:
    body = {"direction": "forward", "start_frame_index": 0, **overrides}
    started = client.post("/api/session/propagate", json=body)
    assert started.status_code == 202, started.text
    return started.json()


def _poll_job(client: TestClient, job_id: str, max_polls: int = 50) -> dict:
    """Poll until terminal; the Job fills one Frame per status poll."""
    job: dict | None = None
    for _ in range(max_polls):
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200, response.text
        job = response.json()
        if job["status"] in ("completed", "failed"):
            assert job["status"] == "completed", job
            return job
    raise AssertionError("Propagate Job never completed")


def _mask_on(client: TestClient, track_id: int, frame_index: int) -> dict:
    session = client.get("/api/session", params={"frame_index": frame_index}).json()
    track = next(row for row in session["tracks"] if row["track_id"] == track_id)
    return track.get("mask") or {}


def test_propagate_without_seed_on_start_frame_is_400(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=3)
    _open(client)
    refused = client.post(
        "/api/session/propagate",
        json={"direction": "forward", "start_frame_index": 0},
    )
    assert refused.status_code == 400
    assert "seed" in refused.json()["detail"].lower()

    # A mask on frame 0 does not seed a Job that starts on frame 1.
    seeded = client.post("/api/session/predict", json=_POINT)
    assert seeded.status_code == 200, seeded.text
    elsewhere = client.post(
        "/api/session/propagate",
        json={"direction": "forward", "start_frame_index": 1},
    )
    assert elsewhere.status_code == 400

    bad_direction = client.post(
        "/api/session/propagate",
        json={"direction": "sideways", "start_frame_index": 0},
    )
    assert bad_direction.status_code == 400
    assert "direction" in bad_direction.json()["detail"].lower()


def test_forward_propagate_fills_neighbors_seed_stays_manual(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=5)
    _open(client)
    seeded = client.post(
        "/api/session/predict",
        json={"frame_index": 1, "points": [[0.5, 0.5]], "point_labels": [1]},
    )
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]
    seed_counts = list(seeded.json()["tracks"][0]["mask"]["counts"])

    job = _start_propagate(client, start_frame_index=1)
    assert job["direction"] == "forward"
    assert job["start_frame_index"] == 1
    assert job["max_frames"] is None
    assert job["frames_total"] == 3

    # One Frame lands per poll, so the desk can watch progress.
    first = client.get(f"/api/jobs/{job['job_id']}").json()
    assert first["status"] == "running"
    assert first["frames_done"] == 1

    done = _poll_job(client, job["job_id"])
    assert done["frames_done"] == done["frames_total"] == 3

    for frame_index in (2, 3, 4):
        mask = _mask_on(client, tid, frame_index)
        assert mask["source"] == "propagated"
    seed_mask = _mask_on(client, tid, 1)
    assert seed_mask["source"] == "manual"
    assert list(seed_mask["counts"]) == seed_counts

    # Completed Job wrote Annotation immediately; no Save ran.
    disk = client.get("/api/clips/CLIPA/annotations/frames/4")
    assert disk.status_code == 200, disk.text
    assert disk.json()["masks"][0]["source"] == "propagated"


def test_backward_and_max_frames_limit_the_fill(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=6)
    _open(client)
    seeded = client.post(
        "/api/session/predict",
        json={"frame_index": 2, "points": [[0.5, 0.5]], "point_labels": [1]},
    )
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]

    short = _start_propagate(
        client, direction="backward", start_frame_index=2, max_frames=1
    )
    assert short["max_frames"] == 1
    assert short["frames_total"] == 1
    _poll_job(client, short["job_id"])
    assert _mask_on(client, tid, 1)["source"] == "propagated"
    assert _mask_on(client, tid, 0) == {}
    assert _mask_on(client, tid, 3) == {}

    both = _start_propagate(client, direction="both", start_frame_index=2)
    assert both["frames_total"] == 5  # 3 forward + 2 backward, seed excluded
    _poll_job(client, both["job_id"])
    for frame_index in (0, 1, 3, 4, 5):
        assert _mask_on(client, tid, frame_index)["source"] == "propagated"


def test_repropagate_replaces_only_unprotected_slots(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=5)
    _open(client)
    seeded = client.post("/api/session/predict", json=_POINT)
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]

    first_job = _start_propagate(client)
    _poll_job(client, first_job["job_id"])
    first_fills = {
        fi: list(_mask_on(client, tid, fi)["counts"]) for fi in (1, 2, 3, 4)
    }

    # A human refine on frame 2 makes that slot Protected; a seed refine on
    # frame 0 changes what the next Job fills from.
    protected = client.post(
        "/api/session/predict",
        json={
            "frame_index": 2,
            "track_id": tid,
            "points": [[0.85, 0.15], [0.15, 0.85]],
            "point_labels": [1, 1],
        },
    )
    assert protected.status_code == 200, protected.text
    assert protected.json()["tracks"][0]["mask"]["source"] == "refined"
    protected_counts = list(protected.json()["tracks"][0]["mask"]["counts"])

    reseed = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "track_id": tid, "points": [[0.15, 0.85]], "point_labels": [1]},
    )
    assert reseed.status_code == 200, reseed.text

    second_job = _start_propagate(client)
    _poll_job(client, second_job["job_id"])

    kept = _mask_on(client, tid, 2)
    assert kept["source"] == "refined"
    assert list(kept["counts"]) == protected_counts
    for frame_index in (1, 3, 4):
        replaced = _mask_on(client, tid, frame_index)
        assert replaced["source"] == "propagated"
        assert list(replaced["counts"]) != first_fills[frame_index]

    disk = client.get("/api/clips/CLIPA/annotations/frames/2")
    assert list(disk.json()["masks"][0]["counts"]) == protected_counts


def test_mask_edits_conflict_while_job_runs_scrub_and_get_ok(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=5)
    _open(client)
    first = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "points": [[0.25, 0.25]], "point_labels": [1]},
    )
    assert first.status_code == 200, first.text
    tid = first.json()["tracks"][0]["track_id"]
    second = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "track_id": tid, "points": [[0.8, 0.8]], "point_labels": [1]},
    )
    assert second.status_code == 200, second.text

    job = _start_propagate(client, direction="both")
    assert job["frames_total"] == 4
    running = client.get(f"/api/jobs/{job['job_id']}").json()
    assert running["status"] == "running"

    conflicts = [
        ("predict", lambda: client.post(
            "/api/session/predict",
            json={"frame_index": 0, "track_id": tid, "points": [[0.5, 0.1]], "point_labels": [1]},
        )),
        ("pin delete", lambda: client.delete(f"/api/session/tracks/{tid}/frames/0/points/0")),
        ("clear mask", lambda: client.delete(f"/api/session/tracks/{tid}/frames/0")),
        ("undo", lambda: client.post("/api/session/undo", json={"frame_index": 0})),
        ("reset", lambda: client.post("/api/session/reset")),
        ("track label", lambda: client.patch(f"/api/session/tracks/{tid}", json={"label": "x"})),
        ("track delete", lambda: client.delete(f"/api/session/tracks/{tid}")),
        ("second propagate", lambda: client.post(
            "/api/session/propagate",
            json={"direction": "forward", "start_frame_index": 0},
        )),
    ]
    for name, call in conflicts:
        response = call()
        assert response.status_code == 409, (name, response.text)

    # Scrub and reads stay allowed while the Job runs.
    assert client.get("/api/session", params={"frame_index": 2}).status_code == 200
    assert client.get("/api/clips/CLIPA/annotations/frames/1").status_code == 200

    _poll_job(client, job["job_id"])
    edit_again = client.post(
        "/api/session/predict",
        json={"frame_index": 0, "track_id": tid, "points": [[0.5, 0.1]], "point_labels": [1]},
    )
    assert edit_again.status_code == 200, edit_again.text


def test_completed_propagate_merges_and_protected_disk_slots_survive(
    tmp_path: Path,
) -> None:
    settings = _settings_for(tmp_path, ("CLIPA",), frames=4)
    client = authed_client(settings)
    _open(client)
    seeded = client.post("/api/session/predict", json=_POINT)
    assert seeded.status_code == 200, seeded.text
    tid = seeded.json()["tracks"][0]["track_id"]
    seed_counts = list(seeded.json()["tracks"][0]["mask"]["counts"])

    # Prior human work on frame 2 that this Session (never hydrated) does
    # not hold: a refined silhouette one pixel smaller than the seed.
    doc = annotations.load(settings, "CLIPA")
    stem = annotations.frame_stem_for_index(settings, "CLIPA", 2)
    grid = decode_rle(seeded.json()["tracks"][0]["mask"])
    grid[32][32] = 0
    protected_counts = encode_rle(grid)["counts"]
    assert protected_counts != seed_counts
    doc["frames"][stem] = {
        "frame_stem": stem,
        "frame_index": 2,
        "masks": [
            {
                "track_id": tid,
                "format": "rle_fg",
                "size": list(seeded.json()["tracks"][0]["mask"]["size"]),
                "counts": protected_counts,
                "source": "refined",
            }
        ],
    }
    annotations.save_doc(settings, "CLIPA", doc)

    job = _start_propagate(client)
    _poll_job(client, job["job_id"])

    kept = client.get("/api/clips/CLIPA/annotations/frames/2")
    assert kept.status_code == 200
    slot = kept.json()["masks"][0]
    assert slot["source"] == "refined"
    assert list(slot["counts"]) == protected_counts

    for frame_index in (1, 3):
        disk = client.get(f"/api/clips/CLIPA/annotations/frames/{frame_index}")
        assert disk.status_code == 200, disk.text
        assert disk.json()["masks"][0]["source"] == "propagated"

    frame0 = client.get("/api/clips/CLIPA/annotations/frames/0")
    assert frame0.json()["masks"][0]["source"] == "manual"


def test_propagate_leaves_phase_class_triplet_untouched(tmp_path: Path) -> None:
    client = _sitting(tmp_path, ("CLIPA",), frames=4)
    assert client.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    assert client.post("/api/vocab/class_tags", json={"name": "blurred"}).status_code == 200
    assert client.post(
        "/api/vocab/triples",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    assert client.post(
        "/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 3}
    ).status_code == 200
    assert client.put("/api/class/CLIPA/frames/2", json={"tags": ["blurred"]}).status_code == 200
    assert client.post(
        "/api/triplet/CLIPA/frames/3",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    phase_before = client.get("/api/phase/CLIPA").json()
    class_before = client.get("/api/class/CLIPA").json()
    triplet_before = client.get("/api/triplet/CLIPA").json()

    _open(client)
    assert client.post("/api/session/predict", json=_POINT).status_code == 200
    job = _start_propagate(client)
    _poll_job(client, job["job_id"])

    assert client.get("/api/phase/CLIPA").json() == phase_before
    assert client.get("/api/class/CLIPA").json() == class_before
    assert client.get("/api/triplet/CLIPA").json() == triplet_before
