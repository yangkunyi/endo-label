# desk-ruler/03 — Ruler under the picture; timeline spans Clips+Player; Playhead drags on the Ruler

**What to build:** Hide the embedded player progress bar. An always-on Ruler sits flush under the picture; label lanes sit below it. An empty Clip has the Ruler only (no unnamed dim lane). The timeline row spans Clips+Player: lane-head width follows the Clips rail; colored bars occupy only the Player column and do not paint into the Clips list. Playhead drags on the Ruler (frame-snapped); the stem may cross lanes but does not capture pointer; clicking a bar seeks to that interval's start; bars stay not draggable. Player keeps play, time, duration, rate, mute, volume, fullscreen. This is the geometry try (ADR 0018). Playwright: no chrome progress range; Ruler on an empty Clip; drag on Ruler seeks; bar click seeks to start; bars not draggable; timeline outside Editors.

- [x] Embedded progress bar is gone; other player transport stays
- [x] Ruler is flush under the picture; lanes are below it
- [x] Empty Clip shows the Ruler only
- [x] Timeline row spans Clips+Player; lane-head width follows the Clips rail; bars align with the picture
- [x] Playhead drags on the Ruler; stem does not steal bar clicks; bars are not draggable
- [x] Playwright covers Ruler seek, empty-Clip Ruler, bar click, and no chrome range

## Answer

Hid `MediaTimeRange`. Timeline is one row under Clips+Player: lane-heads use `clipRailWidth`, bars sit in the Player column. Always-on Ruler is flush under the picture (outside the lane scroller); empty Clip is Ruler only. Playhead drags on the Ruler (frame-snapped); stem is `pointer-events: none`; bar click seeks to interval start. Playwright: `empty Clip shows Ruler only; chrome has no progress range` and updated playhead drag/bar tests in `web/e2e/desk.spec.ts`.

Commits `c9a9bbc` (geometry + Ruler) and `8deefff` (Ruler stays above scrolling lanes).
