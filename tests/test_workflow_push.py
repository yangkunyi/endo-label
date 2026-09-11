"""Compose seam: assignment transitions push events, and a reconnected subscriber refetches."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import httpx

from endo_label.config import Settings
from endo_label.coordination import create_account, db_path
from tests.live_http import account_client, live_server, read_event
from tests.sitting_http import ensure_registered, seed_admin

_STREAM = "/api/events"


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


def _accounts(settings: Settings) -> None:
    seed_admin(settings)
    ensure_registered(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "bob", "pw", annotator=True)
    create_account(path, "carol", "pw", reviewer=True)


def _resync(lines: Iterator[str]) -> None:
    """The greeting every subscription starts with, dropped or fresh."""
    name, greeting = read_event(lines)
    assert (name, greeting["reason"]) == ("resync", "connected")


def _transition(lines: Iterator[str]) -> tuple[str, str, str, str]:
    """The next pushed transition, reduced to its identity and new state."""
    name, event = read_event(lines)
    assert name == "transition"
    return (event["action"], event["clip_id"], event["task_type"], event["state"])


def test_the_event_stream_needs_an_account_and_greets_it_with_a_resync(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _accounts(settings)
    with live_server(settings) as base:
        anonymous = httpx.get(f"{base}{_STREAM}", timeout=10.0)
        assert anonymous.status_code == 401, anonymous.text

        admin = account_client(base, "admin", "secret")
        with admin.stream("GET", _STREAM) as response:
            assert response.status_code == 200, response.text
            assert response.headers["content-type"].startswith("text/event-stream")
            _resync(response.iter_lines())


def test_every_transition_class_publishes_its_item_identity_and_new_state(
    tmp_path: Path,
) -> None:
    settings = _settings(tmp_path)
    _accounts(settings)
    with live_server(settings) as base:
        admin = account_client(base, "admin", "secret")
        alice = account_client(base, "alice", "pw")
        carol = account_client(base, "carol", "pw")

        steps = [
            (
                "assign",
                "Labeling",
                lambda: admin.post(
                    "/api/items/CLIPA/phase/assign", json={"assignee": "alice"}
                ),
            ),
            ("submit", "Submitted", lambda: alice.post("/api/items/CLIPA/phase/submit")),
            ("recall", "Labeling", lambda: alice.post("/api/items/CLIPA/phase/recall")),
            ("submit", "Submitted", lambda: alice.post("/api/items/CLIPA/phase/submit")),
            (
                "assign_reviewer",
                "Reviewing",
                lambda: admin.post(
                    "/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}
                ),
            ),
            ("pass", "Done", lambda: carol.post("/api/items/CLIPA/phase/pass")),
            (
                "re_review",
                "Submitted",
                lambda: admin.post("/api/items/CLIPA/phase/re-review"),
            ),
            (
                "assign_reviewer",
                "Reviewing",
                lambda: admin.post(
                    "/api/items/CLIPA/phase/reviewer", json={"reviewer": "carol"}
                ),
            ),
            (
                "reject",
                "Labeling",
                lambda: carol.post(
                    "/api/items/CLIPA/phase/reject", json={"note": "fix frame 3"}
                ),
            ),
            (
                "deliver",
                "Labeling",
                lambda: admin.post("/api/items/CLIPA/phase/deliver"),
            ),
            (
                "undeliver",
                "Labeling",
                lambda: admin.delete("/api/items/CLIPA/phase/deliver"),
            ),
            (
                "reassign",
                "Labeling",
                lambda: admin.post(
                    "/api/items/CLIPA/phase/reassign", json={"assignee": "bob"}
                ),
            ),
            (
                "unassign",
                "Unassigned",
                lambda: admin.post("/api/items/CLIPA/phase/unassign"),
            ),
            (
                "auto_assign",
                "Labeling",
                lambda: admin.post(
                    "/api/items/auto-assign",
                    json={
                        "assignees": ["alice"],
                        "items": [{"clip_id": "CLIPA", "task_type": "phase"}],
                    },
                ),
            ),
        ]

        with admin.stream("GET", _STREAM) as response:
            lines = response.iter_lines()
            _resync(lines)

            for action, state, call in steps:
                response = call()
                assert response.status_code == 200, response.text
                assert _transition(lines) == (action, "CLIPA", "phase", state)


def test_a_dropped_subscriber_reconnects_into_a_full_refetch(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    _accounts(settings)
    with live_server(settings) as base:
        admin = account_client(base, "admin", "secret")
        alice = account_client(base, "alice", "pw")
        assigned = admin.post(
            "/api/items/CLIPA/phase/assign", json={"assignee": "alice"}
        )
        assert assigned.status_code == 200, assigned.text
        assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200

        with admin.stream("GET", _STREAM) as response:
            lines = response.iter_lines()
            _resync(lines)
            assert alice.post("/api/items/CLIPA/phase/recall").status_code == 200
            assert _transition(lines)[0] == "recall"

        # The subscriber drops; one transition lands while nobody is listening.
        assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200

        # Reconnecting is greeted with the refetch marker, and the lists the
        # client then refetches already carry the state it missed.
        with admin.stream("GET", _STREAM) as response:
            lines = response.iter_lines()
            _resync(lines)

            item = next(
                row
                for row in admin.get("/api/items").json()["items"]
                if (row["clip_id"], row["task_type"]) == ("CLIPA", "phase")
            )
            assert item["state"] == "Submitted"

            # The missed transition is not replayed as an event: the next frame is
            # the next transition, so the refetch is what recovered the list.
            assert alice.post("/api/items/CLIPA/phase/recall").status_code == 200
            assert _transition(lines)[0] == "recall"
