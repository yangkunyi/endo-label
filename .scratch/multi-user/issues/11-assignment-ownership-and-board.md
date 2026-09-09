# 11 — Assignment ownership and board

**What to build:** assignments table ((Clip, Task type) key; state, assignee, reviewer, note, reviewed_by, reviewed_at, delivered_at; clip version); assign / reassign / unassign APIs — labels physically stay on the Clip, assignment only decides who may write; label-write endpoints gain the fine permission check (current user is assignee and state allows) + optimistic version (mismatch 409); `/admin/assignments` board v1: Unassigned / Labeling columns, in-row assign and reassign. Initial transition: assignment means Labeling.

**Blocked by:** 10.

Status: READY

- [ ] compose seam: after assignment the assignee writes labels successfully; any other user gets 403; after reassignment the old assignee gets 403, the new one succeeds, and existing labels survive; unassignment leaves no one able to write and labels intact
- [ ] compose seam: two interleaved clients — A holds a version, B writes in between, A's retry must 409; retrying with the fresh version succeeds
- [ ] e2e: admin assigns on the board → annotator's desk becomes writable; board row states match the lists
