# 04 — Lane bars seek under the pointer, paint on empty drag, Shift-select, trim, Backspace

**What to build:** A Lane is a paint and edit surface, not display-only. Unmodified click on a colored bar seeks to the Frame under the pointer (not the bar’s first Frame) and clears bar selection. Click on empty track with no drag also seeks. Drag on empty track paints that Lane’s identity on the inclusive press–release range. Hold Shift and click a bar to toggle that folded segment in the selection with no seek; Shift-click adds or removes; selected bars show an outline. Backspace/Delete (not while typing) drops each selected segment of that identity only. Escape clears selection without disk writes. Drag either end of a **selected** bar, then release, trims that segment (expand paints, shrink removes). Drag the middle of a filled bar does not move it. No marquee. Bottom Remove stays the Brush + In–Out eraser. The player MediaTimeRange and the Ruler do not delete labels. No sticky select mode. Do not run or edit Playwright; ticket 06 rewrites the old “bars are display-only / click seeks to start” cases.

**Blocked by:** 01 — Lane well is a reserved strip; picture height does not follow Lanes.

Status: MERGED

- [x] Click a colored bar (no Shift, no drag) seeks to the Frame under the pointer and clears bar selection
- [x] Click empty Lane with no drag seeks; drag empty Lane paints that identity on min–max Frames inclusive
- [x] Shift-click a bar selects it without seeking; Shift-click another adds; Shift-click a selected bar deselects
- [x] Selected bars have a clear outline; Escape clears selection; Clip or Task-focus change clears it
- [x] Backspace/Delete drops selected segments of that identity only; stacked class flags on the same Frames stay
- [x] Drag ends of a selected bar, pointer up, trims; drag middle of a filled bar does not relocate the segment
- [x] No marquee-drag to select; Remove (button) still range-erases the current Brush across Mark from–current (or this Frame)
- [x] MediaTimeRange and Ruler still do not delete labels; `i` is still Mark from, not a select mode
- [x] `tsc` green. Do not run or edit Playwright (`web/e2e/desk.spec.ts` is ticket 06)

## Answer

A Lane is a paint and edit surface. Unmodified click on a colored bar seeks the Frame under the pointer (`frameFromClientX`, same bins as the Ruler) and clears bar selection. Empty-track click seeks; empty-track drag POSTs that Lane’s identity on min–max Frames inclusive. Shift-click toggles a folded labeled segment (no seek); selected bars show an inset primary ring (`data-selected`). Backspace/Delete (not while typing) inverse-span each selected segment of that identity only. Escape and Clip or Task-focus change clear selection with no disk write. Drag ends of a selected bar, pointer up, trims (expand paints, shrink removes); drag middle seeks and does not relocate. No marquee. Bottom Remove stays the Brush + In–Out eraser. Ruler and MediaTimeRange do not delete. `i` is still Mark from.

Commit `bcfac6f` on `dev1`. `tsc` 0; vitest 38. Playwright not run or edited. Nested `/code-review` spawn failed (`not_found`); Standards and Spec axes skipped.
