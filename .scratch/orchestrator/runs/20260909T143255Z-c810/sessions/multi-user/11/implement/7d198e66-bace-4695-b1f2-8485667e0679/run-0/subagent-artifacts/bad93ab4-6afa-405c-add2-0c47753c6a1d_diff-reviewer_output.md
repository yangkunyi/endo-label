Working tree vs `56c73d575beb704754ef2440ba0c5d06396ed3ac`. HEAD empty of commits. Review = unstaged + untracked.

## Documented standards

**Hard — CONTEXT.md Assignment** (“assignee is the only one who edits that Task type's labels”). `TASK_TYPES` includes `mask`; board/SQLite mint mask Assignments. Mask HTTP never calls `require_label_write`. Anyone authed still writes mask.

**Hard — docs/adr/0027** (“Label saves carry an optimistic version … mismatch … 409”). Bodies use `version: int | None = None`; omit skips check. Sitting UI never sends version. PUT/POST return file `doc` without version after bump (`phase/router.py` `return doc`, same class/triplet). 409 hole stays for real client.

**Not a breach (repo standard wins).** Phase/class/triplet stay sibling routers; not folded into Session (AGENTS.md). Auth uses Account. Labels stay on Clip (test). Coordination in SQLite WAL; payloads still files; version on Clip row.

**Judgement, not hard.** CONTEXT Review (“during Review the assigned reviewer may also edit”) — gate is Labeling assignee only. Review transitions not in this diff.

## Baseline smells (all judgement)

**Mysterious Name** — Assignment called “item”: `items_router.py`, `/api/items`, `items_payload`. Board title is Assignments.

**Speculative Generality** — unused `reviewer_id` / `reviewed_by` / `reviewed_at` / `delivered_at` plus full state CHECK (`Submitted`/`Reviewing`/`Done`) while board/API only Unassigned/Labeling.

**Divergent Change** — `auth.py` (login cookie) now owns `require_admin` / `require_label_write` / `with_clip_version`.

**Duplicated Code** — `assign_item` / `reassign_item` / `unassign_item` same `_do` shape; `ItemRow` twice for assign vs reassign.

**Primitive Obsession / Data Clump** — `clip_id` + `task_type` travel as two strings; domain name is Assignment.

Shotgun of `require_label_write` across three routers skipped: AGENTS sibling-backends rule.

Board has no Unassign control (API+test exist). Not a listed smell.