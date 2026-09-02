Status: specified — tickets 01–05 resolved

# Spec: modern player, timeline under the player, Linear tokens

Parents: `.scratch/desk-player/spec.md` (player, Task focus, jpeg/video). Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0017](../../docs/adr/0017-modern-player-tokens.md). Kit: shadcn ([ADR 0013](../../docs/adr/0013-shadcn.md)). Unique triplet: [ADR 0014](../../docs/adr/0014-unique-triplet.md). UI copy stays English. mask stays off this page.

Supersedes the desk-player stories about the JPEG sequence path, the bottom seek slider, and the self-built transport chrome (rate/clock/seek in the footer). Labels, stores, span HTTP, Task focus, and Frame indexes do not change.

## Problem Statement

The desk still plays a JPEG Clip with a hand-timed image swap and a home-made transport, so the sitting does not feel like a real player and the rate/seek chrome is ours to maintain. The timeline band is buried inside a panel and repeats the same label word on every block. The dark UI reads as default shadcn, not a considered design. The labeler wants: a real embedded player feel, the timeline directly under the picture with a draggable playhead, each label written once, and a modern reference look.

## Solution

**Player.** Both Clip kinds play in one shadcn **Video Player** (media-chrome transport: play/pause, seek, time, rate, fullscreen — not ours to build). A JPEG Clip is lazily transcoded to mp4 on first open, cached beside labels; a video Clip plays its own file. The Frame Pool stays read-only. Frame index mapping is unchanged (`round(t × 25)`), so label JSON never moves.

**Timeline.** Full-width, directly under the player, out of the panel. One **Playhead** (draggable, frame-snapped) marks and seeks the current Frame; click seeks too. Folded lanes, one per label identity, label written once at the lane head — never per block. Unlabeled gaps dim. Bars are display-only, not draggable. Many lanes scroll; the player keeps its size.

**Bottom bar.** Keeps paint chip + Mark from / Apply / Remove + small clock/Frame print. The old seek slider is gone — the Playhead is the seek.

**Style.** Linear-style tokens over the existing shadcn kit: near-black canvas, surface ladder, hairlines, radius 6/8/12, single indigo accent, desaturated label colors, Inter + tabular-nums, no shadows.

## User Stories

### JPEG Clip plays as video

1. As an operator, I want a JPEG Clip to play in the same player as a video Clip, so that the sitting does not have two transports.
2. As an operator, I want first open of a JPEG Clip to transcode its frames to mp4 (ffmpeg CLI, 25 fps, h264, yuv420p, faststart, no audio), so that the browser gets real media.
3. As an operator, I want the transcoded file cached at `data/video-cache/<clipId>.mp4`, so that later opens are instant.
4. As an operator, I want the cache reused when the source folder mtime is unchanged, so that re-opening does not re-transcode.
5. As an operator, I want a missing ffmpeg to fail with a clear error, so that the desk does not silently fall back to a broken player.
6. As an operator, I want the Frame Pool never written, so that source media stays read-only (cache lives outside it).
7. As a labeler, I want Frame indexes unchanged after transcode (`round(t × 25)`), so that label JSON stays valid.
8. As a labeler, I want the old per-frame JPEG endpoint to remain, so that nothing outside the desk breaks.

### Embedded player

9. As a labeler, I want the shadcn Video Player transport (media-chrome), so that play/pause, progress, rate, and fullscreen behave like a real player.
10. As a labeler, I want no custom rate selector, so that playback rate is browser-owned.
11. As a labeler, I want no self-built clock, so that time display is player-owned.
12. As a labeler, I want the bottom bar free of the old seek slider, so that transport is not duplicated.
13. As a labeler, I want seeking the player to update Now and the Playhead, so that the rail matches the picture.
14. As a labeler, I want playing a video Clip to use its own file read-only, as today.
15. As a labeler, I want label JSON to stay sparse per-Frame, so that nothing about the store changes.

### Timeline under the player

16. As a labeler, I want the timeline full-width directly under the player, so that it is not a panel inside the rail.
17. As a labeler, I want the focused Task type’s lanes only, so that I am reading one kind at a time.
18. As a labeler, I want a Playhead showing the current Frame, so that I know where I am.
19. As a labeler, I want the Playhead draggable and frame-snapped, so that I can scrub without a slider.
20. As a labeler, I want clicking a lane/interval to seek to that interval’s start, so that the timeline stays navigation.
21. As a labeler, I want interval bars not draggable, so that pan/trim is clearly not this feature.

### Label written once

22. As a labeler, I want one lane per label identity (phase name, class tag, exact triple), so that the label word is never repeated per block.
23. As a labeler, I want the label name written once at the lane head, so that I read the legend from the lane.
24. As a labeler, I want adjacent different labels to keep a visible join, so that two steps do not smear.
25. As a labeler, I want unlabeled gaps dim and unnamed, so that empty is not a label.
26. As a labeler, I want switching Task focus to rebuild lanes and lane heads, so that the color matches the editor.
27. As a labeler, I want many lanes to scroll (thin scrollbar) while the player keeps its size, so that phase-heavy Clips do not crush the picture.

### Style (Linear tokens)

28. As a labeler, I want a near-black canvas and a surface ladder, so that hierarchy reads without shadows.
29. As a labeler, I want hairline borders, so that panels do not float with heavy edges.
30. As a labeler, I want radius 6/8/12 (buttons, cards, player), so that the sitting feels rounded-modern, not default.
31. As a labeler, I want one indigo accent (`#5e6ad2`) for selection, focus rings, and the Playhead, so that the state color is unambiguous.
32. As a labeler, I want label colors desaturated (`HSL(…, 35%, 55%)`), so that many hues sit well on dark surfaces.
33. As a labeler, I want Inter + tabular-nums for the small clock, so that digits do not jitter.
34. As a labeler, I want the same style on jpeg and video Clips, so that the desk looks like one product.

### Unchanged law

35. As a labeler, I want copy to say phase, class, triplet — not Annotation.
36. As a labeler, I want no Session to edit these three.
37. As a labeler, I want Task focus still one kind at a time; the other two remain a read-only summary.
38. As a labeler, I want clicking a summary chip to switch focus only, not the playhead.
39. As a labeler, I want span paint (chip + Mark from / Apply / Remove, and i/o/[] keyboards) unchanged.
40. As a labeler, I want mask absent from tabs, Library, Now, and the band.
41. As an operator, I want compose health without GPU.

## Implementation Decisions

- **Transcode.** Server-side, lazy on first open of a JPEG Clip. `ffmpeg -framerate 25 -i <frames> -c:v libx264 -pix_fmt yuv420p -r 25 -movflags +faststart -an`. Detect frame numbering (`-start_number`, glob). Cache `data/video-cache/<clipId>.mp4`; reuse when source dir mtime unchanged. `shutil.which("ffmpeg")` at first use; clear error if missing. CLI subprocess, no ffmpeg-python.
- **Media path.** Both kinds serve through the existing media URL; JPEG kind resolves to the cache file; cache build is on-demand with a busy/error surface.
- **Player.** shadcn Video Player component (media-chrome) for both kinds. Remove custom rate select and self-built clock from the desk; remove the bottom seek slider. Playhead state still derives from the video element time; frame = `round(t × fps)`.
- **Timeline.** Full-width element under the player. Folds sparse JSON client-side as today (one lane per phase name, class tag appearing on the Clip, distinct triple). Label written once at lane head. Playhead overlay draggable (pointer events, frame snap), click-to-seek on lanes. Scroll when lanes overflow; player min-height kept.
- **Style tokens.** CSS-variable layer over shadcn tokens: canvas `#0a0a0b`, surfaces `#141516`/`#1a1b1c`, hairlines `#23252a` / `rgba(255,255,255,.06)`, radius 6/8/12, accent `#5e6ad2`, label hue kept but desaturated, Inter, no shadows.
- **API.** No label schema change. `/media` for video and for JPEG (transcoded) both; per-frame JPEG endpoint stays.

## Testing Decisions

- **Good test:** what the labeler sees. Assert video element present for both kinds, player controls visible, seek updates Now/Playhead, lane head label written once, Playhead drag seeks, no seek slider in footer, colors present but not hex-asserted.
- **Seam (one, existing):** Playwright against the desk, same stack as `desk.spec.ts`. Plus compose tests for the transcode: cache file created, mtime reuse, missing-ffmpeg error path, Frame Pool untouched.
- **Prior art:** `web/e2e/desk.spec.ts`, `tests/test_compose.py`, `web/src/timeline.test.ts`.
- Do not add a third test stack. Unit fold tests stay valid if lane output still carries the label string.

## Out of Scope

- Dragging interval bars (pan/trim editing).
- Client-side transcode (ffmpeg.wasm).
- Light theme; phone layout; CI GPU; export/train.
- Changing label stores, span HTTP, unique-triplet rules, or rename/trash rules.
- mask, Track, Session chrome.
- Per-Clip fps metadata beyond the 25 fps constant this pass.

## Further Notes

- ADR 0017 records the transcode, player, timeline, and token decisions. ADR 0013 (shadcn) stands. ADR 0008 (no seconds in JSON) and ADR 0014 (unique triplet) hold.
- Timeline lane-per-label supersedes the band stories in desk-player (display-only fold remains).
- Tickets planned: `issues/01-jpeg-transcode.md` … `05-e2e-closeout.md`.
