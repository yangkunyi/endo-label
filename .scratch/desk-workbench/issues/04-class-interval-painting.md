# desk-workbench/04 — Class interval painting

**What to build:** The labeler can arm one class flag for interval painting as either on or off. When the span gesture closes, the desk sends one class span request that unions the selected tag onto every Frame or removes only that tag, preserving all other flags. Current-Frame chip toggles and class-name creation remain separate immediate writes.

- [x] The class backend accepts an inclusive, order-insensitive span with a tag and on/off operation
- [x] Class span writes are one durable document update per request and reject out-of-range Frames or unknown class names without partial changes
- [x] Painting on is idempotent and preserves other class flags; painting off removes only the selected flag and drops an empty Frame entry
- [x] The desk exposes independent class arming and clearly shows the class name plus on/off operation in the HUD
- [x] Multiple armed targets can coexist with phase and later triplet targets; a class span does not alter phase, triplet, or Session state
- [x] Existing chip toggles, Add class name, immediate persistence, and current-Frame-only behavior remain unchanged
- [x] Compose tests cover union, removal, idempotence, independence, range validation, vocab validation, and persistence; browser tests cover arming and HUD output

## Answer

Added `POST /api/class/{clip}/span` with inclusive, order-insensitive ranges, tag membership validation, and `on`/`off` operations. On unions one tag while preserving other flags and is idempotent; off removes only that tag and removes empty Frame entries. The desk adds independent class target, operation, and arming controls; the span keyboard handler writes phase and class targets in one gesture and shows them in the HUD. Current-Frame chip behavior remains unchanged.

Verification: `.venv/bin/pytest -q` (57 passed, 1 skipped), web unit tests (27), lint, typecheck, build, and Playwright (6) pass.
