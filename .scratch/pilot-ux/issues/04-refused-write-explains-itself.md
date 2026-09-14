# 04 — A refused write explains itself

**What to build:** a refused write must say *why*. Trial feedback: "现在 apply 会显示 forbidden 是什
么情况？…你把这个 error prompt 重新写一下，写成 不是自己的 assign 不能交之类的".

The gate itself is **unchanged** and was confirmed correct (the admin is not a special writer;
`coordination._write_allowed` keeps `admin=False`). Only the message was wrong.

Code:
- `endo_label/coordination.py` — new `_account_name` (defensive: a fixture DB without the
  `accounts` table returns `None`) and `_write_refusal(con, row, task_type, account_id)`, which
  words the reason from the Assignment row: assigned to `<user>` / not assigned to anyone / in
  Review (`its reviewer (<user>)`) / frozen while `Submitted` or `Done`. Both
  `assert_label_writer` and `authorize_label_write` raise `LabelWriteForbidden(reason)`. The eight
  `TransitionForbidden()` sites now carry a sentence too ("Only the assignee or an admin can submit
  this item." and siblings).
- `endo_label/auth.py` (`_label_write_http`) and `endo_label/items_router.py` (`_mutate`) — pass the
  exception's text through as the 403 `detail` instead of the literal `"Forbidden"`. This is the
  same path the mask write guard uses (`require_label_assignee`), so Predict/Propagate/save get the
  sentence as well.

Verified on the pilot: `PUT /api/phase/CASE001_step06_clip002/frames/0` → 403
`{"detail":"Assign this Clip's phase to a labeler before writing its labels."}`; plus
`tests/test_assignments.py`, `test_review_flow.py`, `test_annotator_flow.py`, `test_desk_vocab.py`,
`test_admin_console.py`, `test_workflow.py` — 26 passed.

**Blocked by:** —

Status: MERGED

- [x] a label write refused for assignment says who holds it / why it is frozen
- [x] a refused transition says who may make it
- [x] the desk's notice line shows the sentence (it already renders the HTTP detail)
- [x] the write gate itself is untouched (no admin bypass, no auto-claim)

## Comments

Delivered by hand as commit `d4f3311` (`fix(auth): a refused write says why`). The companion
product decision — how a non-admin sees only their own work — is 08.
