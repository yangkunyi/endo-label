# 02 — Brush replaces the paint chip; Library name stays this-Frame

**What to build:** Interval payload is **Brush**, a sitting set per Task focus, not the last this-Frame write. Library name (or Triplet row body) still toggles this Frame only and does not arm Brush. A dedicated Brush control on the row (`aria-label` `Brush`, `aria-pressed`) toggles membership with no HTTP. Footer lists the current Brush with color; an × on a footer chip drops that identity. Empty Brush disables Mark from, Apply, Remove, `i`, `[`, `o`, and `]`. `i`/`[` stay Mark from; `o`/`]` stay Apply, never Remove. Changing Clip keeps Brush and clears Mark from. Changing Task focus keeps each kind’s Brush. Apply without Mark from writes this Frame. A successful Apply toasts the range, clears Mark from, and keeps Brush. A failed Apply shows a red toast and leaves disk and Mark from unchanged. One identity is enough for this ticket; several identities are ticket 03. Do not run or edit Playwright; ticket 06 rewrites chip stories to arm Brush.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Library name click still toggles this Frame only; it does not put that identity in the Brush and does not skip a Frame write when the labeler intended this-Frame
- [x] Brush control arms or disarms without writing a Frame; `aria-pressed` reflects membership
- [x] Footer shows the Brush (not “No paint chip”); × removes one identity from the Brush
- [x] Empty Brush: Mark from / Apply / Remove / `i` / `[` / `o` / `]` do nothing
- [x] Clip change keeps Brush; Mark from clears
- [x] Task focus change keeps each kind’s Brush
- [x] Apply without Mark from writes the Brush on this Frame; other identities on those Frames stay
- [x] Success toast then Mark from clears, Brush stays; failed Apply toasts red, disk and Mark from unchanged
- [x] vitest: Brush membership toggle (in/out) for the focused kind; Clip change keeps Brush and clears Mark from
- [x] `tsc` green. Do not run or edit Playwright (`web/e2e/desk.spec.ts` is ticket 06)

## Answer

Interval payload is Brush, stored per Task type in `deskStore` (`class` / `triplet` / `phase`). Library name still writes this Frame only. Row control `aria-label="Brush"` toggles membership with no HTTP. Footer lists the focused Brush; × drops one. Empty Brush disables Mark from / Apply / Remove / `i` `[` `o` `]`. Clip change keeps Brush and clears Mark from. One identity per kind this ticket; several identities stay ticket 03.

Commit `a8b5a9b` on `dev1`. `tsc` 0; vitest 34. Playwright not run. Class/triplet Brush is still one-slot (second pick replaces); ticket 03 opens the set.
