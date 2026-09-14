# pilot-ux/16 — Membership gates the reviewer too

**What to build:** the answer to `pilot-ux/15` — a Project's membership is who works on it, and reviewing
is work on it, so membership gates the reviewer as well. The desk already behaves that way: the board's
row picker and batch bar offer `project.members` only, and a Project with no members cannot be given a
reviewer at all. The server is the one place that does not.

`coordination.assign_reviewer` (`endo_label/coordination.py:1246-1268`) checks the admin capability and
`ReviewerIsAnnotator`, then writes the reviewer, so `POST /api/items/{clip_id}/{task_type}/reviewer`
accepts an Account that is not a member of the Clip's Project. Mirror `assign_item`
(`endo_label/coordination.py:1134-1140`): resolve the reviewer with `_account_login` — it yields the
login the refusal sentence needs, unlike `_account_id` — and when `_membership_refusal`
(`endo_label/coordination.py:1019-1030`) returns a sentence, raise `NotAProjectMember(sentence)`. The
refusal comes *before* the annotator check: an impossible assignment is impossible whoever the annotator
is, and the order is pinned by a test rather than left to drift.

Two sentences carry the rule and must stay true to each other: ADR 0028 says membership "gates
assignment" and CONTEXT.md calls a Project's members "the Accounts who may be given work in that
Project". Say the reviewer explicitly where the current wording is the narrower one, the way 14 did for
tags.

Acceptance:

- [ ] a non-member reviewer is refused with the 409 sentence from `_membership_refusal`
- [ ] a member reviewer still assigns, and a non-member who *is* the annotator gets the membership sentence
- [ ] the refusal precedes the annotator check, pinned by a test
- [ ] ADR 0028 / CONTEXT.md name the reviewer (no UI change: the pickers already offer only members)
