# multi-user/26 — The mask editor renders what the assignment allows

**What to build:** the answer to `multi-user/23` — mask keeps the same ownership rule as phase, class
and triplet, and the desk stops pretending otherwise. The decision (owner, 2026-09-14): assignment is the
only write gate, with no admin bypass and no claim-on-first-write, so an admin self-assigns before
masking like everyone else.

Two of 23's acceptance items are already true and must not be redone. Every mask write already sits
behind `require_label_assignee` (`endo_label/mask/http.py:133`, covering predict, undo, propagate, track
and point edits, clear, save and review), and a refusal already says why: `assert_label_writer` raises
the domain sentence built by `coordination._write_refusal`, `auth._label_write_http` maps it to the 403
detail, and the desk's `workerLoadingToast` shows that message rather than "Predict failed".

**What is left is the desk.** It renders the mask editor unconditionally — the mask panel consumes no
`edit_labels` capability, while `/api/me`'s per-item capabilities are what
`web/src/desk/DeskItemActions.tsx` reads for the transitions — so a non-assignee sees Predict,
Propagate, Undo, track edit/delete and Save, and only learns the truth from a 403. Render those controls
from the same `edit_labels` the server enforces: disabled, with the ownership sentence in place of a
button that only fails on click (the sentence names the way out — the admin assigns the item first).

Write the decision where the next reader looks. ADR 0028 is about Project membership, so this is either
a CONTEXT.md sentence in the write-ownership wording or its own ADR, following the repository's
domain-doc convention: mask follows assignment, and the admin is not exempt.

Acceptance:

- [ ] the decision (assignment is the only mask write gate, no admin bypass, admin self-assigns) is written down
- [ ] the desk's mask controls follow `edit_labels` for the open item: not writable means no usable Predict / Propagate / Undo / Save
- [ ] what a non-assignee sees says why, next to the controls
- [ ] a vitest test pins the mapping from capabilities to the mask controls' state
