# 05 — Full desk e2e closeout

**What to build:** Walk the whole desk with the new player, timeline, and tokens: adapt old e2e assertions that used the seek slider, custom rate, or band-in-panel; retire dead cases; confirm span paint (chip + Mark from / Apply / Remove, i/o/[] keys) still works with the new timeline; confirm Now/Library/summary unchanged. Full test suite (pytest, vitest, tsc, playwright) green.

**Blocked by:** 01 — JPEG Clip lazily transcodes to mp4 with cache; 02 — Both Clip kinds play in one shadcn Video Player; 03 — Timeline under the player with a draggable Playhead, label once per lane; 04 — Linear-style tokens over the shadcn kit

**Status:** ready-for-agent

- [ ] Old e2e assertions adapted (no seek slider, no custom rate, timeline under the player)
- [ ] Span paint (chip, Mark from/Apply/Remove, i/o/[]) covered on the new timeline
- [ ] Now, Library, summary, Task focus unchanged and covered
- [ ] pytest + vitest + tsc + playwright all green
