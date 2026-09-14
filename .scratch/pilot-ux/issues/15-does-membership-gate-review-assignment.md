# pilot-ux/15 — Does Project membership gate review assignment too?

**Question.** `coordination.assign_reviewer` (`endo_label/coordination.py:1236`) never calls
`_membership_refusal`, so an Account can be made the reviewer of a Clip in a Project it does not belong
to. Every assignee path refuses that (`assign_item`, auto-assign, batch-assign), and ADR 0028 is titled
"membership gates assignment" — but its body, and ticket 12, enumerate only the assignee paths, so the
closeout review left this open rather than calling it a defect. The board already promises the refusal:
`web/src/batchAssign.ts:145` and `web/src/AssignmentsBoard.tsx:431,438` render a "Not a member" skip for
reviewer actions the server can never produce.

**Options.**

1. Membership gates the reviewer as well. One `_membership_refusal` call in `assign_reviewer`, plus a
   test; the board's skip sentence becomes true; "a Project's membership is who works on it" stays one
   rule, since reviewing is work on it.
2. Membership gates only who *holds* work. A reviewer may come from outside the Project; the board's
   skip sentence for reviewer actions goes away, and ADR 0028 says reviewer is exempt.

**Recommendation:** 1 — one rule is easier to hold in the head than two, and the UI already promises it.

**Answered (2026-09-14, owner): option 1.** A Project's membership is who works on it and reviewing is
work on it, so membership gates the reviewer as well; the desk's pickers already behave that way and the
server is the only place that does not. The change is ticketed as `pilot-ux/16`.
