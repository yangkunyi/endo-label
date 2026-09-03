# 01 — Rate menu with slow speeds

**What to build:** The player rate control is a media-chrome menu (click opens a list, does not cycle). Rates: `0.25 0.5 1 1.5 2`. Default stays `1`. Same control on jpeg and video Clips. No custom rate widget. Playwright: opening the control shows `0.25`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Rate control opens a list rather than cycling on click
- [ ] The list includes `0.25`, `0.5`, `1`, `1.5`, and `2`
- [ ] Default rate on a newly opened Clip is `1`
- [ ] jpeg and video Clips share this control
- [ ] Playwright covers the menu including `0.25`
