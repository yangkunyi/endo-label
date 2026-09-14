# desk-tables/03 — Desk-wide phase and class-tag rename

**What to build:** Double-click a phase or class-tag name in its table, commit a new string: that desk list is renamed and every Clip document of that kind that stored the old string is rewritten in one request. Empty and duplicate names are rejected and the old name stays on disk. A class-tag rename does not change triplet instrument (or verb/target) strings. Triplet cell edits stay this-row-on-this-Frame; typing a new triplet word still only adds to that list and uses it here.

- [x] One rename request per list (`phases` or `class_tags`) with `{from, to}` rewrites that list and every Clip document of that kind, or fails with no Clip left partially renamed
- [x] Blank `to` and a `to` that already exists on that list are rejected; the old name remains on the list and on every Frame
- [x] Double-click a phase or class-tag table name, commit the new string, and the table plus every Clip of that kind show the new name; other Task types on those Frames are unchanged
- [x] Renaming a class tag named the same as a triplet instrument leaves the triplet documents untouched
- [x] Double-click a triplet cell still changes only that row on this Frame; it does not rename other Frames or other Clips
- [x] Vocab delete and rename of the instruments / verbs / targets lists are out of this ticket
- [x] Compose tests rewrite two Clips, reject duplicate and blank, and prove class-tag rename does not alter triplet strings; Playwright covers double-click rename on phase and class tables and that a triplet cell edit does not rename other Frames

## Answer

`POST /api/vocab/{phases|class_tags}/rename` with `{from, to}` rewrites that list and every Clip JSON of that kind (clip files first, then vocab; on failure already-written Clips are restored). Blank `to` is 400, duplicate `to` is 409; old strings stay. Class-tag rename does not touch triplet documents. Double-click a phase or class-tag name to commit the new string. Triplet cell edit still PUTs that row on this Frame only.
