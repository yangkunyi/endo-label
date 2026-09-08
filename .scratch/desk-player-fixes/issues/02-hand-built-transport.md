# 02 — Hand-built transport replaces media-chrome

**What to build:** Remove media-chrome from the desk. The player is a native `<video>` plus a hand-built transport row of shadcn controls, always visible, on one line directly under the Ruler and above the Lane well: play/pause, `elapsed / duration` time display, rate menu (`0.25 0.5 1 1.5 2`, click opens a list, never cycles), mute, volume, fullscreen via the native Fullscreen API. The embedded progress range is gone — the Ruler is the only progress and seek surface, frame-snapped. No autohide, no fade anywhere: while playing, moving the mouse away never darkens the picture, and a freshly opened Clip shows its first frame without any hover. Space toggles playback; `i`/`[` and `o`/`]` semantics unchanged; JPEG and video Clips share the transport. Player column order stays picture, Ruler, transport row, Lane well. Error and empty Clip states keep working. Rewrite every `media-*` browser assertion for the new controls and add the black-fade regressions.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] media-chrome is gone from dependencies; no `media-*` element renders in the desk
- [x] Transport row sits under the Ruler, always visible; player column order picture / Ruler / transport / Lane well; the picture never jumps when the row appears
- [x] Fresh open shows the first frame with no hover; playing + mouse away keeps the picture fully visible (player surface opacity stays 1; pixel probe non-black)
- [x] Play/pause works for JPEG and video Clips; `elapsed / duration` updates during playback
- [x] Rate control opens a list with `0.25` and applies the choice; it does not cycle
- [x] Mute and volume work; fullscreen uses the native API and restores correctly
- [x] Embedded progress range deleted; Ruler drag and click-to-seek unchanged and still frame-snapped; transport time is display-only
- [x] Space, `i`/`[`, `o`/`]`, and typing-in-input guards unchanged
- [x] "Clip not found" and "This Clip has no Frames" states still render
- [x] Playwright: all `media-*` assertions rewritten for the hand-built controls; new regressions for fresh-open and mouse-away; full desk suite green
- [x] vitest and `tsc` green; pytest untouched and green

## Answer

`web/src/components/ui/video-player.tsx` is now one local module with two exports: `VideoPlayer` is the bare native `<video>` (`preload="metadata"`, `object-contain`, `aria-label="Frame N"`), and `PlayerTransport` is the always-visible toolbar (`role="toolbar"` `aria-label="Transport"`, no transitions, no autohide): play/pause button, `<output data-transport-time>` showing `m:ss / m:ss`, a click-open rate list (`role="menu"` with `menuitemradio 0.25× 0.5× 1× 1.5× 2×`, backdrop closes it, selection sets `playbackRate` — opening it never changes the rate), mute, a native volume range, and fullscreen. Player state lives in `ClipDesk` (`playing / transportTime / duration / rate / muted / volume`) and syncs from the video element's `play` / `pause` / `timeupdate` / `loadedmetadata` / `ratechange` / `volumechange` events, so the display cannot drift from the element. Fullscreen calls `requestFullscreen()` on the player section (`playerSectionRef`) and `document.exitFullscreen()` to leave. The transport row renders inside `TimelineBand` between the Ruler row and the Lane well, offset by the same `clipRailWidth` spacer so it sits in the player column; the well keeps its fixed `h-24`. The embedded `MediaTimeRange` is deleted — the Ruler keeps frame-snapped drag and click-to-seek and is the only progress surface; the transport time has no seek handler. The Space handler lost its `media-controller` branch (the element no longer exists) and otherwise keeps the `isEditableTarget` guard and `i`/`[`/`o`/`]` semantics. `media-chrome` left `package.json`/`package-lock.json`, and `player-chrome.css` was deleted.

Playwright: every `media-*` assertion was rewritten for the toolbar and `data-transport-time` (`expectNoMediaChrome` also sweeps all rendered tags for any `media-*` element); the old "jpeg player shows media-chrome transport" case became "jpeg player shows the hand-built transport and Frame print" with Ruler→transport→well geometry checks on both Clips. The black-fade regressions follow ADR 0022's measured method: fresh open and playing+mouse-away each wait out the old ~1s fade window, then assert computed opacity is `1` on the player section, its picture wrapper, and the video, and that a canvas `drawImage` pixel probe of the video buffer is >90% non-black. To make the probe meaningful the e2e `CLIP_VID` now points at `web/e2e/fixtures/tiny.mp4` — a non-black (gray 0x80) H.264 32×32 4.0 s 25 fps 100-frame clip replacing the black 2-frame `tests/fixtures/tiny.mp4` (kept for pytest, untouched); its time display ticks (`0:00 / 0:04` → `0:01 / 0:04`) and playback outlasts the mouse-away probe. `CLIP_VID` frame-count assertions moved from 2 to 100 accordingly.

Validation: `tsc -b --noEmit` exit 0; oxlint 0 errors (1 pre-existing warning elsewhere); vitest 49 passed; Playwright desk suite 49 passed (~2.0 m) on the isolated servers API `127.0.0.1:7891` + Vite `5191`; pytest 106 passed, 1 skipped (backend untouched).
