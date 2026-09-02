# 02 — Both Clip kinds play in one shadcn Video Player

**What to build:** The desk player is the shadcn Video Player transport (media-chrome): play/pause, progress, time, rate, fullscreen. JPEG Clips play their transcoded file; video Clips play their own file. The custom rate selector, self-built clock, and bottom seek slider are gone (the Playhead is the seek). Seeking updates Now. Playwright: video element present for both kinds, seek updates Now, no seek slider in the footer.

**Blocked by:** 01 — JPEG Clip lazily transcodes to mp4 with cache

**Status:** resolved

- [x] JPEG and video Clips both play through the same Video Player transport
- [x] No custom rate selector or self-built clock left in the desk
- [x] No seek slider in the footer; seeking the player updates Now
- [x] Playwright covers video element present for both kinds and seek-updates-Now

## Answer

Both Clip kinds play through one media-chrome Video Player (shadcn-style local component). Custom rate select, self-built clock, footer seek slider, and JPEG timer all removed. Seeking updates Now via timeupdate→scrub. Space guard avoids double-toggle with media-chrome's own keyboard shortcuts.

Commit `5cc04cc` on `main`.