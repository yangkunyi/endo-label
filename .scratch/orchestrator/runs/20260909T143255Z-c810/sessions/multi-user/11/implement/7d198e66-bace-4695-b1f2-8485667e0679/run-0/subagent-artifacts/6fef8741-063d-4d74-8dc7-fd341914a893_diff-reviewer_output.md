**(a) Missing / partial**

- Spec L68 / ADR 0027: “Save requests must carry the clip version… mismatch returns 409.” Writes omit `version` and skip check (`authorize_label_write`). Matches parent note 3; desk paints stay unlocked.
- Spec L83: “version field added to existing save endpoints.” Only GET injects `version`. PUT/POST/DELETE responses omit it.
- Parent note 3: “Write bodies accept optional version.” Triplet DELETE takes query `version`, not body (`triplet/router.py` `delete_triplet`).
- Parent note 2: unknown clip/task_type 404, unknown assignee 404, wrong state 409 — code in `coordination.py` / `items_router.py`; `tests/test_assignments.py` never hits those.

**(b) Scope creep**

- No submit/recall/reviewer-assign/pass/reject/delivered/auto-assign (parent note 1).
- Mild: `GET /api/items` also returns reviewer/note/reviewed_by/reviewed_at/delivered_at. Parent only required assignee username|null.

**(c) Implemented wrong**

- Ticket L11: “any other user gets 403.” Phase/class/triplet validate vocab **before** `require_label_write` → non-assignee + bad name = **400**, not 403.
- ADR 0027 lost-update close: `authorize_label_write` COMMITs `clips.version` then `save_clip` **outside** txn. Later JSON replace can clobber a writer who already bumped. Worse when version omitted.
- Parent note 2 “Unknown assignee username 404”: `assign_item`/`reassign_item` check state first → Labeling + unknown user = **409**, not 404.