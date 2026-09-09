# 02 — Persistent layout and editor order

**What to build:** The labeler can shape the desktop workbench to fit the sitting: drag the Clip rail, editor rail, and bottom bar boundaries, and drag editor cards into a preferred order. The selected sizes and order are restored after refresh on the same machine, while invalid or missing saved values fall back to usable desktop defaults.

**Blocked by:** 01 — Single-page HeroUI workbench

Status: MERGED

- [x] Clip rail width, editor rail width, and bottom-bar height can each be changed by pointer drag
- [x] The three editor cards can be reordered by drag, with class, triplet, phase as the default order
- [x] Sizes and order are stored in localStorage and restored after a page reload
- [x] Stored values are bounded so they cannot hide the JPEG, editors, or Frame controls
- [x] Fold state and always-on summaries continue to work after resizing, reordering, scrubbing, and opening another Clip
- [x] Browser tests verify drag changes and persistence across reload without introducing page scroll on the desktop viewport

## Answer

The workbench now stores bounded Clip-rail width, editor-rail width, bottom-bar height, and editor order in localStorage. Pointer separators resize the three regions, and editor cards can be dragged into a new order. Defaults remain class → triplet → phase; invalid saved layout falls back to those defaults. Existing folds and summaries remain independent.

Verification: existing unit, build, lint, and Playwright checks pass, plus layout normalization coverage.
