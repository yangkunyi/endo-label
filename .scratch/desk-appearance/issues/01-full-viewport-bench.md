# 01 — Full-viewport bench

**What to build:** The Clip desk fills the window as a desktop labeling bench instead of a scrolling article. Thin top bar (Clips link, Clip id, Frame index of count). Vertical filmstrip on the left: one thumb per Frame, index, phase name or empty; current Frame highlighted; click scrubs only. Current JPEG in the center, contained, never cropped. Editors in a right rail in order class, triplet, phase. Left and right columns scroll inside themselves; the JPEG stays. `/` is still allowlisted Clip id + Frame count, same stone/emerald type — no progress %. All three editors stay fully open (folds are ticket 02) so today’s sitting still writes phase span, class chips, and triplet rows with the same clicks. No Task-focus, no mask tools, no shadcn, no new HTTP.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] `/clips/:clipId` fills the window under a thin top bar: Clips link, Clip id, `Frame {i}` and `of {N}` when the Clip has Frames
- [x] Left filmstrip: one thumb per Frame, index, phase name or empty; current Frame highlighted; click scrubs (no label write, no Session)
- [x] Center JPEG is contained, not cropped
- [x] Right rail order is class, then triplet, then phase; all three forms still fully visible
- [x] Left rail and right rail scroll inside themselves when the window is short; the JPEG does not scroll away
- [x] Desktop sitting only — no phone/tablet stack
- [x] `/` still lists Clip id + Frame count only; stone/emerald type matches the desk top bar; no coverage %
- [x] Existing Playwright still passes with no extra clicks: three headings in view, class chip toggle, Write span, Add row
- [x] Immediate persist, Zustand Frame index, Tailwind only — no shadcn, no mask chrome, no Task-focus switch

## Answer

`/clips/:clipId` is a `h-screen` bench in `web/src/ClipDesk.tsx`: thin top bar (Clips, Clip id, `Frame {i} of {N}`), left filmstrip (`overflow-y-auto`, one thumb + index + phase name, click calls `scrub` only), center JPEG `object-contain` in a black well, right rail class → triplet → phase with all three forms open. No `lg:` stack. Left/right rails scroll; the JPEG does not leave the viewport. `/` still lists Clip id + Frame count (no %). Folds stay ticket 02.

Playwright: existing three-heading / chip / Write span / Add row sitting; new test for vertical left filmstrip, contain, no page scroll, short window keeps the JPEG.
