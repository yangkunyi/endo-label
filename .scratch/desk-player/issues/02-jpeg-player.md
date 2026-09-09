# 02 — JPEG player chrome

**What to build:** A jpeg Clip plays in an in-page player: play/pause, seekable progress, clock `m:ss` at 25 fps, rate control, Frame index as small print. Space toggles play when not typing. Play does not loop. The picture stays contained. Playhead Frame still drives whatever right rail exists. Rate does not change labels or fps mapping.

**Blocked by:** 01 — Catalog: kind + path

Status: MERGED

- [x] Opening a jpeg Clip shows a player, not a frame slider as the primary transport
- [x] Play/pause, seek, clock, rate, and small Frame index work; Space play/pauses outside inputs; no loop
- [x] JPEG stays object-contained; playback rate does not write labels
- [x] Playwright covers play, seek, clock, and Frame print on a jpeg Clip
- [x] Task-focus rail, timeline band, and `<video>` are out of this ticket

## Answer

JPEG Clips play in a Player region: 25 fps clock (`m:ss / m:ss`), Seek range, 0.5×/1×/2× rate, small Frame print. Space play/pauses outside inputs; play stops at the last Frame. Right rail unchanged.

## Comments
