# 03 — Several identities in one Apply; Ruler and ghost preview

**What to build:** Class and triplet Brushes may hold several identities; one Apply writes all of them across the inclusive range (several existing span POSTs, Library/Vocab order, stop and toast on first failure). Phase Brush holds at most one name; picking a second replaces the first. While Mark from is set and Brush is non-empty, the Ruler highlights from–to (Playhead accent, not one identity’s color when several are armed). Visible Brush Lanes show ghost bars for that same range, distinct from committed bars (lower opacity or outline), with no pointer hit. Footer lists every armed identity. Do not run or edit Playwright; ticket 06 covers two-tag Apply and ghosts in the browser.

**Blocked by:** 02 — Brush replaces the paint chip; Library name stays this-Frame.

**Status:** resolved

- [x] Class Brush can hold several tags; one Apply turns each of them on across the range and leaves other flags untouched
- [x] Triplet Brush can hold several exact triples; one Apply adds each of them across the range
- [x] Phase Brush holds at most one name; a later pick replaces
- [x] Class/triplet Apply is one existing span POST per identity, in stable Library/Vocab order; a failed POST stops the loop, toasts red, and does not claim success for the rest
- [x] With Mark from set, the Ruler fills the inclusive from–to
- [x] Ghost bars appear on visible Brush Lanes for that from–to, look distinct from disk bars, and are not seek or select targets
- [x] vitest: phase replace; class toggle of a second tag
- [x] `tsc` green. Do not run or edit Playwright (`web/e2e/desk.spec.ts` is ticket 06)

## Answer

Class and triplet Brushes append on a second pick; toggling again drops only that identity. Phase still replaces. Apply/Remove loops one existing span POST per armed identity in Library/Vocab order; first failure toasts red, leaves Mark from, and does not toast success. With Mark from set and Brush non-empty, the Ruler fills from–to in Playhead indigo; visible Brush Lanes show 40% ghost bars (`pointer-events: none`). Footer lists every armed identity.

Commit `b019a6c` on `dev1`. `tsc` 0; vitest 36. Playwright not run. Nested `/code-review` spawn failed (depth-limit / not_found); Standards and Spec axes skipped.
