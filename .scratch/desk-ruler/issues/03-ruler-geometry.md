# 03 — Ruler under the picture; timeline spans Clips+Player; Playhead drags on the Ruler

**What to build:** Hide the embedded player progress bar. An always-on Ruler sits flush under the picture; label lanes sit below it. An empty Clip has the Ruler only (no unnamed dim lane). The timeline row spans Clips+Player: lane-head width follows the Clips rail; colored bars occupy only the Player column and do not paint into the Clips list. Playhead drags on the Ruler (frame-snapped); the stem may cross lanes but does not capture pointer; clicking a bar seeks to that interval's start; bars stay not draggable. Player keeps play, time, duration, rate, mute, volume, fullscreen. This is the geometry try (ADR 0018). Playwright: no chrome progress range; Ruler on an empty Clip; drag on Ruler seeks; bar click seeks to start; bars not draggable; timeline outside Editors.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Embedded progress bar is gone; other player transport stays
- [ ] Ruler is flush under the picture; lanes are below it
- [ ] Empty Clip shows the Ruler only
- [ ] Timeline row spans Clips+Player; lane-head width follows the Clips rail; bars align with the picture
- [ ] Playhead drags on the Ruler; stem does not steal bar clicks; bars are not draggable
- [ ] Playwright covers Ruler seek, empty-Clip Ruler, bar click, and no chrome range
