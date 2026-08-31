# 03 — Paint chip, Mark from, Apply/Remove

**What to build:** The last this-Frame write is a visible paint chip. Mark from (`[` / `I`) pins one slider end; the current Frame is the other; fill + `from → to` numbers. **Apply to frames** and **Remove from frames** POST that chip (real writes, numbers in the label). No chip: Mark from, Apply, Remove, and the keys do nothing. `]` / `O` always Apply, never Remove. Success: toast + slider flash; from clears; chip stays. Failure: red toast, no flash. No direction-toggle button that does not write. No “span mode” copy. Play pauses on a successful interval write.

**Blocked by:** 02 — shadcn Pick+Create desk; HeroUI gone

**Status:** resolved

- [x] Chip shows Task type + payload from the last this-Frame Pick+Create; a later pick replaces the chip and does not clear Mark from
- [x] Mark from + scrub + Apply writes the chip across the inclusive range via existing span HTTP; Remove posts the inverse for that chip
- [x] Apply/Remove without Mark from affect this Frame only; buttons show Frame numbers; empty chip writes nothing
- [x] `]` / `O` = Apply only; `[` / `I` = Mark from; keys ignored in inputs; no write-vs-remove toggle control
- [x] Success toast names the chip and Frames; slider flashes; from clears; chip remains; failure is red toast without flash
- [x] Playwright covers chip, Mark from fill, Apply write, Remove, toast/flash, dead controls with no chip, and no Arm / no lying HUD

## Answer

Footer shows the paint chip from the last this-Frame Pick+Create. Mark from / `[` / `I` pin one slider end; Apply / `]` / `O` POST the chip; Remove posts the inverse. Empty chip disables those controls. Success toast + slider flash; from clears; chip stays.
