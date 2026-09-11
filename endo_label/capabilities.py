"""What one Account may do, derived from its role flags and one item's state.

The server is the single source of truth for the buttons the desk and the board
render: HTTP enforcement and the `/api/me` capability payload both read these
predicates, so a shown button and a refused call cannot disagree.
"""

from __future__ import annotations

# One (Clip, Task type) item's actions, in board order.
ACTIONS = (
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

STATES = ("Unassigned", "Labeling", "Submitted", "Reviewing", "Done")


def account_capabilities(*, admin: bool, reviewer: bool, annotator: bool) -> dict[str, bool]:
    """The surfaces this Account may use: My Tasks, the review queue, the admin console."""
    return {"admin": admin, "review": reviewer, "annotate": annotator}


def may_create_candidate(*, admin: bool, reviewer: bool, annotator: bool) -> bool:
    """Any Account that labels or curates may propose a Project-local word."""
    return admin or reviewer or annotator


def may_edit_project_vocab(*, admin: bool, reviewer: bool) -> bool:
    """The Project word list (enable/disable, candidate add/edit) is reviewer+."""
    return admin or reviewer


def may_write_registry(*, admin: bool) -> bool:
    """Global identity (add/rename/archive/promote) stays admin-only."""
    return admin


def item_capabilities(
    *,
    state: str,
    assignee_id: int | None,
    reviewer_id: int | None,
    account_id: int,
    admin: bool,
    reviewer: bool,
) -> dict[str, bool]:
    """Each action for one item and one Account.

    Admin gates assign / reassign / unassign / assign_reviewer. Being the item's
    assignee or assigned reviewer gates the rest — a role flag alone never writes
    someone else's item. `edit_labels` mirrors the label-write check exactly.
    """
    is_assignee = assignee_id is not None and assignee_id == account_id
    is_reviewer = reviewer_id is not None and reviewer_id == account_id
    return {
        "assign": admin and state == "Unassigned",
        "reassign": admin and state == "Labeling",
        "unassign": admin and state == "Labeling",
        "assign_reviewer": admin and state == "Submitted",
        "submit": state == "Labeling" and (is_assignee or admin),
        "recall": state == "Submitted" and (is_assignee or admin),
        "pass": state == "Reviewing" and (is_reviewer or admin),
        "reject": (state == "Reviewing" and (is_reviewer or admin))
        or (state == "Done" and (admin or reviewer)),
        "re_review": state == "Done" and (admin or reviewer),
        "edit_labels": (state == "Labeling" and is_assignee)
        or (state == "Reviewing" and is_reviewer),
    }
