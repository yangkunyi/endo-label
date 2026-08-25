# 05 — Triplet rows on the desk

**What to build:** On the current Frame, the labeler adds and deletes triplet rows (instrument, verb, target) with no Track. Several rows allowed, including duplicate triples. Unknown names rejected. Labeler can add instrument / verb / target names to the desk lists and then use them. Rows do not copy to the next Frame. Phase and class stay put. Session stays off.

**Blocked by:** 04 — Toggle class on the desk

**Status:** resolved

- [x] Add a row on the current Frame; several rows allowed; identical triples allowed
- [x] Row has an id unique among current rows on that Frame; no Track field
- [x] Delete one row by id; last row gone → Frame unlabeled for triplet
- [x] Unknown instrument, verb, or target rejected
- [x] Add names to the three lists (reject blank/duplicate), then add a row that uses them
- [x] Rows on Frame `i` do not appear on Frame `i+1` unless added there
- [x] Phase and class on this Frame unchanged; Session inactive
- [x] Current Frame’s rows listed with delete; restart still returns them

## Answer

Desk `/clips/:clipId` shows a triplet panel next to class. Add a row on the current Frame via `POST /api/triplet/{clip}/frames/{i}` (several rows, identical triples, integer id unique among current rows, no Track). Delete is `DELETE /api/triplet/{clip}/frames/{i}/{id}`; last row gone drops the Frame key. Names not on `GET /api/vocab` `instruments` / `verbs` / `targets` return 400 and do not write. Add-name is `POST /api/vocab/{instruments|verbs|targets}` (blank 400, duplicate 409); that name can then be used in a row. Rows on Frame `i` stay off Frame `i+1` unless added there. phase, class, and Session stay untouched. A new app on the same `labels_root` still returns the rows.

Tests: `tests/test_compose.py` (compose HTTP). Front helpers: `web/src/api.test.ts` (`frameTripletRows`, triplet paths).
