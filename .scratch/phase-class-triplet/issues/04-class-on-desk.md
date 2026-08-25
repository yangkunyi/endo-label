# 04 — Toggle class on the desk

**What to build:** On the current Frame, the labeler toggles stackable class flags (chips), including several at once (e.g. `grasper` and `blurred`). Empty stack is unlabeled. Unknown names rejected. Labeler can add a class name to the desk list and then toggle it. Flags do not copy to the next Frame. Phase and triplet on this Frame stay put. Session stays off.

**Blocked by:** 03 — Paint phase on the desk

**Status:** resolved

- [x] Toggle a class name on and off for the current Frame; several names can be on at once
- [x] Same name at most once on a Frame; all off → unlabeled for class
- [x] Flags on Frame `i` do not appear on Frame `i+1` unless toggled there
- [x] Unknown class name rejected; blank/duplicate add rejected
- [x] Add a class name, then turn it on
- [x] Phase and triplet on this Frame unchanged; Session inactive
- [x] Chips for the current Frame are visible next to the JPEG
- [x] Restart still returns the flags

## Answer

Desk `/clips/:clipId` shows class chips next to the JPEG. Click toggles one name on the current Frame via read-modify-write `PUT /api/class/{clip}/frames/{i}` (unique tags, empty list drops the Frame key). Names not on `GET /api/vocab` `class_tags` return 400 and do not write. Add-name is `POST /api/vocab/class_tags` (blank 400, duplicate 409); that chip can then be turned on. Flags on Frame `i` stay off Frame `i+1` unless toggled there. phase, triplet, and Session stay untouched. A new app on the same `labels_root` still returns the flags.

Tests: `tests/test_compose.py` (compose HTTP). Front helpers: `web/src/api.test.ts` (`toggleClassTag`, `frameClassTags`).
