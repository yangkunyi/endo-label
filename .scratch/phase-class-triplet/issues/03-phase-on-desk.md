# 03 — Paint phase on the desk

**What to build:** On the current Clip, the labeler paints an exclusive phase span, clears this Frame, and adds a phase name to the desk list. Writes that use a name not on the list are rejected. Span is inclusive, order-insensitive, overwrites Frames in range, and does not touch class or triplet. Session stays off. Filmstrip shows each Frame’s phase (or unlabeled). Persist on each successful write.

**Blocked by:** 02 — Clip list and Frame scrub

**Status:** resolved

- [x] Paint span writes that phase on every Frame from `from` through `to` (swap if `from > to`; one Frame if equal)
- [x] Overlapping later span overwrites those Frames only
- [x] Clear this Frame’s phase; other Frames unchanged
- [x] Span outside `0..N-1` rejected; unknown phase name rejected
- [x] Add a new phase name (reject blank and duplicate); that name can then be painted
- [x] Unlabeled Frame shows as no phase; filmstrip shows the exclusive strip
- [x] class and triplet on those Frames unchanged; Session inactive
- [x] Restart still returns the written phase

## Answer

Desk `/clips/:clipId` paints exclusive phase on the current Clip. `POST /api/phase/{clip}/span` writes `from`–`to` (swap if reversed; one Frame if equal), overwrites overlap only, rejects a span outside `0..N-1` and a name not on `GET /api/vocab` `phases`. `PUT` with `phase: null` clears this Frame. Add-name is `POST /api/vocab/phases` (blank 400, duplicate 409); that name can then be painted. Filmstrip shows each Frame’s phase or empty; unlabeled is no key / “unlabeled”. class, triplet, and Session stay untouched. A new app on the same `labels_root` still returns the phase.

Tests: `tests/test_compose.py` (compose HTTP). Front helpers: `web/src/api.test.ts`.
