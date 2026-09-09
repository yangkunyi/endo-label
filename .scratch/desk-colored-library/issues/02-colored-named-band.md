# 02 — Colored named intervals on the focused-kind band

**What to build:** Each label identity (phase name, class tag, exact triple) has a stable color. Library, Now, and the focused-kind timeline use that color. Each labeled interval shows the name on or immediately above the bar. Unlabeled gaps stay dim and unnamed. Clicking an interval still seeks to its start. No color field on disk. Playwright: two different names get different colors; the matching interval shows the name.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] Two different phase or class names get different colors that match across Library, Now, and the band
- [x] Labeled intervals show the name on/above the bar; unlabeled gaps have no name
- [x] Band remains a fold of sparse JSON; click still seeks to interval start
- [x] Playwright covers name-on-bar and different-colors-for-different-labels
- [x] Now-readonly and triplet 3-column rows are out of this ticket unless already present

## Answer

Stable `labelColor` on Library, Now, and named timeline intervals. Unlabeled gaps stay dim. Triplet Library list color waits on 03 rows.

Commit `9701452` on `main`.
