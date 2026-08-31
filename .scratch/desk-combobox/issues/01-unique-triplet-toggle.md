# 01 — Triplet this-Frame unique toggle (HTTP)

**What to build:** A Frame holds at most one row per exact triple. Posting that triple again on this Frame turns it off (deletes matching rows). Different triples still stack. Span add still skips a Frame that already holds the triple; span remove still deletes by name. Duplicate rows already on disk disappear when that triple is next written on that Frame. The desk UI may stay as it is.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Second POST of the same instrument/verb/target on this Frame removes that row (or every matching leftover row) and does not append
- [x] A different triple on the same Frame still adds a second row
- [x] Span add still skips Frames that already hold the triple; span remove still deletes by name
- [x] Phase and class documents are untouched by these triplet writes
- [x] Compose tests no longer allow identical triples; they cover toggle-off and leftover collapse
- [x] Desk chrome, shadcn, and interval gesture are out of this ticket

## Answer

This-Frame `POST /api/triplet/{clip}/frames/{i}` toggles: an exact triple already on the Frame is removed (all matching leftover rows); otherwise one row is appended. Span add/remove unchanged. Compose tests cover stack, toggle-off, leftover collapse, and phase/class independence.
