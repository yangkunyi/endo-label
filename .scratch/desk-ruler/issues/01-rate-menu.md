# 01 — Rate menu with slow speeds

**What to build:** The player rate control is a media-chrome menu (click opens a list, does not cycle). Rates: `0.25 0.5 1 1.5 2`. Default stays `1`. Same control on jpeg and video Clips. No custom rate widget. Playwright: opening the control shows `0.25`.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Rate control opens a list rather than cycling on click
- [x] The list includes `0.25`, `0.5`, `1`, `1.5`, and `2`
- [x] Default rate on a newly opened Clip is `1`
- [x] jpeg and video Clips share this control
- [x] Playwright covers the menu including `0.25`

## Answer

Replaced `MediaPlaybackRateButton` with media-chrome `MediaPlaybackRateMenu` + `MediaPlaybackRateMenuButton` (`rates={[0.25, 0.5, 1, 1.5, 2]}`). Same `VideoPlayer` for jpeg and video. Default stays browser `1`. Playwright: opening the control shows `0.25x` on CLIP_E2E and CLIP_VID; click does not cycle.
