# desk-workbench/05 — Triplet interval painting

**What to build:** The labeler can arm one triplet as either add or remove for interval painting. Closing the span gesture sends one triplet span request: add the exact triple only where it is missing, or remove matching triples by name across the inclusive range. Current-Frame Add row and Delete actions remain separate immediate writes.

- [x] The triplet backend accepts an inclusive, order-insensitive span with instrument, verb, target, and add/remove operation
- [x] Triplet span writes are one durable document update per request and reject out-of-range Frames or unknown vocab names without partial changes
- [x] Add is idempotent for an exact triple and assigns valid per-Frame row ids; remove deletes matching triples by name without disturbing other rows
- [x] The desk exposes independent triplet arming and shows the full triple plus add/remove operation in the HUD
- [x] Multiple armed targets can coexist with phase and class targets; a triplet span does not alter phase, class, or Session state
- [x] Existing current-Frame Add row, Delete, vocab creation, immediate persistence, and duplicate-row behavior remain unchanged
- [x] Compose tests cover idempotent add, name-based removal, independence, range validation, vocab validation, and persistence; browser tests cover arming and HUD output

## Answer

Added `POST /api/triplet/{clip}/span` with inclusive normalized ranges, operation and vocab validation before mutation, idempotent exact-triple add, and name-based removal that preserves unrelated rows. The triplet editor now has independent instrument/verb/target, add/remove, and armed state; span gestures include triplet targets in the shared HUD and write path. Existing current-Frame Add row and Delete behavior remains separate.

Verification: web unit tests (29), typecheck, and lint pass. Python compose tests were not run by the child because system `pytest` was unavailable.
