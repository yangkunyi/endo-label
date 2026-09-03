# 05 — Full desk e2e closeout

**What to build:** Walk the whole desk with the rate menu, filled Now, Ruler, spanning timeline, and editor hairlines. Adapt or retire assertions that assumed a cycling rate button, an embedded progress range, a left-stripe-only Now, or a timeline confined to the Player column. Confirm span paint (chip + Mark from / Apply / Remove, i/o/[ ] keys) still works. Full suite (pytest, vitest, tsc, playwright) green.

**Blocked by:** 01 — Rate menu with slow speeds; 02 — Now fills with the label color; 03 — Ruler under the picture; timeline spans Clips+Player; Playhead drags on the Ruler; 04 — Hairlines between Now, Library, and List

**Status:** ready-for-agent

- [ ] Old cycling-rate and chrome-progress assertions are gone or updated
- [ ] Span paint still works with the Ruler and spanning timeline
- [ ] Now / Library / summary still match colored-library behavior except Now fill
- [ ] pytest, vitest, tsc, and playwright are green
