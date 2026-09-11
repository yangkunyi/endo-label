"""Compose seam: the reviewer's queue and the pass / reject transitions."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from tests.sitting_http import ensure_registered, login, seed_admin

_PHASE = "Preparation"


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    for clip_id in ("CLIPA", "CLIPB"):
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA", "CLIPB"),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
    )


def _clients(tmp_path: Path) -> tuple[TestClient, TestClient, TestClient, TestClient]:
    """admin plus alice (annotator), carol (reviewer), dave (annotator + reviewer)."""
    settings = _settings(tmp_path)
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)
    create_account(path, "dave", "pw", annotator=True, reviewer=True)
    app = create_app(settings)
    admin, alice, carol, dave = (TestClient(app) for _ in range(4))
    login(admin)
    login(alice, "alice", "pw")
    login(carol, "carol", "pw")
    login(dave, "dave", "pw")
    return admin, alice, carol, dave


def _item(client: TestClient, clip_id: str, task_type: str) -> dict:
    for item in client.get("/api/items").json()["items"]:
        if item["clip_id"] == clip_id and item["task_type"] == task_type:
            return item
    raise AssertionError(f"no item {clip_id}/{task_type}")


def _my_item(client: TestClient, clip_id: str, task_type: str) -> dict:
    for item in client.get("/api/me/items").json()["items"]:
        if item["clip_id"] == clip_id and item["task_type"] == task_type:
            return item
    raise AssertionError(f"no own item {clip_id}/{task_type}")


def _submit(admin: TestClient, annotator: TestClient, clip_id: str, task_type: str) -> None:
    assigned = admin.post(
        f"/api/items/{clip_id}/{task_type}/assign", json={"assignee": "alice"}
    )
    assert assigned.status_code == 200, assigned.text
    submitted = annotator.post(f"/api/items/{clip_id}/{task_type}/submit")
    assert submitted.status_code == 200, submitted.text


def _to_reviewing(
    admin: TestClient, annotator: TestClient, clip_id: str, task_type: str
) -> None:
    _submit(admin, annotator, clip_id, task_type)
    reviewing = admin.post(
        f"/api/items/{clip_id}/{task_type}/reviewer", json={"reviewer": "carol"}
    )
    assert reviewing.status_code == 200, reviewing.text


def test_pass_records_done_and_reject_returns_the_item_with_its_note(tmp_path: Path) -> None:
    admin, alice, carol, _dave = _clients(tmp_path)
    assert admin.post("/api/vocab/phases", json={"name": _PHASE}).status_code == 200
    _to_reviewing(admin, alice, "CLIPA", "phase")

    # The reviewer's queue is their own items list, with the review buttons on.
    queued = _my_item(carol, "CLIPA", "phase")
    assert queued["state"] == "Reviewing"
    assert queued["capabilities"]["pass"] is True
    assert queued["capabilities"]["reject"] is True
    assert queued["capabilities"]["edit_labels"] is True

    passed = carol.post("/api/items/CLIPA/phase/pass")
    assert passed.status_code == 200, passed.text
    done = passed.json()
    assert done["state"] == "Done"
    assert done["reviewed_by"] == "carol"
    assert done["reviewed_at"]
    assert _item(admin, "CLIPA", "phase")["state"] == "Done"
    assert _my_item(alice, "CLIPA", "phase")["state"] == "Done"

    # A once-passed item stays in the reviewer's list so a re-review can reopen it.
    done_queue = _my_item(carol, "CLIPA", "phase")
    assert done_queue["capabilities"]["re_review"] is True

    # Reject from Done writes one note, clears the review fields, and unlocks the assignee.
    rejected = carol.post("/api/items/CLIPA/phase/reject", json={"note": "fix frame 3"})
    assert rejected.status_code == 200, rejected.text
    back = rejected.json()
    assert back["state"] == "Labeling"
    assert back["note"] == "fix frame 3"
    assert back["reviewer"] is None
    assert back["reviewed_by"] is None
    assert back["reviewed_at"] is None
    assert alice.put(
        "/api/phase/CLIPA/frames/1", json={"phase": _PHASE}
    ).status_code == 200
    # The note is the assignee's banner, and the item left the reviewer's queue.
    mine = _my_item(alice, "CLIPA", "phase")
    assert mine["note"] == "fix frame 3"
    assert mine["capabilities"]["submit"] is True
    assert all(row["clip_id"] != "CLIPA" for row in carol.get("/api/me/items").json()["items"])

    # A blank note is refused; the item stays put.
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post(
        "/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}
    ).status_code == 200
    assert carol.post("/api/items/CLIPA/phase/reject", json={"note": "  "}).status_code == 400
    assert _item(admin, "CLIPA", "phase")["state"] == "Reviewing"


def test_reviewer_differs_from_annotator_and_done_locks_the_annotator_out(
    tmp_path: Path,
) -> None:
    admin, alice, carol, dave = _clients(tmp_path)
    assert admin.post("/api/vocab/phases", json={"name": _PHASE}).status_code == 200
    assert admin.post("/api/vocab/class_tags", json={"name": "blurred"}).status_code == 200
    assert admin.post(
        "/api/vocab/triples",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200

    # The item's annotator cannot be its reviewer, even holding the reviewer role.
    _submit(admin, alice, "CLIPA", "phase")
    asked = admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "alice"})
    assert asked.status_code == 409, asked.text
    assert _item(admin, "CLIPA", "phase")["state"] == "Submitted"
    # dave holds both roles but is not this item's reviewer: no pass button for him.
    assert dave.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]["capabilities"]["pass"] is False

    # The same rule bites when the annotator is the annotator/reviewer Account.
    dave_phase = admin.post("/api/items/CLIPB/phase/assign", json={"assignee": "dave"})
    assert dave_phase.status_code == 200, dave_phase.text
    assert dave.post("/api/items/CLIPB/phase/submit").status_code == 200
    self_review = admin.post("/api/items/CLIPB/phase/reviewer", json={"reviewer": "dave"})
    assert self_review.status_code == 409, self_review.text

    # A different Account takes CLIPA/phase to Done; the annotator is then refused.
    assert admin.post(
        "/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}
    ).status_code == 200
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 200

    # class and triplet go the same way: the reviewer writes, passes, the annotator locks.
    _to_reviewing(admin, alice, "CLIPA", "class")
    assert carol.put(
        "/api/class/CLIPA/frames/0", json={"tags": ["blurred"]}
    ).status_code == 200
    assert carol.post("/api/items/CLIPA/class/pass").status_code == 200
    _to_reviewing(admin, alice, "CLIPA", "triplet")
    assert carol.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 200
    assert carol.post("/api/items/CLIPA/triplet/pass").status_code == 200

    for clip_id, task_type in (("CLIPA", "phase"), ("CLIPA", "class"), ("CLIPA", "triplet")):
        assert _item(admin, clip_id, task_type)["state"] == "Done"
        assert _my_item(alice, clip_id, task_type)["capabilities"]["edit_labels"] is False

    assert alice.put(
        "/api/phase/CLIPA/frames/1", json={"phase": _PHASE}
    ).status_code == 403
    assert alice.put(
        "/api/class/CLIPA/frames/1", json={"tags": ["blurred"]}
    ).status_code == 403
    assert alice.post(
        "/api/triplet/CLIPA/frames/1",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    ).status_code == 403

    # mask is a label kind too: its reviewer writes during Review, the Done locks the annotator.
    _to_reviewing(admin, alice, "CLIPA", "mask")
    point = {"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [1]}
    assert carol.post(
        "/api/session/predict", json={**point, "clip_id": "CLIPA"}
    ).status_code == 200
    assert alice.post(
        "/api/session/predict", json={**point, "clip_id": "CLIPA"}
    ).status_code == 403
    assert carol.post("/api/items/CLIPA/mask/pass").status_code == 200
    assert alice.post(
        "/api/session/predict", json={**point, "clip_id": "CLIPA"}
    ).status_code == 403


def test_reviewer_writes_take_the_annotator_s_versioned_save_path(tmp_path: Path) -> None:
    admin, alice, carol, _dave = _clients(tmp_path)
    assert admin.post("/api/vocab/phases", json={"name": _PHASE}).status_code == 200
    assert admin.post("/api/vocab/class_tags", json={"name": "blurred"}).status_code == 200

    # The annotator's own save bumps the Clip version and echoes it back.
    assigned = admin.post("/api/items/CLIPA/class/assign", json={"assignee": "alice"})
    assert assigned.status_code == 200, assigned.text
    first = alice.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    assert first.status_code == 200, first.text
    version = first.json()["version"]
    assert version == alice.get("/api/class/CLIPA").json()["version"]

    assert alice.post("/api/items/CLIPA/class/submit").status_code == 200
    assert admin.post(
        "/api/items/CLIPA/class/reviewer", json={"reviewer": "carol"}
    ).status_code == 200

    # The reviewer holds the version it read and gets the same 409 on a stale retry.
    held = carol.get("/api/class/CLIPA").json()["version"]
    stale = carol.put(
        "/api/class/CLIPA/frames/1",
        json={"tags": ["blurred"], "version": held - 1},
    )
    assert stale.status_code == 409, stale.text
    fresh = carol.put(
        "/api/class/CLIPA/frames/1",
        json={"tags": ["blurred"], "version": held},
    )
    assert fresh.status_code == 200, fresh.text
    assert fresh.json()["version"] == held + 1

    # The reviewer's label lands on the same store the annotator reads back.
    frames = alice.get("/api/class/CLIPA").json()["frames"]
    assert frames["0"] == ["blurred"]
    assert frames["1"] == ["blurred"]

    # Span writes take the same path for the reviewer as they do for the annotator.
    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200
    assert alice.post(
        "/api/phase/CLIPA/span",
        json={"phase": _PHASE, "from": 0, "to": 1, "version": alice.get("/api/phase/CLIPA").json()["version"]},
    ).status_code == 200
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post(
        "/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}
    ).status_code == 200
    version = carol.get("/api/phase/CLIPA").json()["version"]
    span = carol.post(
        "/api/phase/CLIPA/span",
        json={"phase": _PHASE, "from": 0, "to": 1, "version": version},
    )
    assert span.status_code == 200, span.text
    assert span.json()["version"] == version + 1
    assert span.json()["frames"] == {"0": _PHASE, "1": _PHASE}
