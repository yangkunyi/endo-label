# 03 — Span gesture and phase painting

**What to build:** The labeler paints phase intervals with keyboard gestures instead of numeric bounds. `[` or `I` marks the current Frame as the start; `]` or `O` writes the inclusive range, swapping reversed bounds. Pressing `]` without a start writes only the current Frame. The gesture pauses any active playback, shows the pending target in a slider HUD, and is ignored in editable controls. Phase remains an exclusive immediate write and keeps its existing validation and independence rules.

**Blocked by:** 01 — Single-page HeroUI workbench

**Status:** resolved

- [x] Phase no longer requires numeric from/to fields; the keyboard gesture paints the selected phase over an inclusive, order-insensitive range
- [x] A closing key with no marked start writes exactly the current Frame; a one-Frame range also succeeds
- [x] Reversed or out-of-range spans are handled according to the existing phase contract, with no partial write
- [x] `[`/`I` and `]`/`O` are ignored when focus is in an input, textarea, or select
- [x] The focused editor is used when no editor is armed, and the HUD identifies the phase target before writing
- [x] A successful phase span persists immediately, leaves class and triplet stores untouched, and pauses playback if it is running
- [x] Compose tests cover the phase span contract and browser tests cover the keyboard gesture, HUD, editable-field guard, and independence

## Answer

The phase editor now uses document-level `[`/`I` and `]`/`O` gestures. A start is kept for the current Clip, closing writes an inclusive normalized span, and closing without a start writes the current Frame. Editable controls consume the keys. The phase card can arm itself, otherwise the focused editor supplies the target; the bottom HUD shows the pending phase. Numeric from/to controls were removed.

Verification: web typecheck, unit tests, build, and the phase Playwright scenario pass. Python compose tests were not run because `pytest` is unavailable in the environment.
