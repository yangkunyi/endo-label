# desk-modern-player/05 — Full desk e2e closeout

**What to build:** Walk the whole desk with the new player, timeline, and tokens: adapt old e2e assertions that used the seek slider, custom rate, or band-in-panel; retire dead cases; confirm span paint (chip + Mark from / Apply / Remove, i/o/[] keys) still works with the new timeline; confirm Now/Library/summary unchanged. Full test suite (pytest, vitest, tsc, playwright) green.

- [x] Old e2e assertions adapted (no seek slider, no custom rate, timeline under the player)
- [x] Span paint (chip, Mark from/Apply/Remove, i/o/[]) covered on the new timeline
- [x] Now, Library, summary, Task focus unchanged and covered
- [x] pytest + vitest + tsc + playwright all green

## Answer

Playwright closeout only. Footer has no seek slider / media-chrome / custom rate `<select>`; JPEG and video both use media-chrome + timeline under the player + Playhead. Span paint (chip, Mark from/Apply/Remove, i/o/[] keys) writes the new lane-head timeline. Now/Library/summary/Task-focus tests kept. Retired `text-xs` class assert. Keyboard test pauses after focusing the player so mark-from cannot race playback.

pytest 95 passed 1 skipped; vitest 28; tsc 0; playwright 23.
