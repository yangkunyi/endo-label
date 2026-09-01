# 03 — Timeline under the player with a draggable Playhead, label once per lane

**What to build:** The focused-kind timeline moves out of the panel: full-width directly under the player. A Playhead marks the current Frame; it is draggable (frame-snapped) and click-to-seek works on lanes. One lane per label identity (phase name, class tag, exact triple); the label is written once at the lane head, never per block. Unlabeled gaps stay dim. Bars are display-only — not draggable. Many lanes scroll (thin scrollbar) while the player keeps its size. Playwright: lane head label once, Playhead drag seeks, bars not draggable, timeline is outside the editor panel.

**Blocked by:** 02 — Both Clip kinds play in one shadcn Video Player

**Status:** ready-for-agent

- [ ] Timeline sits full-width directly under the player, outside the editor panel
- [ ] Playhead shows and seeks the current Frame; drag is frame-snapped; click seeks to interval start
- [ ] One lane per label identity; label name written once at the lane head
- [ ] Interval bars are display-only (not draggable); unlabeled gaps dim
- [ ] Many lanes scroll; the player keeps its size
- [ ] Playwright covers lane-head-once, drag-seek, and not-draggable bars
