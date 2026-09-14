# desk-colored-library/03 — Triplet Library and Now as instrument/verb/target rows

**What to build:** Triplet Library and Now are a three-column table: instrument, verb, target. Each row is one exact triple (one label). Clicking a Library row toggles that triple on this playhead Frame. **+** composes a row from three names (may create vocab names) and does not write a Frame; the row appears in Library. Rows are distinct triples on this Clip plus composed rows this sitting — not a cartesian product. Now is the read-only slice. Headers say instrument, verb, target. Playwright: row click toggles; **+** adds a Library row without writing the playhead Frame.

- [x] Triplet Library and Now are three columns; one row is one exact triple
- [x] Library row click toggles that unique triple on this Frame; Now does not write
- [x] **+** adds a Library row and does not write the playhead Frame until the row is clicked
- [x] No cartesian product of every instrument × verb × target
- [x] Playwright covers row toggle and + does-not-write

## Answer

Triplet Library and Now are three-column instrument/verb/target tables; one row is one exact triple (unique). Library row click toggles that triple on this Frame; Now read-only. **+** composes a row (may create vocab names) without writing a Frame. Composed rows survive Task focus switches this sitting.

Commits `4261147`, `6515224` on `main`.
