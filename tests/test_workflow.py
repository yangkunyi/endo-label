"""Compose seam: review state machine transitions and balanced auto-assignment."""

from __future__ import annotations

import threading
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from tests.sitting_http import ensure_members, ensure_registered, login, seed_admin


def _settings(tmp_path: Path, clip_ids: tuple[str, ...] = ("CLIPA", "CLIPB")) -> Settings:
    frames = tmp_path / "frames"
    for clip_id in clip_ids:
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=clip_ids,
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
    )


def _shared(
    tmp_path: Path, clip_ids: tuple[str, ...] = ("CLIPA", "CLIPB")
) -> tuple[Settings, object]:
    settings = _settings(tmp_path, clip_ids)
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "bob", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)
    ensure_members(settings, "alice", "bob", "carol")
    return settings, create_app(settings)


def _logins(app) -> tuple[TestClient, TestClient, TestClient, TestClient]:
    admin, alice, bob, carol = (TestClient(app) for _ in range(4))
    login(admin)
    login(alice, "alice", "pw")
    login(bob, "bob", "pw")
    login(carol, "carol", "pw")
    return admin, alice, bob, carol


def _item(client: TestClient, clip_id: str, task_type: str = "phase") -> dict:
    for item in client.get("/api/items").json()["items"]:
        if item["clip_id"] == clip_id and item["task_type"] == task_type:
            return item
    raise AssertionError(f"no item {clip_id}/{task_type}")


def test_submit_moves_labeling_to_submitted_and_illegal_transitions_are_refused(
    tmp_path: Path,
) -> None:
    _settings_obj, app = _shared(tmp_path)
    admin, alice, bob, carol = _logins(app)

    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200

    # Labeling -> Done directly is refused (pass needs Reviewing).
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 409
    # A reviewer cannot be assigned before the item is submitted.
    assert (
        admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code
        == 409
    )
    # Recall only exists from Submitted.
    assert alice.post("/api/items/CLIPA/phase/recall").status_code == 409
    # Only the assignee (or an admin) may submit or recall; reviewers cannot.
    assert bob.post("/api/items/CLIPA/phase/submit").status_code == 403
    assert carol.post("/api/items/CLIPA/phase/submit").status_code == 403
    # Reviewer assignment is admin-only.
    assert bob.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "bob"}).status_code == 403

    submitted = alice.post("/api/items/CLIPA/phase/submit")
    assert submitted.status_code == 200, submitted.text
    item = submitted.json()
    assert item["state"] == "Submitted"
    assert item["note"] is None
    assert item["reviewed_by"] is None
    assert item["reviewed_at"] is None

    # Submitting twice is refused; the stored state stays Submitted.
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 409
    assert _item(admin, "CLIPA")["state"] == "Submitted"


def test_reviewer_assignment_pass_reject_recall_and_rereview_record_fields(
    tmp_path: Path,
) -> None:
    _settings_obj, app = _shared(tmp_path)
    admin, alice, _bob, carol = _logins(app)
    assert admin.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200
    assert alice.put("/api/phase/CLIPA/frames/0", json={"phase": "Preparation"}).status_code == 200

    submitted = alice.post("/api/items/CLIPA/phase/submit")
    assert submitted.status_code == 200, submitted.text
    # The annotator is locked out once submitted.
    assert alice.put("/api/phase/CLIPA/frames/1", json={"phase": "Preparation"}).status_code == 403

    # reviewer == annotator is refused; the item stays Submitted.
    same = admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "alice"})
    assert same.status_code == 409, same.text
    assert _item(admin, "CLIPA")["state"] == "Submitted"

    reviewing = admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"})
    assert reviewing.status_code == 200, reviewing.text
    assert reviewing.json()["state"] == "Reviewing"
    assert reviewing.json()["reviewer"] == "carol"

    # During Review the assigned reviewer may edit; the annotator still may not.
    assert carol.put("/api/phase/CLIPA/frames/1", json={"phase": "Preparation"}).status_code == 200
    assert alice.put("/api/phase/CLIPA/frames/1", json={"phase": "Preparation"}).status_code == 403
    # Only the assigned reviewer (or an admin) may pass.
    assert alice.post("/api/items/CLIPA/phase/pass").status_code == 403
    assert _bob.post("/api/items/CLIPA/phase/pass").status_code == 403

    passed = carol.post("/api/items/CLIPA/phase/pass")
    assert passed.status_code == 200, passed.text
    done = passed.json()
    assert done["state"] == "Done"
    assert done["reviewed_by"] == "carol"
    assert done["reviewed_at"]
    # Done is terminal: annotator writes and recall are refused, a second pass too.
    assert alice.put("/api/phase/CLIPA/frames/0", json={"phase": "Preparation"}).status_code == 403
    assert alice.post("/api/items/CLIPA/phase/recall").status_code == 409
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 409

    # re-review: Done -> Submitted, unreviewed again.
    reopened = admin.post("/api/items/CLIPA/phase/re-review")
    assert reopened.status_code == 200, reopened.text
    item = reopened.json()
    assert item["state"] == "Submitted"
    assert item["reviewer"] is None
    assert item["reviewed_by"] is None
    assert item["reviewed_at"] is None

    # reject from Reviewing: back to Labeling with the note, assignee writable again.
    assert admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    rejected = carol.post("/api/items/CLIPA/phase/reject", json={"note": "fix frame 3"})
    assert rejected.status_code == 200, rejected.text
    item = rejected.json()
    assert item["state"] == "Labeling"
    assert item["note"] == "fix frame 3"
    assert item["reviewer"] is None
    assert item["reviewed_by"] is None
    assert item["reviewed_at"] is None
    assert alice.put("/api/phase/CLIPA/frames/0", json={"phase": "Preparation"}).status_code == 200

    # A reject needs a note; the item stays Reviewing.
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    assert carol.post("/api/items/CLIPA/phase/reject", json={"note": "  "}).status_code == 400
    assert _item(admin, "CLIPA")["state"] == "Reviewing"

    # Submitting again clears the stale reject note.
    assert carol.post("/api/items/CLIPA/phase/reject", json={"note": "again"}).status_code == 200
    assert _item(admin, "CLIPA")["note"] == "again"
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert _item(admin, "CLIPA")["note"] is None

    # recall: Submitted -> Labeling by the assignee.
    recalled = alice.post("/api/items/CLIPA/phase/recall")
    assert recalled.status_code == 200, recalled.text
    assert recalled.json()["state"] == "Labeling"

    # reject from Done reopens it with the note and no reviewed_by.
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 200
    reopened = carol.post("/api/items/CLIPA/phase/reject", json={"note": "more work"})
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["state"] == "Labeling"
    assert reopened.json()["note"] == "more work"
    assert reopened.json()["reviewed_by"] is None


def _race(clients: list[TestClient], path: str) -> list[int]:
    """Fire one POST per client after a common start; collect status codes in order."""
    barrier = threading.Barrier(len(clients))
    results: list[int | None] = [None] * len(clients)
    errors: list[BaseException] = []

    def run(index: int, client: TestClient) -> None:
        try:
            barrier.wait(timeout=10)
            results[index] = client.post(path).status_code
        except BaseException as exc:  # noqa: BLE001 — collected for the assertion
            errors.append(exc)

    threads = [
        threading.Thread(target=run, args=(index, client))
        for index, client in enumerate(clients)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    return [int(code) for code in results]


def test_two_clients_racing_the_same_transition_leave_one_winner(tmp_path: Path) -> None:
    _settings_obj, app = _shared(tmp_path)
    admin = TestClient(app)
    login(admin)
    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200

    alice_clients = [TestClient(app), TestClient(app)]
    for client in alice_clients:
        login(client, "alice", "pw")

    submit_codes = _race(alice_clients, "/api/items/CLIPA/phase/submit")
    assert sorted(submit_codes) == [200, 409]
    assert _item(admin, "CLIPA")["state"] == "Submitted"
    # The winning submit applied exactly once: a fresh submit is refused.
    assert alice_clients[0].post("/api/items/CLIPA/phase/submit").status_code == 409
    # recall is the single reverse step, so the state was never double-applied.
    assert alice_clients[0].post("/api/items/CLIPA/phase/recall").status_code == 200
    assert _item(admin, "CLIPA")["state"] == "Labeling"

    # Same race on the review transition: one pass wins, the loser is refused.
    assert alice_clients[0].post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    carol_clients = [TestClient(app), TestClient(app)]
    for client in carol_clients:
        login(client, "carol", "pw")

    pass_codes = _race(carol_clients, "/api/items/CLIPA/phase/pass")
    assert sorted(pass_codes) == [200, 409]
    done = _item(admin, "CLIPA")
    assert done["state"] == "Done"
    assert done["reviewed_by"] == "carol"
    assert done["reviewed_at"]


def test_auto_assign_balances_holders_and_filters_by_task_type_and_selection(
    tmp_path: Path,
) -> None:
    _settings_obj, app = _shared(tmp_path, clip_ids=("CLIPA", "CLIPB", "CLIPC", "CLIPD"))
    admin, alice, bob, _carol = _logins(app)

    # alice starts holding two items (phase + class on CLIPA).
    for task_type in ("phase", "class"):
        assigned = admin.post(
            f"/api/items/CLIPA/{task_type}/assign", json={"assignee": "alice"}
        )
        assert assigned.status_code == 200, assigned.text

    # Task-type filter: only CLIPB/C/D phase items are candidates.
    phase_only = admin.post(
        "/api/items/auto-assign",
        json={"assignees": ["alice", "bob"], "task_type": "phase"},
    )
    assert phase_only.status_code == 200, phase_only.text
    body = phase_only.json()
    assert body["counts"] == {"alice": 3, "bob": 2}
    assert {row["clip_id"] for row in body["assigned"]} == {"CLIPB", "CLIPC", "CLIPD"}
    assert {row["task_type"] for row in body["assigned"]} == {"phase"}
    assert _item(admin, "CLIPA", "triplet")["state"] == "Unassigned"

    # Explicit board multi-select: only the Unassigned picks move.
    picked = admin.post(
        "/api/items/auto-assign",
        json={
            "assignees": ["alice", "bob"],
            "items": [
                {"clip_id": "CLIPA", "task_type": "mask"},
                {"clip_id": "CLIPA", "task_type": "phase"},  # already Labeling
            ],
        },
    )
    assert picked.status_code == 200, picked.text
    body = picked.json()
    assert body["counts"] == {"alice": 3, "bob": 3}
    assert body["assigned"] == [
        {"clip_id": "CLIPA", "task_type": "mask", "assignee": "bob"}
    ]
    assert _item(admin, "CLIPA", "phase")["assignee"] == "alice"

    # Board multi-select by Clip: only CLIPA's remaining Unassigned items move.
    selected = admin.post(
        "/api/items/auto-assign",
        json={"assignees": ["alice", "bob"], "clip_ids": ["CLIPA"]},
    )
    assert selected.status_code == 200, selected.text
    body = selected.json()
    assert body["counts"] == {"alice": 4, "bob": 3}
    assert {row["clip_id"] for row in body["assigned"]} == {"CLIPA"}
    for row in body["assigned"]:
        item = _item(admin, row["clip_id"], row["task_type"])
        assert item["state"] == "Labeling"
        assert item["assignee"] == row["assignee"]
    # The pre-existing Labeling Assignment keeps its owner and state.
    kept = _item(admin, "CLIPA", "phase")
    assert kept["state"] == "Labeling"
    assert kept["assignee"] == "alice"

    # Nothing is left to assign, so nothing is reassigned.
    again = admin.post(
        "/api/items/auto-assign",
        json={"assignees": ["alice", "bob"], "clip_ids": ["CLIPA"]},
    )
    assert again.status_code == 200, again.text
    assert again.json()["assigned"] == []
