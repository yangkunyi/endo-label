"""Compose seam: the batch assign bar's server half — one gesture, many items, per-item answers.

`POST /api/items/batch-assign` is the board's multi-select path: pick many
(Clip, Task type) items, hand them to one Account (or one reviewer), and read the
answer item by item. It is deliberately **not** all-or-nothing — a Done item in the
selection must not stop the Unassigned ones from landing, and the caller has to be
able to say what happened to each. The single-item routes stay the only other
writers, and this one calls them, so the state machine has one implementation.

The two Projects here are not decoration: membership gates the assignee path (09),
so a batch that spans Projects has to answer per Project.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from fastapi.testclient import TestClient

from endo_label.app import create_app
from endo_label.config import ClipEntry, ProjectSpec, Settings
from endo_label.coordination import create_account, db_path
from tests.live_http import account_client, live_server, read_event
from tests.sitting_http import login, seed_admin

_ALICE = ("alice", "pw")
_BOB = ("bob", "pw")
_CAROL = ("carol", "pw")

# Pilot holds CLIPA (alice, bob may hold its work); Ward holds CLIPB (bob, carol).
_NOT_A_MEMBER_OF_WARD = "alice is not a member of Project Ward — add them first."


def _settings(tmp_path: Path) -> Settings:
    frames = tmp_path / "frames"
    entries: list[ClipEntry] = []
    for clip_id in ("CLIPA", "CLIPB"):
        clip = frames / clip_id
        clip.mkdir(parents=True)
        (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
        (clip / "00002.jpg").write_bytes(b"fake-jpeg-1")
        entries.append(ClipEntry(id=clip_id, kind="jpeg", path=clip))
    return Settings(
        frames_root=frames,
        clip_allowlist=("CLIPA", "CLIPB"),
        annotations_root=tmp_path / "mask",
        labels_root=tmp_path / "labels",
        predictor_backend="fake",
        projects=(
            ProjectSpec(
                name="Pilot",
                hospital="First Hospital",
                clips=(entries[0],),
                members=("alice", "bob", "carol"),
            ),
            ProjectSpec(
                name="Ward",
                hospital="Second Hospital",
                clips=(entries[1],),
                members=("bob", "carol"),
            ),
        ),
    )


def _settings_and_app(tmp_path: Path):
    """Two Projects, three Accounts, and every (Clip, Task type) item Unassigned."""
    settings = _settings(tmp_path)
    seed_admin(settings)
    path = db_path(settings)
    create_account(path, *_ALICE, annotator=True)
    create_account(path, *_BOB, annotator=True)
    create_account(path, *_CAROL, reviewer=True)
    # Config seeds each Project's members at its first registration.
    return settings, create_app(settings)


def _batch(client: TestClient, items: list[tuple[str, str]], **body):
    return client.post(
        "/api/items/batch-assign",
        json={"items": [{"clip_id": c, "task_type": t} for c, t in items], **body},
    )


def _item(client: TestClient, clip_id: str = "CLIPA", task_type: str = "phase") -> dict:
    items = client.get("/api/items").json()["items"]
    return next(
        row for row in items if row["clip_id"] == clip_id and row["task_type"] == task_type
    )


def _to_reviewing(
    admin: TestClient, annotator: TestClient, username: str, clip_id: str, task_type: str
) -> None:
    """Unassigned -> Reviewing, so a batch finds the item already in review."""
    assert _batch(admin, [(clip_id, task_type)], assignee=username).json()["skipped"] == []
    assert annotator.post(f"/api/items/{clip_id}/{task_type}/submit").status_code == 200
    assert (
        admin.post(
            f"/api/items/{clip_id}/{task_type}/reviewer", json={"reviewer": "carol"}
        ).status_code
        == 200
    )


def _one_item_in_every_state(
    admin: TestClient, alice: TestClient, bob: TestClient, reviewer: TestClient
) -> dict[str, tuple[str, str]]:
    """One item per state, so one batch can be answered by all five at once."""
    where = {
        "Unassigned": ("CLIPA", "phase"),
        "Labeling": ("CLIPA", "class"),
        "Submitted": ("CLIPA", "triplet"),
        "Reviewing": ("CLIPA", "mask"),
        # CLIPB is Ward's, and alice is not a member there: bob holds this one.
        "Done": ("CLIPB", "phase"),
    }
    assert _batch(admin, [where["Labeling"]], assignee="alice").status_code == 200
    assert _batch(admin, [where["Submitted"]], assignee="alice").status_code == 200
    assert alice.post("/api/items/CLIPA/triplet/submit").status_code == 200
    _to_reviewing(admin, alice, "alice", *where["Reviewing"])
    _to_reviewing(admin, bob, "bob", *where["Done"])
    assert reviewer.post("/api/items/CLIPB/phase/pass").status_code == 200
    return where


def _skips(answer) -> dict[tuple[str, str], str]:
    return {(row["clip_id"], row["task_type"]): row["reason"] for row in answer["skipped"]}


def test_a_batch_assigning_answers_the_five_states(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin, alice, bob, carol = (TestClient(app) for _ in range(4))
    login(admin)
    login(alice, *_ALICE)
    login(bob, *_BOB)
    login(carol, *_CAROL)
    where = _one_item_in_every_state(admin, alice, bob, carol)

    answer = _batch(admin, list(where.values()), assignee="bob")
    assert answer.status_code == 200, answer.text
    assert [(row["clip_id"], row["task_type"]) for row in answer.json()["assigned"]] == [
        where["Unassigned"]
    ]
    # One sentence per state — the same sentences the board renders beside a row.
    assert _skips(answer.json()) == {
        where["Labeling"]: "Labeling — alice holds it",
        where["Submitted"]: "Submitted — assign a reviewer instead",
        where["Reviewing"]: "Reviewing is not assignable",
        where["Done"]: "Done is final",
    }


def test_a_batch_taking_work_answers_the_five_states(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin, alice, bob, carol = (TestClient(app) for _ in range(4))
    login(admin)
    login(alice, *_ALICE)
    login(bob, *_BOB)
    login(carol, *_CAROL)
    where = _one_item_in_every_state(admin, alice, bob, carol)

    # With the caller saying it has named the holders, Unassigned and Labeling both land.
    answer = _batch(admin, list(where.values()), assignee="bob", allow_reassign=True)
    assert answer.status_code == 200, answer.text
    assert [(row["clip_id"], row["task_type"], row["action"]) for row in answer.json()["assigned"]] == [
        (*where["Unassigned"], "assign"),
        (*where["Labeling"], "reassign"),
    ]
    assert _skips(answer.json()) == {
        where["Submitted"]: "Submitted — assign a reviewer instead",
        where["Reviewing"]: "Reviewing is not assignable",
        where["Done"]: "Done is final",
    }


def test_a_batch_reviewing_answers_the_five_states(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin, alice, bob, carol = (TestClient(app) for _ in range(4))
    login(admin)
    login(alice, *_ALICE)
    login(bob, *_BOB)
    login(carol, *_CAROL)
    where = _one_item_in_every_state(admin, alice, bob, carol)

    # carol reviews, so no item here has carol as its annotator.
    answer = _batch(admin, list(where.values()), reviewer="carol")
    assert answer.status_code == 200, answer.text
    assert [(row["clip_id"], row["task_type"], row["action"]) for row in answer.json()["assigned"]] == [
        (*where["Submitted"], "assign_reviewer")
    ]
    assert _skips(answer.json()) == {
        where["Unassigned"]: "Unassigned has nothing to review",
        where["Labeling"]: "Labeling is not ready for review",
        where["Reviewing"]: "Reviewing is not assignable",
        where["Done"]: "Done is final",
    }


def test_one_gesture_assigns_several_task_types_of_several_clips(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    targets = [("CLIPA", "phase"), ("CLIPA", "class"), ("CLIPA", "triplet"), ("CLIPB", "phase")]
    answer = _batch(admin, targets, assignee="bob")
    assert answer.status_code == 200, answer.text
    payload = answer.json()

    # Per item, in the order asked: the new state, the holder, and which transition ran.
    assert [
        (row["clip_id"], row["task_type"], row["state"], row["assignee"], row["action"])
        for row in payload["assigned"]
    ] == [
        ("CLIPA", "phase", "Labeling", "bob", "assign"),
        ("CLIPA", "class", "Labeling", "bob", "assign"),
        ("CLIPA", "triplet", "Labeling", "bob", "assign"),
        ("CLIPB", "phase", "Labeling", "bob", "assign"),
    ]
    assert payload["skipped"] == []
    # An `assigned` row is the board's own item shape, so a caller can render it.
    assert payload["assigned"][0]["project"] == "Pilot"
    assert payload["assigned"][3]["project"] == "Ward"

    # The board agrees, and the items nobody asked about did not move.
    assert _item(admin, "CLIPA", "phase")["assignee"] == "bob"
    assert _item(admin, "CLIPA", "mask")["state"] == "Unassigned"


def test_a_refused_item_never_takes_the_others_with_it(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    alice, carol = TestClient(app), TestClient(app)
    login(admin)
    login(alice, *_ALICE)
    login(carol, *_CAROL)

    # CLIPA/phase is done and final; CLIPA/class sits in review; CLIPB/phase is free.
    _to_reviewing(admin, alice, "alice", "CLIPA", "phase")
    assert carol.post("/api/items/CLIPA/phase/pass").status_code == 200
    _to_reviewing(admin, alice, "alice", "CLIPA", "class")

    answer = _batch(
        admin,
        [("CLIPA", "phase"), ("CLIPA", "class"), ("CLIPB", "phase")],
        assignee="bob",
    )
    assert answer.status_code == 200, answer.text
    payload = answer.json()
    assert [(row["clip_id"], row["task_type"]) for row in payload["assigned"]] == [
        ("CLIPB", "phase")
    ]
    assert payload["skipped"] == [
        {"clip_id": "CLIPA", "task_type": "phase", "reason": "Done is final"},
        {
            "clip_id": "CLIPA",
            "task_type": "class",
            "reason": "Reviewing is not assignable",
        },
    ]
    # The two refusals left their items exactly where they were.
    assert _item(admin, "CLIPA", "phase")["state"] == "Done"
    assert _item(admin, "CLIPA", "class")["reviewer"] == "carol"


def test_taking_work_off_a_holder_needs_the_caller_to_say_so(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)
    assert _batch(admin, [("CLIPA", "phase")], assignee="alice").status_code == 200

    # Without `allow_reassign` the batch names the holder instead of quietly taking it.
    asked = _batch(admin, [("CLIPA", "phase")], assignee="bob")
    assert asked.json()["assigned"] == []
    assert asked.json()["skipped"] == [
        {"clip_id": "CLIPA", "task_type": "phase", "reason": "Labeling — alice holds it"}
    ]
    assert _item(admin, "CLIPA", "phase")["assignee"] == "alice"

    # With it, the same call lands — and it is a reassign, not an assign.
    confirmed = _batch(admin, [("CLIPA", "phase")], assignee="bob", allow_reassign=True)
    assert confirmed.status_code == 200, confirmed.text
    moved = confirmed.json()["assigned"][0]
    assert (moved["action"], moved["assignee"], moved["state"]) == ("reassign", "bob", "Labeling")
    assert _item(admin, "CLIPA", "phase")["assignee"] == "bob"


def test_a_reviewer_who_is_the_annotator_is_refused_per_item(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    alice, bob = TestClient(app), TestClient(app)
    login(admin)
    login(alice, *_ALICE)
    login(bob, *_BOB)

    for annotator, username, clip_id in ((alice, "alice", "CLIPA"), (bob, "bob", "CLIPB")):
        assert _batch(admin, [(clip_id, "phase")], assignee=username).status_code == 200
        assert annotator.post(f"/api/items/{clip_id}/phase/submit").status_code == 200

    # alice annotates CLIPA/phase, so she may only review the other one.
    answer = _batch(
        admin, [("CLIPA", "phase"), ("CLIPB", "phase")], reviewer="alice"
    )
    assert answer.status_code == 200, answer.text
    assert [(row["clip_id"], row["action"], row["reviewer"], row["state"]) for row in answer.json()["assigned"]] == [
        ("CLIPB", "assign_reviewer", "alice", "Reviewing")
    ]
    assert answer.json()["skipped"] == [
        {
            "clip_id": "CLIPA",
            "task_type": "phase",
            "reason": "alice is the assignee — pick another reviewer",
        }
    ]

    # A reviewer batch only ever takes Submitted items.
    unassigned = _batch(admin, [("CLIPA", "triplet")], reviewer="alice")
    assert unassigned.json()["skipped"] == [
        {
            "clip_id": "CLIPA",
            "task_type": "triplet",
            "reason": "Unassigned has nothing to review",
        }
    ]


def test_a_non_member_is_skipped_by_name_while_the_members_land(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    # One gesture across two Projects: alice may take Pilot's work, not Ward's.
    answer = _batch(admin, [("CLIPA", "phase"), ("CLIPB", "phase")], assignee="alice")
    assert answer.status_code == 200, answer.text
    assert [row["clip_id"] for row in answer.json()["assigned"]] == ["CLIPA"]
    assert answer.json()["skipped"] == [
        {"clip_id": "CLIPB", "task_type": "phase", "reason": _NOT_A_MEMBER_OF_WARD}
    ]
    assert _item(admin, "CLIPB", "phase")["state"] == "Unassigned"

    # Adding her to Ward is what makes the same call land there too.
    added = admin.put(
        "/api/admin/projects/2/members", json={"members": ["alice", "bob", "carol"]}
    )
    assert added.status_code == 200, added.text
    again = _batch(admin, [("CLIPB", "phase")], assignee="alice")
    assert again.json()["skipped"] == []
    assert [row["assignee"] for row in again.json()["assigned"]] == ["alice"]


def test_an_item_that_does_not_answer_is_skipped_not_a_404(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    answer = _batch(
        admin,
        [("CLIPA", "phase"), ("CLIPA", "nonesuch"), ("GHOST", "phase")],
        assignee="bob",
    )
    assert answer.status_code == 200, answer.text
    assert [row["clip_id"] for row in answer.json()["assigned"]] == ["CLIPA"]
    assert answer.json()["skipped"] == [
        {"clip_id": "CLIPA", "task_type": "nonesuch", "reason": "No such item"},
        {"clip_id": "GHOST", "task_type": "phase", "reason": "No such item"},
    ]


def test_the_same_item_twice_in_one_batch_is_one_item(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    answer = _batch(admin, [("CLIPA", "phase"), ("CLIPA", "phase")], assignee="bob")
    assert answer.status_code == 200, answer.text
    assert [row["clip_id"] for row in answer.json()["assigned"]] == ["CLIPA"]
    assert answer.json()["skipped"] == []


def test_one_gesture_names_one_account_or_one_reviewer(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    neither = _batch(admin, [("CLIPA", "phase")])
    assert neither.status_code == 400, neither.text
    both = _batch(admin, [("CLIPA", "phase")], assignee="bob", reviewer="carol")
    assert both.status_code == 400, both.text
    # An Account that does not exist is the whole call's failure, not one item's:
    # the picker cannot offer it, and no row could answer it differently.
    unknown = _batch(admin, [("CLIPA", "phase")], assignee="nobody")
    assert unknown.status_code == 404, unknown.text
    assert _item(admin, "CLIPA", "phase")["state"] == "Unassigned"


def test_only_an_admin_may_batch_assign(tmp_path: Path) -> None:
    settings, app = _settings_and_app(tmp_path)
    admin, alice = TestClient(app), TestClient(app)
    login(admin)
    login(alice, *_ALICE)

    refused = _batch(alice, [("CLIPA", "phase")], assignee="alice")
    assert refused.status_code == 403, refused.text
    assert _item(admin, "CLIPA", "phase")["state"] == "Unassigned"


def test_a_batch_pushes_one_transition_per_item(tmp_path: Path) -> None:
    settings, _app = _settings_and_app(tmp_path)
    with live_server(settings) as base:
        admin = account_client(base, "admin", "secret")
        assert _batch(admin, [("CLIPA", "phase")], assignee="alice").status_code == 200

        with admin.stream("GET", "/api/events") as response:
            lines: Iterator[str] = response.iter_lines()
            name, greeting = read_event(lines)
            assert (name, greeting["reason"]) == ("resync", "connected")

            # One Unassigned item and one held one, in one call.
            answer = _batch(
                admin,
                [("CLIPB", "phase"), ("CLIPA", "phase")],
                assignee="bob",
                allow_reassign=True,
            )
            assert answer.status_code == 200, answer.text
            assert [(row["action"], row["state"]) for row in answer.json()["assigned"]] == [
                ("assign", "Labeling"),
                ("reassign", "Labeling"),
            ]

            pushed = []
            for _ in range(2):
                event_name, event = read_event(lines)
                assert event_name == "transition"
                pushed.append(
                    (event["action"], event["clip_id"], event["task_type"], event["state"])
                )
            assert pushed == [
                ("assign", "CLIPB", "phase", "Labeling"),
                ("reassign", "CLIPA", "phase", "Labeling"),
            ]


def test_a_batch_is_readable_from_the_board_it_came_from(tmp_path: Path) -> None:
    """The selected rows a caller sends are exactly the rows `GET /api/items` lists."""
    settings, app = _settings_and_app(tmp_path)
    admin = TestClient(app)
    login(admin)

    listed = admin.get("/api/items").json()["items"]
    picks = [
        (row["clip_id"], row["task_type"])
        for row in listed
        if row["state"] == "Unassigned"
    ][:5]
    answer = _batch(admin, picks, assignee="carol")
    assert answer.status_code == 200, answer.text
    assert len(answer.json()["assigned"]) == len(picks)

    after = {
        (row["clip_id"], row["task_type"]): row for row in admin.get("/api/items").json()["items"]
    }
    for clip_id, task_type in picks:
        assert after[(clip_id, task_type)]["state"] == "Labeling"
        assert after[(clip_id, task_type)]["assignee"] == "carol"
