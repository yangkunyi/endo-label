"""Compose seam: a refused write explains itself (ticket pilot-ux/04).

The gate is ownership, not a role — the admin is not a special writer — and 04
changed only the message: the 403's `detail` is the sentence the desk renders in
its notice line. That wording is product text now, so every Assignment state's
refusal is pinned here rather than left for the pilot to discover, along with the
transition refusals that name who may make the call.

The shape the desk reads is the state machine's own: a write is refused because
the Clip's item is assigned to someone else, is in Review, is frozen once
Submitted or Done, or is not assigned at all. The states that name a holder are
asserted by name (`alice`, `carol`) — the holder is the whole point of the
sentence, and a refusal that reads "not assigned to anyone" about an item alice
is holding is exactly the bug this wording exists to end.

Four arms of `coordination._write_refusal` are not states of the machine: the row
is missing, a Labeling row nobody holds, a Reviewing row with no reviewer, and
"yours, but it is not in a writable state". The first three are pinned against a
hand-made store or row (the way `tests/test_project_members.py` pins the
upgrade); the fourth is unreachable by construction — being the assignee in
Labeling *is* what makes the write writable — so it is deliberately not driven.
`assign_reviewer`'s sentence is the same story on the transition side: both its
callers are admin-gated, so what a non-admin actually meets is the route's
"Admin only", and the sentence behind it is left unpinned rather than tested
down a path nobody can walk.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import connect, create_account, db_path
from tests.sitting_http import ensure_members, ensure_registered, login, seed_admin

_POINT = {"frame_index": 0, "points": [[0.5, 0.5]], "point_labels": [1]}
_WRITE = "/api/phase/CLIPA/frames/0"


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA",),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        scribble_backend="fake",
    )


def _world(
    tmp_path: Path,
) -> tuple[Settings, TestClient, TestClient, TestClient, TestClient, TestClient]:
    """One Clip, an admin, two annotators and two reviewers — all on the Project.

    carol ends up this item's assigned reviewer; dan carries the same role flag
    while holding nothing, which is the claim the Done-state refusals have to turn
    away.
    """
    settings = _settings(tmp_path)
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "bob", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)
    create_account(path, "dan", "pw", reviewer=True)
    ensure_members(settings, "alice", "bob", "carol", "dan")

    app = create_app(settings)
    admin, alice, bob, carol, dan = (TestClient(app) for _ in range(5))
    login(admin)
    login(alice, "alice", "pw")
    login(bob, "bob", "pw")
    login(carol, "carol", "pw")
    login(dan, "dan", "pw")
    return settings, admin, alice, bob, carol, dan


def _drive(admin: TestClient, alice: TestClient, carol: TestClient, state: str) -> None:
    """Walk CLIPA/phase into `state`, so a refusal can be asked of the real thing."""
    if state == "Unassigned":
        return
    assigned = admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"})
    assert assigned.status_code == 200, assigned.text
    if state == "Labeling":
        return
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    if state == "Submitted":
        return
    reviewing = admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"})
    assert reviewing.status_code == 200, reviewing.text
    if state == "Reviewing":
        return
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 200


def _write(client: TestClient):
    return client.put(_WRITE, json={"phase": "Preparation"})


def _phase_frames(client: TestClient) -> dict:
    return client.get("/api/phase/CLIPA").json()["frames"]


def _state_of(client: TestClient) -> str:
    items = client.get("/api/items").json()["items"]
    return next(
        row["state"]
        for row in items
        if row["clip_id"] == "CLIPA" and row["task_type"] == "phase"
    )


@pytest.mark.parametrize(
    ("state", "actor", "sentence"),
    [
        (
            "Unassigned",
            "alice",
            "Assign this Clip's phase to a labeler before writing its labels.",
        ),
        (
            "Labeling",
            "bob",
            "This Clip's phase is assigned to alice: only alice writes its labels.",
        ),
        (
            "Submitted",
            "alice",
            "This Clip's phase is Submitted: its labels are frozen until it comes back "
            "to Labeling.",
        ),
        (
            "Reviewing",
            "alice",
            "This Clip's phase is in Review — only its reviewer (carol) may edit its labels.",
        ),
        (
            "Done",
            "alice",
            "This Clip's phase is Done: its labels are frozen until it comes back to Labeling.",
        ),
    ],
)
def test_a_refused_write_carries_the_state_s_own_sentence(
    tmp_path: Path, state: str, actor: str, sentence: str
) -> None:
    _settings_obj, admin, alice, bob, carol, _dan = _world(tmp_path)
    _drive(admin, alice, carol, state)

    refused = _write({"alice": alice, "bob": bob}[actor])
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"] == sentence
    # The refusal did not half-apply: nothing was written and the state stands.
    assert _phase_frames(admin) == {}
    assert _state_of(admin) == state


@pytest.mark.parametrize(
    ("state", "actor"),
    [
        ("Unassigned", "alice"),
        ("Labeling", "bob"),
        ("Submitted", "alice"),
        ("Reviewing", "alice"),
        ("Done", "alice"),
    ],
)
def test_the_item_payload_carries_the_sentence_a_write_would_be_refused_with(
    tmp_path: Path, state: str, actor: str
) -> None:
    """The desk says why before the click: the read carries the 403's own words.

    The wording is pinned state by state above. What is pinned here is that the
    desk never has to word it again — the sentence it shows beside a disabled
    control is byte for byte the one the refused call would have carried.
    """
    _settings_obj, admin, alice, bob, carol = _world(tmp_path)
    _drive(admin, alice, carol, state)
    client = {"alice": alice, "bob": bob}[actor]

    item = client.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]
    assert item["capabilities"]["edit_labels"] is False

    refused = _write(client)
    assert refused.status_code == 403, refused.text
    assert item["write_refusal"] == refused.json()["detail"]


def test_an_item_this_account_may_write_carries_no_refusal(tmp_path: Path) -> None:
    """A writable cell has nothing to explain, and the bystander's sentence names the holder."""
    _settings_obj, admin, alice, bob, carol = _world(tmp_path)
    _drive(admin, alice, carol, "Labeling")

    holder = alice.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]
    assert holder["capabilities"]["edit_labels"] is True
    assert holder["write_refusal"] is None

    bystander = bob.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]
    assert bystander["capabilities"]["edit_labels"] is False
    assert bystander["write_refusal"] == (
        "This Clip's phase is assigned to alice: only alice writes its labels."
    )


def test_the_assigned_reviewer_reads_no_refusal_while_the_annotator_does(
    tmp_path: Path,
) -> None:
    """Review moves the write to the reviewer, and the read says so on both sides."""
    _settings_obj, admin, alice, _bob, carol = _world(tmp_path)
    _drive(admin, alice, carol, "Reviewing")

    reviewer = carol.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]
    assert reviewer["capabilities"]["edit_labels"] is True
    assert reviewer["write_refusal"] is None

    annotator = alice.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "phase"}
    ).json()["item"]
    assert annotator["write_refusal"] == (
        "This Clip's phase is in Review — only its reviewer (carol) may edit its labels."
    )


def test_a_mask_item_s_cell_carries_the_mask_sentence(tmp_path: Path) -> None:
    """The mask editor reads its own item's cell, so the sentence names mask."""
    _settings_obj, admin, alice, bob, _carol = _world(tmp_path)
    assigned = admin.post("/api/items/CLIPA/mask/assign", json={"assignee": "alice"})
    assert assigned.status_code == 200, assigned.text

    item = bob.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "mask"}
    ).json()["item"]
    assert item["capabilities"]["edit_labels"] is False
    assert item["write_refusal"] == (
        "This Clip's mask is assigned to alice: only alice writes its labels."
    )

    # The admin holds no bypass either: their read of the same item says the same.
    as_admin = admin.get(
        "/api/me", params={"clip_id": "CLIPA", "task_type": "mask"}
    ).json()["item"]
    assert as_admin["capabilities"]["edit_labels"] is False
    assert as_admin["write_refusal"] == item["write_refusal"]


def test_a_write_refusal_names_the_task_type_it_was_asked_for(tmp_path: Path) -> None:
    _settings_obj, admin, alice, bob, _carol, _dan = _world(tmp_path)
    for task_type in ("class", "triplet"):
        assigned = admin.post(
            f"/api/items/CLIPA/{task_type}/assign", json={"assignee": "alice"}
        )
        assert assigned.status_code == 200, assigned.text

    class_refusal = bob.put("/api/class/CLIPA/frames/0", json={"tags": ["blurred"]})
    assert class_refusal.status_code == 403, class_refusal.text
    assert class_refusal.json()["detail"] == (
        "This Clip's class is assigned to alice: only alice writes its labels."
    )

    triplet_refusal = bob.post(
        "/api/triplet/CLIPA/frames/0",
        json={"instrument": "grasper", "verb": "retract", "target": "gallbladder"},
    )
    assert triplet_refusal.status_code == 403, triplet_refusal.text
    assert triplet_refusal.json()["detail"] == (
        "This Clip's triplet is assigned to alice: only alice writes its labels."
    )


def test_the_admin_is_no_special_writer_and_reads_the_holder_s_sentence(tmp_path: Path) -> None:
    """An admin may hand work out; the sentence, not a bypass, is what they get back."""
    _settings_obj, admin, alice, _bob, carol, _dan = _world(tmp_path)
    _drive(admin, alice, carol, "Labeling")

    refused = _write(admin)
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"] == (
        "This Clip's phase is assigned to alice: only alice writes its labels."
    )
    assert _phase_frames(admin) == {}

    # The assignee, and only her, still writes it.
    assert admin.post("/api/vocab/phases", json={"name": "Preparation"}).status_code == 200
    written = _write(alice)
    assert written.status_code == 200, written.text
    assert written.json()["frames"] == {"0": "Preparation"}


def test_a_mask_write_is_refused_in_the_same_words(tmp_path: Path) -> None:
    """Predict and save go through the same guard, so they speak the same sentence."""
    _settings_obj, admin, alice, bob, _carol, _dan = _world(tmp_path)
    assigned = admin.post("/api/items/CLIPA/mask/assign", json={"assignee": "alice"})
    assert assigned.status_code == 200, assigned.text
    held_by_alice = "This Clip's mask is assigned to alice: only alice writes its labels."

    predicted = bob.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert predicted.status_code == 403, predicted.text
    assert predicted.json()["detail"] == held_by_alice

    saved = bob.post("/api/session/save", params={"clip_id": "CLIPA"})
    assert saved.status_code == 403, saved.text
    assert saved.json()["detail"] == held_by_alice

    # The holder writes it while the item is Labeling, and is frozen out once it
    # is Submitted: the same guard, the same sentence shape, another state.
    predict = alice.post("/api/session/predict", json={**_POINT, "clip_id": "CLIPA"})
    assert predict.status_code == 200, predict.text
    assert alice.post("/api/items/CLIPA/mask/submit").status_code == 200
    frozen = alice.post("/api/session/save", params={"clip_id": "CLIPA"})
    assert frozen.status_code == 403, frozen.text
    assert frozen.json()["detail"] == (
        "This Clip's mask is Submitted: its labels are frozen until it comes back to Labeling."
    )


@pytest.mark.parametrize(
    ("action", "state", "actor", "sentence"),
    [
        (
            "POST submit",
            "Labeling",
            "bob",
            "Only the assignee or an admin can submit this item.",
        ),
        (
            "POST recall",
            "Submitted",
            "bob",
            "Only the assignee or an admin can recall this item.",
        ),
        (
            "POST pass",
            "Reviewing",
            "alice",
            "Only the assigned reviewer or an admin can pass this item.",
        ),
        (
            "POST reject",
            "Reviewing",
            "alice",
            "Only the assigned reviewer or an admin can reject this item.",
        ),
        # Done's two re-opening calls name the same authority: its assigned reviewer
        # or an admin. alice holds neither; dan holds the reviewer flag and nothing
        # else, which is the claim that used to work and must not.
        (
            "POST reject",
            "Done",
            "alice",
            "Only the assigned reviewer or an admin can reject this item.",
        ),
        (
            "POST reject",
            "Done",
            "dan",
            "Only the assigned reviewer or an admin can reject this item.",
        ),
        (
            "POST re-review",
            "Done",
            "alice",
            "Only the assigned reviewer or an admin can send this item back for review.",
        ),
        (
            "POST re-review",
            "Done",
            "dan",
            "Only the assigned reviewer or an admin can send this item back for review.",
        ),
        (
            "POST deliver",
            "Labeling",
            "alice",
            "Only an admin or a reviewer can mark delivery.",
        ),
        (
            "DELETE deliver",
            "Labeling",
            "alice",
            "Only an admin or a reviewer can clear delivery.",
        ),
    ],
)
def test_a_refused_transition_names_who_may_make_it(
    tmp_path: Path, action: str, state: str, actor: str, sentence: str
) -> None:
    _settings_obj, admin, alice, bob, carol, dan = _world(tmp_path)
    _drive(admin, alice, carol, state)

    method, route = action.split()
    client = {"alice": alice, "bob": bob, "dan": dan}[actor]
    refused = client.request(
        method,
        f"/api/items/CLIPA/phase/{route}",
        # A reject is refused for its actor only once it has a note at all.
        json={"note": "looks wrong"} if route == "reject" else None,
    )
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"] == sentence
    assert _state_of(admin) == state


def _sql(settings: Settings, statement: str) -> None:
    """Reshape an Assignment row by hand: a store, not the state machine, made it."""
    con = connect(db_path(settings))
    con.execute(statement)
    con.commit()
    con.close()


def test_a_row_nobody_holds_says_nobody_holds_it(tmp_path: Path) -> None:
    """The API never leaves a Labeling item unheld; a store that predates it can.

    A hand-made row is one of the two shapes `_write_refusal` words separately from
    the five states, so it is made by hand rather than driven.
    """
    settings, admin, alice, bob, carol, _dan = _world(tmp_path)
    _drive(admin, alice, carol, "Labeling")

    _sql(
        settings,
        "UPDATE assignments SET assignee_id=NULL "
        "WHERE clip_id='CLIPA' AND task_type='phase'",
    )
    refused = _write(bob)
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"] == (
        "This Clip's phase is not assigned to anyone — its assignee writes it."
    )

    # Reviewing with the reviewer column cleared reads the same way, without a name.
    _sql(
        settings,
        "UPDATE assignments SET state='Unassigned' "
        "WHERE clip_id='CLIPA' AND task_type='phase'",
    )
    assert admin.post("/api/items/CLIPA/phase/assign", json={"assignee": "alice"}).status_code == 200
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    assert admin.post("/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}).status_code == 200
    _sql(
        settings,
        "UPDATE assignments SET reviewer_id=NULL "
        "WHERE clip_id='CLIPA' AND task_type='phase'",
    )

    unheld_review = _write(alice)
    assert unheld_review.status_code == 403, unheld_review.text
    assert unheld_review.json()["detail"] == (
        "This Clip's phase is in Review — only its assigned reviewer may edit its labels."
    )


def test_a_clip_with_no_item_for_the_task_type_asks_for_an_assignment(tmp_path: Path) -> None:
    settings, admin, alice, _bob, _carol, _dan = _world(tmp_path)
    _sql(settings, "DELETE FROM assignments WHERE clip_id='CLIPA' AND task_type='phase'")

    refused = _write(alice)
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"] == (
        "This Clip has no phase item yet — ask the admin to assign one."
    )
    # The Clip itself is fine: the sentence sends the admin to assign, not to repair.
    assert admin.get("/api/clips/CLIPA").status_code == 200
