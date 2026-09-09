# 03 — Full desk e2e closeout

**What to build:** Walk the whole desk after 01–02. Trash-clears-Brush regression in the browser (trash a Brushed name, footer chip disappears, other kinds keep theirs). Transport walkthrough: Space, rate menu, mute/volume, fullscreen, time display, Ruler-only seek on both Clip kinds. Span paint flows keep working with the new chrome: `i`/`[` Mark from, `o`/`]` Apply, Remove, drag-empty paint, Shift-click + Backspace, eye hide/show. Lane well geometry and Task-focus behavior unchanged. Keyboard shortcuts ignored while typing. English copy on all new controls. Full suite green; no new Python tests.

**Blocked by:** 01 — Trash clears the Brush. 02 — Hand-built transport replaces media-chrome.

**Status:** resolved

- [x] Trash a Brushed identity in the browser: footer chip disappears, surviving kinds' chips and colors stay
- [x] Transport walkthrough on JPEG and video: play/pause, rate list applies, mute/volume, fullscreen, time display; Ruler is the only seek
- [x] Span paint flows (Mark from / Apply / Remove, `i`/`o`/`[`/`]`, drag-empty, Shift-click + Backspace, eye) green with the hand-built transport
- [x] Lane well reserved height and picture stability assertions still green; Task-focus switch keeps each kind's Brush
- [x] Keyboard shortcuts ignored while typing in an input or combobox
- [x] New controls use English copy throughout
- [x] Full Playwright desk suite passes with 0 failures; vitest and `tsc` green; pytest stays green with no new Python tests

## Answer

No product code changed. `web/e2e/desk.spec.ts` gained two browser cases on the existing Playwright seam, and the English-copy case now also checks the transport labels.

Trash: arm class `clipper`, phase `Preparation`, and triple `BrushTrashTool / grasp / gallbladder`. Delete `clipper` — its footer chip is gone, Mark from disables, phase chip keeps `data-label-color`, triplet chip stays. Delete the triple — phase chip and color still there. Delete unbrushed `hook` — remaining chips do not move.

Transport walkthrough on `/clips/CLIP_E2E` and `/clips/CLIP_VID`: English Play / Playback rate / Mute / Volume / Fullscreen; time `0:00 / 0:00` (jpeg) and `0:00 / 0:04` (video); rate list sets `0.25`; Space starts playback (jpeg may already have ended — clip is ~0.08 s); mute/unmute/volume `0.4`; fullscreen on the Player section then `exitFullscreen`; footer has no slider; picture click does not change the Frame print; Ruler right-edge click lands on last Frame (`Frame 1 of 2` / `Frame 99 of 100`). `expectNoMediaChrome` still holds.

English copy: existing Brush / Show lane / Hide lane plus Transport Play, Playback rate, Mute, Volume, Fullscreen.

Span paint, Lane well, Task-focus Brush, typing-in-input, and the rest of the desk suite were already in `desk.spec.ts` from 01–02 / brush-lanes; they stayed green.

Playwright webServer moved to API `127.0.0.1:7894` + Vite `5194` so this tree does not reuse `7891`/`5191` (those ports already serve `/data3/yky/endo_label_dev1`). Sitting `7880`/`5173` untouched.

Validation: `tsc -b --noEmit` exit 0; oxlint 0 errors (1 pre-existing warning in `ClipDesk.tsx`); vitest 49 passed; Playwright desk suite 51 passed / 0 failed on `7894`/`5194`; pytest 106 passed, 1 skipped, no new Python tests.

