# 04 — Focused-kind timeline band

**What to build:** Under the player, one band shows the focused Task type along the Clip. Consecutive equal values fold into intervals (display only). Gaps read as unlabeled. Clicking a folded interval seeks to its start. Switching focus rebuilds the band. Sparse JSON is unchanged. Interval paint still uses existing span HTTP and must remain a real write (toast).

**Blocked by:** 03 — Task-focus rail: Now, Library, summary

**Status:** resolved

- [x] Band shows only the focused kind; phase/class/triplet each fold consecutive equals
- [x] Clicking an interval seeks the player to that start; unlabeled gaps are visible
- [x] Changing Task focus rebuilds the band; no new interval document on disk
- [x] Span Apply/Remove still persist via existing HTTP with obvious success
- [x] Playwright covers a painted phase (or class) folding into a band and seek-on-click
- [x] Video `<video>` is out of this ticket

## Answer

Client-side fold of sparse phase/class/triplet JSON into a band under the JPEG player. Click seeks to interval start. Task-focus rebuilds lanes. Span HTTP unchanged.

## Comments
