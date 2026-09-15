"""Compose seam: the /me capability matrix and the annotator's own task list."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from tests.sitting_http import ensure_members, ensure_registered, login, seed_admin

# Every action the desk or the board may offer for one (Clip, Task type) item.
_ACTIONS = (
    "assign",
    "reassign",
    "unassign",
    "assign_reviewer",
    "submit",
    "recall",
    "pass",
    "reject",
    "re_review",
    "edit_labels",
)

_PHASE = "Preparation"
_PHASE_TWO = "CalotTriangleDissection"

# One item per state; the matrix walks these.
_ITEMS = {
    "Unassigned": ("CLIPB", "phase"),
    "Labeling": ("CLIPA", "phase"),
    "Submitted": ("CLIPA", "class"),
    "Reviewing": ("CLIPA", "triplet"),
    "Done": ("CLIPA", "mask"),
}

# Roles per Account. alice annotates, carol reviews and becomes the first item's
# assigned reviewer, frank annotates and becomes the second Done item's assigned
# reviewer without holding the reviewer flag, erin reviews too but is never
# assigned anything, dave holds no role.
_ROLES = {
    "admin": {"admin": True, "reviewer": False, "annotator": False},
    "alice": {"admin": False, "reviewer": False, "annotator": True},
    "bob": {"admin": False, "reviewer": False, "annotator": True},
    "carol": {"admin": False, "reviewer": True, "annotator": False},
    "dave": {"admin": False, "reviewer": False, "annotator": False},
    "erin": {"admin": False, "reviewer": True, "annotator": False},
    "frank": {"admin": False, "reviewer": False, "annotator": True},
}


def caps(*actions: str) -> dict[str, bool]:
    """A full capability cell: every action false unless named."""
    return {action: action in actions for action in _ACTIONS}


# role x state -> each action. The item is alice's to label and carol's to
# review (she becomes the assigned reviewer from Reviewing on). erin holds the
# reviewer flag without ever holding this item, so she is false in every cell:
# the flag alone decides no action, Done included. Done is walked twice, on two
# items, because one assigned reviewer is not enough to tell the two rules
# apart: carol carries the flag, frank (assigned to the second item) does not.
# Under the assignment rule both re-open their own Done item; under the role
# flag carol does and frank does not, and erin's cell flips the other way.
_MATRIX: dict[str, dict[str, dict[str, bool]]] = {
    "Unassigned": {
        "admin": caps("assign"),
        "alice": caps(),
        "bob": caps(),
        "carol": caps(),
        "dave": caps(),
        "erin": caps(),
    },
    "Labeling": {
        "admin": caps("reassign", "unassign", "submit"),
        "alice": caps("submit", "edit_labels"),
        "bob": caps(),
        "carol": caps(),
        "dave": caps(),
        "erin": caps(),
    },
    "Submitted": {
        "admin": caps("assign_reviewer", "recall"),
        "alice": caps("recall"),
        "bob": caps(),
        "carol": caps(),
        "dave": caps(),
        "erin": caps(),
    },
    "Reviewing": {
        "admin": caps("pass", "reject"),
        "alice": caps(),
        "bob": caps(),
        "carol": caps("pass", "reject", "edit_labels"),
        "dave": caps(),
        "erin": caps(),
    },
    "Done": {
        "admin": caps("reject", "re_review"),
        "alice": caps(),
        "bob": caps(),
        "carol": caps("reject", "re_review"),
        "dave": caps(),
        "erin": caps(),
        "frank": caps("reject", "re_review"),
    },
}

# Done's second item, and the Account whose cell is asked about it: the assigned
# reviewer without the reviewer role flag. Every other (state, actor) reads the
# state's one item from `_ITEMS`.
_DONE_ITEMS = (("CLIPA", "mask"), ("CLIPB", "class"))
_ITEM_OF = {("Done", "frank"): _DONE_ITEMS[1]}


def _item_for(state: str, actor: str) -> tuple[str, str]:
    return _ITEM_OF.get((state, actor), _ITEMS[state])


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
    )


def _clients(tmp_path: Path) -> dict[str, TestClient]:
    settings = _settings(tmp_path)
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    for username, roles in _ROLES.items():
        if username == "admin":
            continue
        create_account(path, username, "pw", **roles)
    ensure_members(settings, *[name for name in _ROLES if name != "admin"])
    app = create_app(settings)
    clients = {username: TestClient(app) for username in _ROLES}
    for username, client in clients.items():
        if username == "admin":
            login(client)
        else:
            login(client, username, "pw")
    return clients


def _build_state(
    clients: dict[str, TestClient],
    state: str,
    item: tuple[str, str] | None = None,
    reviewer: str = "carol",
) -> tuple[str, str]:
    """Drive the item for `state` into it with the public transitions.

    `item` overrides the state's one item and `reviewer` names the Account the
    admin hands it to, so Done's second item can ride the same walk.
    """
    admin, alice = clients["admin"], clients["alice"]
    clip_id, task_type = item if item is not None else _ITEMS[state]
    if state == "Unassigned":
        return clip_id, task_type
    assigned = admin.post(
        f"/api/items/{clip_id}/{task_type}/assign", json={"assignee": "alice"}
    )
    assert assigned.status_code == 200, assigned.text
    if state == "Labeling":
        return clip_id, task_type
    submitted = alice.post(f"/api/items/{clip_id}/{task_type}/submit")
    assert submitted.status_code == 200, submitted.text
    if state == "Submitted":
        return clip_id, task_type
    reviewing = admin.post(
        f"/api/items/{clip_id}/{task_type}/reviewer", json={"reviewer": reviewer}
    )
    assert reviewing.status_code == 200, reviewing.text
    if state == "Reviewing":
        return clip_id, task_type
    passed = clients[reviewer].post(f"/api/items/{clip_id}/{task_type}/pass")
    assert passed.status_code == 200, passed.text
    return clip_id, task_type


def test_me_capability_matrix_is_role_by_state(
    tmp_path: Path,
) -> None:
    clients = _clients(tmp_path)
    for state in _ITEMS:
        _build_state(clients, state)
    # Done's second item: the same walk, its reviewer an Account without the
    # reviewer role flag (the widening ticket 27 did not pin).
    _build_state(clients, "Done", _DONE_ITEMS[1], reviewer="frank")

    seen: set[tuple[str, str]] = set()
    for state, actors in _MATRIX.items():
        for actor, expected in actors.items():
            clip_id, task_type = _item_for(state, actor)
            client = clients[actor]
            response = client.get(
                "/api/me", params={"clip_id": clip_id, "task_type": task_type}
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["username"] == actor
            assert body["roles"] == _ROLES[actor]
            assert body["capabilities"] == {
                "admin": _ROLES[actor]["admin"],
                "review": _ROLES[actor]["reviewer"],
                "annotate": _ROLES[actor]["annotator"],
            }
            item = body["item"]
            assert item["clip_id"] == clip_id
            assert item["task_type"] == task_type
            assert item["state"] == state
            assert item["capabilities"] == expected, (actor, state)
            seen.add((actor, state))

    assert seen == {
        (actor, state) for state in _MATRIX for actor in _MATRIX[state]
    }


def test_me_answers_404_for_an_item_no_assignment_holds(tmp_path: Path) -> None:
    """A (Clip, Task type) pair the store does not hold has no capability cell."""
    clients = _clients(tmp_path)
    alice = clients["alice"]

    held = alice.get("/api/me", params={"clip_id": "CLIPA", "task_type": "phase"})
    assert held.status_code == 200, held.text
    assert held.json()["item"]["clip_id"] == "CLIPA"

    # A Task type this Clip does not carry, and a Clip nobody registered.
    unknown_type = alice.get("/api/me", params={"clip_id": "CLIPA", "task_type": "nope"})
    assert unknown_type.status_code == 404, unknown_type.text
    unknown_clip = alice.get("/api/me", params={"clip_id": "NOPE", "task_type": "phase"})
    assert unknown_clip.status_code == 404, unknown_clip.text

    # Half a question is not an item question: identity still answers without it.
    identity = alice.get("/api/me", params={"clip_id": "CLIPA"})
    assert identity.status_code == 200, identity.text
    assert "item" not in identity.json()


def _my_items(client: TestClient) -> dict[tuple[str, str], dict]:
    response = client.get("/api/me/items")
    assert response.status_code == 200, response.text
    return {(row["clip_id"], row["task_type"]): row for row in response.json()["items"]}


def test_annotator_lists_own_items_and_works_them_through_the_state_machine(
    tmp_path: Path,
) -> None:
    clients = _clients(tmp_path)
    admin, alice, bob, carol = (
        clients["admin"],
        clients["alice"],
        clients["bob"],
        clients["carol"],
    )
    assert admin.post("/api/vocab/phases", json={"name": _PHASE}).status_code == 200
    assert admin.post("/api/vocab/phases", json={"name": _PHASE_TWO}).status_code == 200

    for clip_id, task_type, assignee in (
        ("CLIPA", "phase", "alice"),
        ("CLIPA", "class", "alice"),
        ("CLIPB", "phase", "bob"),
    ):
        assigned = admin.post(
            f"/api/items/{clip_id}/{task_type}/assign", json={"assignee": assignee}
        )
        assert assigned.status_code == 200, assigned.text

    # Own items only: an unassigned item and another annotator's item stay out.
    mine = _my_items(alice)
    assert set(mine) == {("CLIPA", "phase"), ("CLIPA", "class")}
    assert {row["state"] for row in mine.values()} == {"Labeling"}
    assert {row["assignee"] for row in mine.values()} == {"alice"}
    assert {row["note"] for row in mine.values()} == {None}
    assert set(_my_items(bob)) == {("CLIPB", "phase")}
    assert set(_my_items(clients["dave"])) == set()

    # Labeling: submit is offered and works.
    assert mine[("CLIPA", "phase")]["capabilities"]["submit"] is True
    assert mine[("CLIPA", "phase")]["capabilities"]["recall"] is False
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200
    submitted = _my_items(alice)[("CLIPA", "phase")]
    assert submitted["state"] == "Submitted"
    assert submitted["capabilities"]["submit"] is False
    assert submitted["capabilities"]["recall"] is True

    # Submitted: recall is offered and works.
    assert alice.post("/api/items/CLIPA/phase/recall").status_code == 200
    recalled = _my_items(alice)[("CLIPA", "phase")]
    assert recalled["state"] == "Labeling"
    assert recalled["capabilities"]["submit"] is True
    assert recalled["capabilities"]["recall"] is False

    # A reject stores the note the assignee's banner shows.
    assert alice.post("/api/items/CLIPA/class/submit").status_code == 200
    reviewing = admin.post("/api/items/CLIPA/class/reviewer", json={"reviewer": "carol"})
    assert reviewing.status_code == 200, reviewing.text
    # The item is carol's to review while it sits in Reviewing.
    assert set(_my_items(carol)) == {("CLIPA", "class")}
    rejected = carol.post("/api/items/CLIPA/class/reject", json={"note": "fix frame 3"})
    assert rejected.status_code == 200, rejected.text
    back = _my_items(alice)[("CLIPA", "class")]
    assert back["state"] == "Labeling"
    assert back["note"] == "fix frame 3"
    assert back["reviewer"] is None
    assert back["reviewed_by"] is None
    assert back["capabilities"]["submit"] is True
    assert back["capabilities"]["edit_labels"] is True
    # The reviewer's queue drops it once rejected.
    assert set(_my_items(carol)) == set()

    # A save with the listed version works once, then a stale retry 409s and the
    # fresh version from the list succeeds.
    held = _my_items(alice)[("CLIPA", "phase")]
    version = held["version"]
    first = alice.put(
        "/api/phase/CLIPA/frames/0", json={"phase": _PHASE, "version": version}
    )
    assert first.status_code == 200, first.text
    stale = alice.put(
        "/api/phase/CLIPA/frames/1", json={"phase": _PHASE_TWO, "version": version}
    )
    assert stale.status_code == 409, stale.text
    fresh = _my_items(alice)[("CLIPA", "phase")]
    assert fresh["version"] == version + 1
    retry = alice.put(
        "/api/phase/CLIPA/frames/1",
        json={"phase": _PHASE_TWO, "version": fresh["version"]},
    )
    assert retry.status_code == 200, retry.text
    frames = alice.get("/api/phase/CLIPA").json()["frames"]
    assert frames["0"] == _PHASE
    assert frames["1"] == _PHASE_TWO
