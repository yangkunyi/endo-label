# 03 — Full desk e2e closeout

**What to build:** Walk the whole desk after 01–02. Trash-clears-Brush regression in the browser (trash a Brushed name, footer chip disappears, other kinds keep theirs). Transport walkthrough: Space, rate menu, mute/volume, fullscreen, time display, Ruler-only seek on both Clip kinds. Span paint flows keep working with the new chrome: `i`/`[` Mark from, `o`/`]` Apply, Remove, drag-empty paint, Shift-click + Backspace, eye hide/show. Lane well geometry and Task-focus behavior unchanged. Keyboard shortcuts ignored while typing. English copy on all new controls. Full suite green; no new Python tests.

**Blocked by:** 01 — Trash clears the Brush. 02 — Hand-built transport replaces media-chrome.

**Status:** ready-for-agent

- [ ] Trash a Brushed identity in the browser: footer chip disappears, surviving kinds' chips and colors stay
- [ ] Transport walkthrough on JPEG and video: play/pause, rate list applies, mute/volume, fullscreen, time display; Ruler is the only seek
- [ ] Span paint flows (Mark from / Apply / Remove, `i`/`o`/`[`/`]`, drag-empty, Shift-click + Backspace, eye) green with the hand-built transport
- [ ] Lane well reserved height and picture stability assertions still green; Task-focus switch keeps each kind's Brush
- [ ] Keyboard shortcuts ignored while typing in an input or combobox
- [ ] New controls use English copy throughout
- [ ] Full Playwright desk suite passes with 0 failures; vitest and `tsc` green; pytest stays green with no new Python tests
