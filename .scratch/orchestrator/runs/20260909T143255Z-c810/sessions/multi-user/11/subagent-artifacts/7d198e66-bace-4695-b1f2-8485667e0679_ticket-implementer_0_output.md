## 11 — Assignment ownership and board

**Commit:** `b1bdc009e2eef0231de511f1cf8907c506a226af`  
`feat: assignment ownership, clip version, and board v1`  
Ticket `Status:` left `RUNNING`. Working tree clean.

### Files
- `endo_label/coordination.py` — `clips.version`, `assignments`, register/backfill, assign/reassign/unassign, write gate + bump
- `endo_label/items_router.py` — admin `GET/POST /api/items…`
- `endo_label/auth.py` — `require_admin` Depends, label-write helpers
- `endo_label/phase/router.py`, `frame_class/router.py`, `triplet/router.py` — assignee + version
- `endo_label/app.py` — include items router
- `tests/test_assignments.py`, `tests/sitting_http.py` (`occupy_registered`), `tests/test_mask_session.py`
- `web/src/AssignmentsBoard.tsx`, `App.tsx`, `AppShell.tsx`

### Validation
| command | exit |
|---|---|
| `uv run pytest tests/test_assignments.py` | **0** (2 passed) |
| `uv run pytest tests/` | **0** (163 passed, 1 skipped) |
| `tsc --noEmit -p web/tsconfig.json` | **0** |

Did not run `npm run test:e2e`.

### Review (fixed point `56c73d575beb704754ef2440ba0c5d06396ed3ac`)

## Standards
Working tree vs `56c73d575beb704754ef2440ba0c5d06396ed3ac`. HEAD empty of commits. Review = unstaged + untracked.

**Hard — CONTEXT.md Assignment** (“assignee is the only one who edits that Task type's labels”). `TASK_TYPES` includes `mask`; board/SQLite mint mask Assignments. Mask HTTP never calls `require_label_write`. Anyone authed still writes mask.

**Hard — docs/adr/0027** (“Label saves carry an optimistic version … mismatch … 409”). Bodies use `version: int | None = None`; omit skips check. Sitting UI never sends version. PUT/POST return file `doc` without version after bump (`phase/router.py` `return doc`, same class/triplet). 409 hole stays for real client.

**Not a breach (repo standard wins).** Phase/class/triplet stay sibling routers; not folded into Session (AGENTS.md). Auth uses Account. Labels stay on Clip (test). Coordination in SQLite WAL; payloads still files; version on Clip row.

**Judgement, not hard.** CONTEXT Review (“during Review the assigned reviewer may also edit”) — gate is Labeling assignee only. Review transitions not in this diff.

**Mysterious Name** — Assignment called “item”: `items_router.py`, `/api/items`, `items_payload`. Board title is Assignments.

**Speculative Generality** — unused `reviewer_id` / `reviewed_by` / `reviewed_at` / `delivered_at` plus full state CHECK (`Submitted`/`Reviewing`/`Done`) while board/API only Unassigned/Labeling.

**Divergent Change** — `auth.py` (login cookie) now owns `require_admin` / `require_label_write` / `with_clip_version`.

**Duplicated Code** — `assign_item` / `reassign_item` / `unassign_item` same `_do` shape; `ItemRow` twice for assign vs reassign.

**Primitive Obsession / Data Clump** — `clip_id` + `task_type` travel as two strings; domain name is Assignment.

Shotgun of `require_label_write` across three routers skipped: AGENTS sibling-backends rule.

Board has no Unassign control (API+test exist). Not a listed smell.

## Spec
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

**Post-review fixes (then retested):** unknown assignee looked up before state (404); `require_label_assignee` before vocab (403); full-doc writes return `version`. Left as specified: optional version, mask ungated (ticket 19), schema columns for later tickets, `/api/items` payload, bump-then-JSON-write.

**Summary:** Standards ~6 judgement + 2 “hard” that this ticket explicitly deferred (mask gate, optional version). Spec 4 partial / 0 creep that matters / 3 wrong — 2 of those wrongs fixed; bump-then-file is the ticket order.

### Residual risks
- Mask writes still ungated (ticket 19)
- Desk does not send `version` yet (optional on purpose)
- Version bump commits before JSON replace (ticket order)
- Board v1 has no unassign control
- Triplet POST row body omits `version` (compose exact-equality)

### Next
Merge this worktree; ticket 12 can take state machine / auto-assign. Playwright board coverage is ticket 22.