# 02 — Collapsible forms with always-on summaries

**What to build:** On the bench from 01, unused *forms* fold. That is density, not Task-focus: all three Task types stay writable on the same Frame. Each of class, triplet, and phase is a card with a chevron; any subset may be open. Always-on summary (no expand): class chips still toggle; triplet rows still list with Delete; phase shows this Frame’s name or unlabeled plus Clear this Frame's phase. Class fold body is only the add-name disclosure — no second chip row. Phase form keeps picker, from/to, Write span. Triplet form keeps the three pickers and Add row. Add-name in each editor sits behind a closed disclosure. First open / reload / another Clip: phase form open, class body closed, triplet form closed, add-name closed. Folds remembered for this Clip across scrub (Zustand only, not disk, not URL); reset on reload or a different Clip. Playwright: chip and Write span still one click; Add row after expanding the triplet card; scrub does not slam folds.

**Blocked by:** 01 — Full-viewport bench

**Status:** resolved

- [x] Chevron on class, triplet, and phase; any subset of forms can be open at once
- [x] Class chips stay on the class header and toggle with no expand; no second chip row in the body
- [x] Triplet list + Delete stay on the summary with no expand
- [x] Phase name (or unlabeled) + Clear this Frame's phase stay on the summary with no expand
- [x] Class body, when open, is only the add-name disclosure
- [x] Phase form, when open, still has name picker, from/to, Write span
- [x] Triplet form, when open, still has instrument / verb / target and Add row
- [x] Add-name in each editor is behind a closed disclosure
- [x] Defaults: phase form open; class body closed; triplet form closed; all add-name closed
- [x] Fold state survives scrub on this Clip; resets on reload or opening a different Clip
- [x] Folding a form never locks the other Task types (not Task-focus)
- [x] Playwright: class chip and Write span need no extra click; Add row after expanding triplet; three headings still in view; scrub keeps triplet open if it was open

## Answer

Right-rail class / triplet / phase cards in `web/src/ClipDesk.tsx` now fold independently (chevron, `aria-expanded`). Always-on summaries: class chips toggle; triplet rows + Delete; phase name or unlabeled + Clear this Frame's phase. Class body is only the add-name `<details>`. Phase form (default open) keeps picker, from/to, Write span. Triplet form (default closed) keeps pickers + Add row. Add-name disclosures start closed.

Zustand in `web/src/deskStore.ts` holds `{ phaseForm, classBody, tripletForm }` for this Clip. Scrub keeps them. `openClip` on another Clip (or a new store after reload) restores defaults.

Playwright: chip and Write span still one click; Add row after expanding triplet; scrub keeps the triplet form; switching to `CLIP_E2E_B` restores defaults.
