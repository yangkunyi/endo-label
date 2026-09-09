# 03 — Timeline under the player with a draggable Playhead, label once per lane

**What to build:** The focused-kind timeline moves out of the panel: full-width directly under the player. A Playhead marks the current Frame; it is draggable (frame-snapped) and click-to-seek works on lanes. One lane per label identity (phase name, class tag, exact triple); the label is written once at the lane head, never per block. Unlabeled gaps stay dim. Bars are display-only — not draggable. Many lanes scroll (thin scrollbar) while the player keeps its size. Playwright: lane head label once, Playhead drag seeks, bars not draggable, timeline is outside the editor panel.

**Blocked by:** 02 — Both Clip kinds play in one shadcn Video Player

Status: MERGED

- [x] Timeline sits full-width directly under the player, outside the editor panel
- [x] Playhead shows and seeks the current Frame; drag is frame-snapped; click seeks to interval start
- [x] One lane per label identity; label name written once at the lane head
- [x] Interval bars are display-only (not draggable); unlabeled gaps dim
- [x] Many lanes scroll; the player keeps its size
- [x] Playwright covers lane-head-once, drag-seek, and not-draggable bars

## Answer

Timeline sits full-width under the player (sibling of the Player region, not in Editors). One lane per label identity; name at the lane head only. Playhead is frame-snapped (`floor(frac * N)`); the knob drags, the stem does not steal interval clicks. Bars are display-only; unlabeled gaps dim; lanes scroll (`max-h-44`) while the player keeps `min-h-48`.

Commits `823b9a4` (fold/lanes/playhead) and `cab4151` (under-player layout + handle).
