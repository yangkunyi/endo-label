# desk-colored-library/01 — Read-only Now; Library is the this-Frame toggle

**What to build:** Now shows this playhead Frame’s labels for the focused Task type and does not write. No ×, no delete, no click-to-toggle on Now. Phase overwrite / unlabeled, class flag toggle, and unique-triplet toggle happen only by clicking Library (or Remove span). **+** still adds vocab only. Playwright: Library click still writes this Frame; Now has no control that writes.

- [x] Now for phase, class, and triplet has no ×, delete, or click-to-write
- [x] Library click still writes this playhead Frame (phase overwrite or clear, class toggle, triplet unique toggle)
- [x] **+** still does not write a Frame
- [x] Playwright covers Library write and Now-does-not-write
- [x] Colors, named bars, and triplet 3-column rows are out of this ticket

## Answer

Now is display-only. This-Frame phase/class/triplet writes stay on Library click (or Remove span). **+** still vocab-only.

Commit `61ea822` on `main`.
