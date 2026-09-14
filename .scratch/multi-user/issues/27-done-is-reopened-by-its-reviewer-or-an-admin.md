# multi-user/27 — Done is re-opened by its reviewer or an admin

**What to build:** the answer to `multi-user/24` — from Done, `re_review` and the reject-to-Labeling
belong to the item's *assigned* reviewer or an admin, and the reviewer role flag alone stops being
enough. The decision (owner, 2026-09-14): option 2, the same ruler the Reviewing state already uses.

`endo_label/capabilities.py:71-76` reads `state == "Done" and (admin or reviewer)` for both actions,
where `reviewer` is the role flag and `is_reviewer` is the item's assigned reviewer. So any Account
carrying the flag can send another team's Done item back to Labeling with a note, or back to Submitted —
which the module's own docstring forbids ("a role flag alone never writes someone else's item"), and
which the desk hands over: the action buttons come from `/api/me`'s capability payload, so the
uninvolved reviewer is shown a working Reject. Done is the only action in the matrix that is not
assignment-based.

Change both rows to `is_reviewer or admin`, and update the sentences that go with a refusal —
`coordination.py`'s TransitionForbidden text for `re_review` and the Done-state reject must say *who* can
(the item's reviewer or an admin), not "a reviewer". Write the answer to "who re-opens a Done item"
where a reviewer would look for it: CONTEXT.md's workflow vocabulary, or the ADR that owns the state
machine.

The matrix test is what let this through: in every row the reviewer happens to be the item's assigned
reviewer, so add an uninvolved reviewer (holding the flag, not the item) for each Done-state action, and
keep the rows that pin the assigned reviewer and the admin. `web/e2e/harness.ts`'s reset lever uses
`re_review` to reopen items — the browser stack is hand-run (AGENTS.md → Verification), but the lever
must not keep relying on a capability that no longer exists, so check it and fix the lever or its
comment.

Acceptance:

- [ ] `re_review` and Done→Labeling reject are `is_reviewer or admin`, pinned per action
- [ ] an uninvolved reviewer is refused both, and the refusal names who can
- [ ] the capability matrix covers an uninvolved reviewer for each Done-state action, next to the assigned reviewer and the admin
- [ ] the rule is written down (CONTEXT.md or the state-machine ADR)
- [ ] `web/e2e/harness.ts`'s reset lever no longer depends on the removed capability
