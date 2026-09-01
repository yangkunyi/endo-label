# Desk player: JPEG Clips transcode lazily; timeline under the player with a draggable Playhead; Linear tokens on shadcn

The desk turns each JPEG Clip into a playable mp4 instead of hand-rolling JPEG transport. Sitting (server) lazily transcodes a JPEG Clip folder to `data/video-cache/<clipId>.mp4` (ffmpeg CLI, `-framerate 25 -c:v libx264 -pix_fmt yuv420p -r 25 -movflags +faststart -an`). Cache hit = source folder mtime unchanged since the cache file. FFmpeg is a system binary: `shutil.which` check at first use, clear error, no ffmpeg-python package. The Frame Pool stays read-only; the cache lives outside it. Frame index mapping is unchanged (`round(t × 25)`), so label JSON never moves. The old per-frame JPEG endpoint stays (further use, e2e fixtures). Both kinds play in one shadcn **Video Player** (media-chrome) transport: browser-native controls, no custom rate selector.

The timeline moves out of the panel: it sits full-width directly under the player. A **Playhead** (draggable, frame-snapped) marks and seeks the current Frame. Interval bars are display-only — not draggable — and are folded lanes, one per label identity (phase name, class tag, exact triple), with the label written once at the lane head, never repeated per block. Unlabeled gaps stay dim. The timeline scrolls if lanes are many; the player keeps its size. The bottom bar keeps chip + Mark from / Apply / Remove and the small clock; the old seek slider is gone (the Playhead is the seek).

Style: **Linear-style tokens over the existing shadcn kit** (ADR 0013 stands). Canvas `#0a0a0b`; surfaces `#141516` / hover `#1a1b1c`; hairlines `#23252a` / `rgba(255,255,255,.06)`; radius 6/8/12 (buttons, panels, player); accent Linear indigo `#5e6ad2` for selection/focus/Playhead; label colors keep their stable hue but desaturated (`HSL(…, 35%, 55%)`) for dark surfaces; Inter + tabular-nums for the clock; no shadows — hierarchy by surface luminance and hairlines.

## Considered Options

- **Keep the hand-rolled JPEG transport** — rejected; the labeler asked for an embedded player feel, and a 20-line timer cannot match browser transport quality.
- **Client-side transcode (ffmpeg.wasm)** — rejected; slow, heavy, memory-hungry, no benefit for 11–120 frame folders.
- **Native `<video controls>` alone** — superseded by the shadcn Video Player, which is the same media element with theme-inheriting controls and no extra library.
- **Interval bars draggable** — rejected; pan/trim editing is a separate feature. Bars are display + seek-on-click only.
- **Keep HeroUI styling** — rejected; the labeler asked for a modern reference look; Linear token set is the chosen benchmark.

## Consequences

- FFmpeg becomes a documented system dependency of the sitting (not a pip package).
- `data/video-cache/` exists outside the Frame Pool; labels_root layout unchanged.
- ADR 0016's "same chrome for both kinds" narrows to the same Video Player transport; JPEG play now goes through transcoded media rather than a JPEG sequence path.
- ADR 0008 (no seconds in JSON) and ADR 0014 (unique triplet) still hold. Playhead and lane-head labels are sitting chrome only.
- Video Player component is added to the local shadcn copy; no new design-system dependency (ADR 0013).
