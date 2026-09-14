"""Compose seam: Project membership — the explicit answer to \"who works on this Project\".

Membership is a stored relation (not assignment history) and it gates assignment:
the pickers read `GET /api/projects`'s `members` for admins, and handing work — or
its review — to a non-member is a 409 whose sentence names the Project.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from endo_label.__main__ import main
from endo_label.app import create_app
from endo_label.config import Settings, load_settings
from endo_label.coordination import (
    add_project_member,
    assign_item,
    connect,
    create_account,
    create_project,
    db_path,
    list_project_members,
    register_clip,
    remove_project_member,
)
from tests.sitting_http import login, seed_admin

_NOT_A_MEMBER = "alice is not a member of Project Pilot — add them first."


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
    )


def _pilot(tmp_path: Path, *, members: tuple[str, ...] = ()):
    """Pilot with one Clip and two annotators — nobody a member unless asked.

    The Accounts exist before the Project does: `members` seeds at registration and
    seeding never creates an Account.
    """
    settings = _settings(tmp_path)
    seed_admin(settings)
    path = db_path(settings)
    create_account(path, "alice", "pw", annotator=True)
    create_account(path, "bob", "pw", annotator=True)
    project = create_project(path, "Pilot", "First Hospital", members)
    register_clip(
        path,
        project_id=project.id,
        clip_id="CLIPA",
        kind="jpeg",
        media_path=settings.frames_root / "CLIPA",
    )
    return settings, project


def _clients(settings: Settings) -> tuple[TestClient, TestClient, TestClient]:
    app = create_app(settings)
    admin, alice, bob = (TestClient(app) for _ in range(3))
    login(admin)
    login(alice, "alice", "pw")
    login(bob, "bob", "pw")
    return admin, alice, bob


def _assign(client: TestClient, assignee: str, task_type: str = "phase"):
    return client.post(f"/api/items/CLIPA/{task_type}/assign", json={"assignee": assignee})


def _reviewer(client: TestClient, reviewer: str, task_type: str = "phase"):
    return client.post(f"/api/items/CLIPA/{task_type}/reviewer", json={"reviewer": reviewer})


def _phase_item(client: TestClient) -> dict:
    return next(
        row
        for row in client.get("/api/items").json()["items"]
        if row["clip_id"] == "CLIPA" and row["task_type"] == "phase"
    )


def test_assigning_a_non_member_is_refused_with_a_sentence_naming_the_project(
    tmp_path: Path,
) -> None:
    settings, _pilot_row = _pilot(tmp_path)
    admin, _alice, _bob = _clients(settings)

    refused = _assign(admin, "alice")
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == _NOT_A_MEMBER
    # Nothing moved: the item is still Unassigned and unheld.
    unassigned = [row for row in admin.get("/api/items").json()["items"] if row["state"] != "Unassigned"]
    assert unassigned == []

    # Adding them is what makes the same call land.
    added = admin.put("/api/admin/projects/1/members", json={"members": ["alice"]})
    assert added.status_code == 200, added.text
    assert added.json()["members"] == ["alice"]
    assigned = _assign(admin, "alice")
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["assignee"] == "alice"


def test_reassigning_to_a_non_member_is_refused_and_keeps_the_holder(tmp_path: Path) -> None:
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, _alice, _bob = _clients(settings)
    assert _assign(admin, "alice").status_code == 200

    refused = admin.post("/api/items/CLIPA/phase/reassign", json={"assignee": "bob"})
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == "bob is not a member of Project Pilot — add them first."
    held = admin.get("/api/items").json()["items"]
    assert [row["assignee"] for row in held if row["task_type"] == "phase"] == ["alice"]


def test_auto_assign_refuses_a_non_member_and_writes_nothing(tmp_path: Path) -> None:
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, _alice, _bob = _clients(settings)

    refused = admin.post(
        "/api/items/auto-assign", json={"assignees": ["alice", "bob"], "project": "Pilot"}
    )
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == "bob is not a member of Project Pilot — add them first."
    assert all(row["state"] == "Unassigned" for row in admin.get("/api/items").json()["items"])

    # Both members: the same call spreads the work and balances the holders.
    assert add_project_member(db_path(settings), 1, "bob")
    done = admin.post(
        "/api/items/auto-assign", json={"assignees": ["alice", "bob"], "project": "Pilot"}
    )
    assert done.status_code == 200, done.text
    assert done.json()["counts"] == {"alice": 2, "bob": 2}


def test_members_are_read_and_written_by_admins_only(tmp_path: Path) -> None:
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, alice, _bob = _clients(settings)

    assert alice.get("/api/admin/projects/1/members").status_code == 403
    assert alice.put("/api/admin/projects/1/members", json={"members": []}).status_code == 403
    assert alice.delete("/api/admin/projects/1/members/alice").status_code == 403

    listed = admin.get("/api/admin/projects/1/members")
    assert listed.status_code == 200
    assert listed.json() == {"members": ["alice"]}

    replaced = admin.put("/api/admin/projects/1/members", json={"members": ["bob", "alice"]})
    assert replaced.json() == {"members": ["alice", "bob"]}
    removed = admin.delete("/api/admin/projects/1/members/bob")
    assert removed.json() == {"members": ["alice"]}
    # Removing someone already out is the wanted state, not an error.
    assert admin.delete("/api/admin/projects/1/members/bob").json() == {"members": ["alice"]}

    assert admin.get("/api/admin/projects/99/members").status_code == 404
    assert admin.put("/api/admin/projects/99/members", json={"members": []}).status_code == 404


def test_one_unknown_account_refuses_the_whole_replace(tmp_path: Path) -> None:
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, _alice, _bob = _clients(settings)

    refused = admin.put("/api/admin/projects/1/members", json={"members": ["bob", "ghost"]})
    assert refused.status_code == 404, refused.text
    assert refused.json()["detail"] == "Account not found: ghost"
    assert admin.get("/api/admin/projects/1/members").json() == {"members": ["alice"]}


def test_projects_carry_members_for_admins_only(tmp_path: Path) -> None:
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, alice, _bob = _clients(settings)

    for_admin = admin.get("/api/projects").json()["projects"]
    assert for_admin == [
        {
            "id": 1,
            "name": "Pilot",
            "hospital": "First Hospital",
            "clips": [{"id": "CLIPA", "kind": "jpeg"}],
            "members": ["alice"],
        }
    ]
    assert "members" not in alice.get("/api/projects").json()["projects"][0]


def test_membership_gates_assignment_and_not_reading_or_holding(tmp_path: Path) -> None:
    """Leaving a Project stops handovers; it does not take an item or its labels away."""
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, alice, _bob = _clients(settings)
    admin.post("/api/vocab/phases", json={"name": "Preparation"})
    assert _assign(admin, "alice").status_code == 200
    written = alice.put("/api/phase/CLIPA/frames/0", json={"phase": "Preparation"})
    assert written.status_code == 200, written.text

    assert remove_project_member(db_path(settings), 1, "alice") == []
    assert alice.get("/api/phase/CLIPA").json()["frames"] == {"0": "Preparation"}
    assert alice.get("/api/clips/CLIPA").status_code == 200
    assert admin.post("/api/items/CLIPA/phase/reassign", json={"assignee": "alice"}).status_code == 409


def test_assigning_a_non_member_reviewer_is_refused_with_the_same_sentence(
    tmp_path: Path,
) -> None:
    """Reviewing is work on the Project, so the reviewer is gated like the annotator."""
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, alice, _bob = _clients(settings)
    path = db_path(settings)
    create_account(path, "carol", "pw", reviewer=True)
    assert _assign(admin, "alice").status_code == 200
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200

    refused = _reviewer(admin, "carol")
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == "carol is not a member of Project Pilot — add them first."
    # Nothing moved: the item is still Submitted and has no reviewer.
    submitted = _phase_item(admin)
    assert (submitted["state"], submitted["reviewer"]) == ("Submitted", None)

    # Adding her is what makes the same call land.
    added = admin.put(
        "/api/admin/projects/1/members", json={"members": ["alice", "carol"]}
    )
    assert added.status_code == 200, added.text
    reviewing = _reviewer(admin, "carol")
    assert reviewing.status_code == 200, reviewing.text
    assert (reviewing.json()["state"], reviewing.json()["reviewer"]) == (
        "Reviewing",
        "carol",
    )


def test_the_membership_refusal_precedes_the_annotator_check(tmp_path: Path) -> None:
    """An impossible reviewer is impossible whoever the annotator is: membership speaks first."""
    settings, _pilot_row = _pilot(tmp_path, members=("alice",))
    admin, alice, _bob = _clients(settings)
    path = db_path(settings)
    assert _assign(admin, "alice").status_code == 200
    assert alice.post("/api/items/CLIPA/phase/submit").status_code == 200

    # alice is the annotator and, having left the Project, a non-member: of the two
    # refusals that hold for her, the membership sentence is the one she gets.
    assert remove_project_member(path, 1, "alice") == []
    refused = _reviewer(admin, "alice")
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == _NOT_A_MEMBER

    # Back in the Project, the annotator check is the one that speaks.
    assert add_project_member(path, 1, "alice")
    same = _reviewer(admin, "alice")
    assert same.status_code == 409, same.text
    assert same.json()["detail"] == "Conflict"
    assert _phase_item(admin)["state"] == "Submitted"


def test_a_fresh_database_has_no_members_and_the_upgrade_backfills_the_ones_working(
    tmp_path: Path,
) -> None:
    settings, project = _pilot(tmp_path)
    path = db_path(settings)
    assert list_project_members(path, project.id) == []
    # An install from before this table: Alice is already holding CLIPA's phase.
    con = connect(path)
    con.execute(
        "UPDATE assignments SET state='Labeling', "
        "assignee_id=(SELECT id FROM users WHERE username='alice') "
        "WHERE clip_id='CLIPA' AND task_type='phase'"
    )
    con.commit()
    con.execute("DROP TABLE project_members")
    con.commit()
    con.close()

    # The next connect is what an upgrade does: the table comes back seeded.
    assert list_project_members(path, project.id) == ["alice"]
    assert assign_item(path, "CLIPA", "class", "alice")["assignee"] == "alice"


def _yaml(tmp_path: Path, members: str) -> Path:
    frames = tmp_path / "frames"
    clip = frames / "CLIPA"
    clip.mkdir(parents=True, exist_ok=True)
    (clip / "00001.jpg").write_bytes(b"fake-jpeg-0")
    yaml_path = tmp_path / "sitting.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"frames_root: {frames}",
                f"labels_root: {tmp_path / 'labels'}",
                f"coordination_db: {tmp_path / 'coordination.sqlite'}",
                "projects:",
                "  - name: Pilot",
                "    hospital: First Hospital",
                f"    members: {members}",
                "    clips:",
                "      - id: CLIPA",
                "        kind: jpeg",
                f"        path: {clip}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return yaml_path


def test_config_members_seed_a_new_project_and_never_rewrite_it(tmp_path: Path) -> None:
    settings = load_settings(_yaml(tmp_path, "[alice]"))
    seed_admin(settings)
    create_account(db_path(settings), "alice", "pw", annotator=True)

    client = TestClient(create_app(settings))
    login(client)
    assert client.get("/api/projects").json()["projects"][0]["members"] == ["alice"]

    # The admin's edit is the truth from here on: a restart does not put her back.
    removed = client.delete("/api/admin/projects/1/members/alice")
    assert removed.json() == {"members": []}
    restarted = TestClient(create_app(settings))
    login(restarted)
    assert list_project_members(db_path(settings), 1) == []
    assert restarted.get("/api/projects").json()["projects"][0]["members"] == []


def test_config_members_naming_an_account_that_does_not_exist_yet_starts_anyway(
    tmp_path: Path,
) -> None:
    """First start registers the Project before the admin has any Account to name."""
    settings = load_settings(_yaml(tmp_path, "[ghost]"))
    seed_admin(settings)
    client = TestClient(create_app(settings))
    login(client)
    assert client.get("/api/projects").json()["projects"][0]["members"] == []
    assert list_project_members(db_path(settings), 1) == []


def test_add_member_cli_bootstraps_a_project_without_the_console(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    yaml_path = _yaml(tmp_path, "[]")
    settings = load_settings(yaml_path)
    seed_admin(settings)
    create_account(db_path(settings), "alice", "pw", annotator=True)
    create_app(settings)
    capsys.readouterr()

    main(["add-member", "Pilot", "alice", "--config", str(yaml_path)])
    assert "alice" in capsys.readouterr().out
    assert list_project_members(db_path(settings), 1) == ["alice"]

    with pytest.raises(SystemExit) as missing_project:
        main(["add-member", "Nowhere", "alice", "--config", str(yaml_path)])
    assert missing_project.value.code == 1
    assert "Project not found: Nowhere" in capsys.readouterr().err

    with pytest.raises(SystemExit) as missing_account:
        main(["add-member", "Pilot", "ghost", "--config", str(yaml_path)])
    assert missing_account.value.code == 1
    assert "Account not found: ghost" in capsys.readouterr().err
