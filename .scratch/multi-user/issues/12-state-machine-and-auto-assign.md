# 12 — State machine and auto-assign

**What to build:** the full transition set as transactional check-and-sets (ticket 04 decision):

```
Unassigned → Labeling → Submitted → Reviewing → Done
```

No branch at submit; Done = reviewed-and-passed (reviewed_by/at required), the only terminal state; reject = Reviewing/Done → Labeling with a note; recall = Submitted → Labeling; re-review = Done → Submitted. Auto-balanced assignment endpoint: multi-select unassigned items, balance by holding count, filterable by batch/Task type. Board state columns completed (Submitted / Reviewing / Done) + in-row reviewer assignment (reviewer ≠ annotator enforced) + Submitted backlog visible at a glance.

**Blocked by:** 11.

Status: READY

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: each legal transition asserts the resulting state and fields (note, reviewed_by, reviewed_at); illegal ones (e.g. Labeling → Done directly) are refused
- [ ] compose seam: two clients race the same transition — one wins, one loses, the stored state stays consistent
- [ ] compose seam: reviewer = annotator refused; auto-balance distribution matches holding counts
