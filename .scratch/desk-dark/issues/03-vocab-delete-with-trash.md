# 03 — Vocab delete with trash

**What to build:** Each phase and class vocab row has a trash control besides x. Trash deletes that desk name and rewrites every Clip of that kind (phase unlabeled, class flag dropped), or fails with no Clip left half-updated. Under the triplet instance table, three compact name lists (instrument, verb, target) each have trash: that request is refused while any triplet row still uses the string. x still means this Frame only (clear phase, turn a class flag off, delete a triplet instance). Leftover seed names on an old `vocab.json` go away only when trashed.

**Blocked by:** 01 — Dark compact sitting; 02 — Empty vocab seed

**Status:** resolved

- [x] Phase and class rows show trash next to x; x still clears or turns off this Frame only and does not change the desk list
- [x] Trashing a phase or class-tag name is one request: the name leaves that list and every Clip document of that kind is rewritten, or the whole request fails with no partial Clip
- [x] Triplet instance rows have no vocab trash; three name lists under the table expose trash for instrument, verb, and target
- [x] Trashing an instrument, verb, or target name is refused while any triplet row still uses that string in that slot; the list and the rows stay as they were; after those rows are gone, trash succeeds
- [x] Trashing a class tag named the same as a triplet instrument leaves triplet documents untouched
- [x] Existing `vocab.json` names are not wiped at startup; trash is what removes leftover seed names
- [x] Compose covers two-Clip phase/class rewrite, refuse-if-in-use for triplet lists, and independence; Playwright covers trash vs x and a refused instrument delete
