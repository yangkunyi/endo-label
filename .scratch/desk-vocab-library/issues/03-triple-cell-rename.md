# desk-vocab-library/03 — Double-click a Vocab triple cell rewrites desk-wide; collision refuses

**What to build:** Double-click one cell of a Vocab triple to change that word. Every matching triplet row on every Clip rewrites to the new exact triple. If any Frame would then hold two identical triples, the request is refused and Frames are unchanged. Empty or duplicate names rejected. Playwright: happy rename and a collision that stays put.

- [x] Double-click a cell rewrites that Vocab triple on every Clip
- [x] A rename that would duplicate an exact triple on a Frame is refused
- [x] Refused rename leaves Frames unchanged
- [x] Playwright and compose cover success and collision

## Answer

Double-clicking any cell (`instrument`, `verb`, or `target`) of a Vocab triple turns that cell into an inline `<Input>`, committing on Enter via `POST /api/vocab/triples/rename`. The endpoint uses `labels_store.rename_vocab_triple` to check every clip for collisions; if any frame would duplicate an exact triple, `TripletFrameCollision` (409) is raised and no files are written. On success, all matching frame rows across all clips rewrite atomically with half-failure restore. Tested with 181 lines of compose tests and Playwright happy+collision e2e.
