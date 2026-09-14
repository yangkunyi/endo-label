# desk-workbench/06 — Playback and full sitting verification

**What to build:** The labeler can watch a Clip through the workbench. Space toggles play/pause outside editable controls; playback scrubs Frames on a timer using selectable 1, 10, or 25 fps and an optional skip-every-N setting. Playback stops at the final Frame, never loops, writes no labels, opens no Session, and pauses after a successful span write. The full sitting is covered by focused compose and Playwright checks.

- [x] Space toggles playback and is ignored in input, textarea, and select controls
- [x] Playback offers fps values 1, 10, and 25, plus a skip-every-N control, with usable defaults and optional local persistence
- [x] Playback advances only through valid Frame indexes, stops at the last Frame, and does not loop or write any label store
- [x] Starting or stopping playback never opens a Session; a successful span write pauses playback
- [x] The HUD lists every armed target with Task type, label or triple, and on/off operation; with no armed target it shows the focused editor payload
- [x] Browser checks cover Clip opening, slider scrubbing, playback, HUD, multi-target phase/class writes, focused fallback, current-Frame chip behavior, persisted layout/order, and no Frame filmstrip
- [x] Compose checks cover all new span routes together with independence, immediate persistence, out-of-range rejection, unknown-vocab rejection, and Session remaining inactive

## Answer

Added playback state and controls with localStorage-backed fps (1, 10, 25) and skip-every-N settings. Space toggles playback only outside editable controls; the timer scrubs valid Frame indexes, stops at the final Frame, and never loops. Playback does not write labels or open a Session, and successful span writes pause it. The final Playwright coverage exercises playback, settings persistence, HUD, multi-target spans, focused fallback, layout persistence, and the no-filmstrip workbench.

Verification: web typecheck, unit tests, lint, build, and all 8 Playwright tests pass. Compose span coverage from tickets 04–05 passes (48 tests).
