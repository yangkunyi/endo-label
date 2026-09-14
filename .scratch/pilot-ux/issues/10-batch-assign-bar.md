# 10 — Batch assign bar

**What to build:** assigning must stop being one text input per item. Trial feedback: "assign 时候
每个 clip 点有点麻烦了，做成那种选择用户然后多选的，就是可以批量选择的？…最后这个顺序怎么方便怎么
来的，不一定要先点 assign to 然后再选人，然后用户也可以按照 project 分组吧".

Decided: either order works (account-first or item-first), the chosen account sticks while the
page is open, and the account picker groups by **Project membership** (09). Spreading items across
several Accounts stays the `auto-assign` path.

Code:
- `web/src/AssignmentsBoard.tsx` — a selection mode spanning the columns, with a sticky bar: one
  account picker (grouped by 09's membership, deduplicated when an Account is in several Projects),
  an action (`Assign` / `Reassign` / `Assign reviewer`) and a primary button that names the count
  (`Assign 12 items to boss`). The account choice survives between batches.
- Enablement per row state — Unassigned: assign; Labeling/Submitted: reassign, and the confirm
  names the current holder (`Takes 3 items from alice`); Reviewing/Done: not selectable, with the
  reason in the row (`Done is final`). The reviewer action mirrors this and still refuses
  reviewer == assignee.
- The per-row control changes from a free-text username input to the same account picker (a typo
  is a 404 today).
- Server: `POST /api/items/batch-assign` taking `{items: [{clip_id, task_type}], assignee?: str,
  reviewer?: str, allow_reassign?: bool}`, returning per-item results
  `{assigned: [...], skipped: [{clip_id, task_type, reason}]}` — never all-or-nothing. Extend
  `endo_label/items_router.py`; the single-item routes stay.
- Feedback: `12 assigned · 3 skipped (Done)` in the notice, with the skipped rows readable on the
  board.

**Blocked by:** 09

Status: ready-for-agent

- [ ] one gesture assigns many items, in either order, to one Account
- [ ] the account picker groups Accounts by Project membership and hides non-members
- [ ] reassign names the previous holder before it takes the work
- [ ] Reviewing/Done rows cannot be batch-assigned, and say why
- [ ] partial failures are reported per item, and the successes are kept
- [ ] a batch touching several Task types of one Clip works
