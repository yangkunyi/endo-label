Status: specified — tickets 01–05 resolved

# Spec: player sitting, Task focus, jpeg or video Clip

Parents: `.scratch/desk-combobox/spec.md` (Pick+Create, unique triplet, span HTTP, shadcn, always dark). Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0016](../../docs/adr/0016-player-task-focus-dual-source.md). UI copy stays English. mask stays off this page.

## Problem Statement

The combobox desk still feels like three forms and a per-Frame slider. The labeler wants an in-page **player**, a timeline band for the label they are painting, and one editor at a time. Incoming Clips may be a video file, not only a JPEG folder. They do not want seconds in the JSON and they do not want the service to transcode into the Frame Pool.

## Solution

One dark workbench: Clip rail, **player** (JPEG sequence or `<video>`), timeline band under the picture, right rail for **one** Task type.

**Source.** Sitting YAML lists Clips with explicit `kind: jpeg | video` and a path. JPEG: a folder of frames, index `0..N-1`. Video: one file; Frame index is `round(currentTime × fps)` with container fps, else **25**. Playback rate does not change labels. The Frame Pool stays read-only. No mp4 write, no seconds in label JSON.

**Player.** Play/pause, progress, on-screen clock `m:ss` using that fps, rate control. Frame index is small print. Same chrome for both kinds.

**Timeline.** One band for the **focused** Task type only. Consecutive equal values fold into intervals (display only; store stays sparse per Frame). The band is that kind along the whole Clip.

**Right rail (Task focus).** Tabs phase / class / triplet; one editor visible.
- **Now** (top): labels on the playhead Frame for this kind.
- **Library** (middle): desk vocab for this kind, vertical. Click writes the playhead Frame (phase overwrite / class toggle / triplet toggle-unique). Bottom-right **+** adds a vocab name only.
- **Summary** (bottom): read-only Now of the other two kinds. Click a summary chip switches focus; playhead does not move.

Paint-an-interval stays the existing span HTTP (Mark from / Apply / Remove or equivalent on the player range). Success still obvious (toast). No lying direction-only button.

## User Stories

### Catalog and source

1. As an operator, I want each allowlisted Clip to declare `kind` and `path` in sitting YAML, so that jpeg folders and video files are not guessed from extensions.
2. As an operator, I want a missing path or unknown kind to stop or skip that Clip clearly, so that the desk does not open an empty player silently.
3. As an operator, I want the process never to write into the Frame Pool, so that source media stay read-only.
4. As a labeler, I want the Clip rail to list jpeg and video Clips together, so that I pick either kind without a mode.
5. As a labeler, I want opening a jpeg Clip to play its JPEG sequence in the player, so that a folder still sits like a film.
6. As a labeler, I want opening a video Clip to play that file in an in-page `<video>`, so that later surgical video does not need a JPEG dump first.
7. As a labeler, I want video Frame count to come from duration × fps (container fps, else 25), so that span HTTP still uses `0..N-1`.
8. As a labeler, I want a video with no fps metadata to use 25, so that sitting still starts.
9. As a labeler, I want jpeg display clock to use 25 fps unless we later store per-Clip fps, so that `m:ss` is defined.
10. As a labeler, I want existing sparse phase/class/triplet JSON to load on both kinds, so that old labels still show.

### Player

11. As a labeler, I want play and pause, so that I watch the Clip like a video.
12. As a labeler, I want a progress control that seeks, so that I am not stuck stepping one Frame.
13. As a labeler, I want an on-screen clock `m:ss / m:ss`, so that the sitting reads as a player.
14. As a labeler, I want the Frame index as small print, so that I can still match the JSON.
15. As a labeler, I want playback rate control, so that I can skim or slow down.
16. As a labeler, I want rate changes not to rewrite labels or change fps used for index mapping, so that speed is chrome only.
17. As a labeler, I want Space to play/pause when I am not typing, so that the player matches common video shortcuts.
18. As a labeler, I want play to stop at the end and not loop, so that I notice the Clip ended.
19. As a labeler, I want a successful interval write to pause play, so that I see where it landed.
20. As a labeler, I want jpeg play to show each Frame contained, never cropped.
21. As a labeler, I want video play to use the browser video element, not a fake slider-only jpeg strip.
22. As a labeler, I want seeking the player to update Now, so that the right rail matches the picture.

### Timeline band

23. As a labeler, I want a band under the player for the focused Task type only, so that I am not reading three tracks at once.
24. As a labeler, I want consecutive Frames with the same phase name to show as one interval, so that a step looks like a bar.
25. As a labeler, I want each class flag that appears on the Clip to fold into its own intervals on that band, so that `blurred` is not mixed with other flags as one soup (still one Task type).
26. As a labeler, I want each distinct triple to fold into intervals on that band, so that one action is one color/bar.
27. As a labeler, I want unlabeled gaps visible, so that I see where this kind is empty.
28. As a labeler, I want clicking a folded interval to seek the playhead to that interval’s start, so that the band is navigation.
29. As a labeler, I want switching Task focus to rebuild the band for the new kind, so that the color matches the editor.
30. As a labeler, I want the band to be display-only folding of sparse JSON, so that we do not change the store to interval documents this pass.

### Task focus and right rail

31. As a labeler, I want tabs for phase, class, and triplet, so that I edit one kind at a time.
32. As a labeler, I want only that kind’s editor controls visible, so that the rail is not three forms.
33. As a labeler, I want Now at the top to show this playhead Frame’s labels for the focused kind, so that I know what is on this picture.
34. As a labeler, I want class Now to be chips of flags on this Frame.
35. As a labeler, I want triplet Now to be the rows on this Frame (unique triples).
36. As a labeler, I want phase Now to be the one name or unlabeled.
37. As a labeler, I want Library as a vertical list of vocab names for the focused kind, so that the collection is visible.
38. As a labeler, I want clicking a Library name to write the playhead Frame (phase overwrite, class toggle, triplet add-or-toggle), so that pick is immediate persist.
39. As a labeler, I want typing a new Library name via **+** to add vocab only, so that create is not an accidental Frame write.
40. As a labeler, I want Pick+Create from Library still allowed (type-to-add then commit can write this Frame if that is the same control as click-to-apply — **+** itself must not write).
41. As a labeler, I want blank names rejected, so that lists stay usable.
42. As a labeler, I want List rename/trash for the focused kind’s vocab, same desk-wide rules as today.
43. As a labeler, I want × on Now chips/rows to change this Frame only, never vocab.
44. As a labeler, I want a bottom summary of the other two kinds on this Frame, read-only, so that I still see Calot while editing triplet.
45. As a labeler, I want clicking a summary chip to switch Task focus only, not the playhead.
46. As a labeler, I want mask absent from tabs and summary, so that Session is not implied.
47. As a labeler, I want all three stores still independent: writing the focused kind does not wipe the others.

### Interval paint

48. As a labeler, I want to paint the focused Library selection (or Now payload) across a player range via existing span HTTP, so that a surgical step is not one click per Frame.
49. As a labeler, I want Mark from and Apply/Remove to be real writes, with Frame numbers or clock range visible, so that I am not lied to.
50. As a labeler, I want a successful paint to toast and mark the band, so that I know it happened.
51. As a labeler, I want no chip/selection to disable range write, so that empty commits never hit disk.
52. As a labeler, I want `]` to Apply only, never Remove, if keyboard range remains.
53. As a labeler, I want class span to union or drop one flag, phase span to overwrite, triplet span to add-or-skip / remove-by-name, as today.

### Unchanged law

54. As a labeler, I want copy to say phase, class, triplet — not Annotation.
55. As a labeler, I want no Session to edit these three.
56. As a labeler, I want Clip id in the URL; playhead Frame in sitting state.
57. As a labeler, I want shadcn dark sitting, no HeroUI, no light switch.
58. As an operator, I want compose health without GPU.

## Implementation Decisions

- **Catalog:** sitting YAML replaces a bare allowlist-of-ids-under-one-root with a list of Clips: id, `kind` (`jpeg`|`video`), `path`. Keep a labels_root. Invalid kind or unreadable path: that Clip is omitted or the process fails closed on startup if the file is the sitting config — prefer skip-with-log for a single bad Clip so one rotten video does not kill jpeg sitting; document the chosen fail policy in the ticket. `GET` clip list includes `id`, `kind`, `frame_count`, `fps` used for mapping.
- **JPEG play:** timed swap of pool JPEGs at 1× using 25 fps for the clock (each Frame = 1/25 s on the clock). Rate multiplies that clock. Index is still integer Frames.
- **Video play:** `<video src>` from a same-origin media URL the API serves **read-only** from the declared path (byte range if practical). Do not copy into labels_root. `frame_count = max(1, round(duration * fps))` with fps from metadata else 25. Seek: set `currentTime = frameIndex / fps`.
- **Stores:** no schema change. Sparse per-Frame JSON. Folding for the band is client-side (or a read-only helper); not a new document shape.
- **Task focus:** client sitting state. One editor mounted. Summary reads the other two GET documents for this Frame.
- **Library vs +:** click name → this-Frame write. **+** → vocab POST only.
- **Span:** reuse phase/class/triplet span POST. Player range maps to from/to Frame indexes (inclusive, order-insensitive).
- **Kit:** shadcn + existing desk. No HeroUI. No ffmpeg transcode step.

## Testing Decisions

- **Good test:** public HTTP and the sitting. Do not assert CSS class names or Zustand keys.
- **Seams (two, existing kinds):**
  1. **Compose TestClient** — YAML `kind`+`path`; clip list payload; jpeg frame_count unchanged; video fixture reports fps 25 when metadata missing; media GET is read-only; labels GET/PUT/span unchanged; Frame Pool file mtime unchanged after sitting traffic.
  2. **Playwright** — jpeg Clip: player play/seek/clock; Task-focus shows one editor; Now/Library/+; summary click switches tab not playhead; band folds a painted phase span; video Clip: `<video>` appears and seek updates Now (tiny fixture).
- **Prior art:** `tests/test_compose.py`, `web/e2e/desk.spec.ts`.
- **Do not add** a third test stack. A tiny muted video fixture in the test tree is allowed; do not vendor real surgical mp4.

## Out of Scope

- mask, Track, Session chrome, Predict, Propagate.
- Seconds in label JSON; interval documents as the canonical store; wiping vocab; transcode/write into the Frame Pool.
- Light theme; Task-focus as exclusive stores; three editors always open.
- Phone layout; CI GPU; export/train pipelines.
- Guessing kind from file extension as the only catalog.

## Further Notes

- ADR 0008 (no timestamps in JSON) stands. ADR 0007 workbench shell stands except Task-focus ban and frame slider as the primary transport. ADR 0015 combobox rail is superseded by this sitting when it ships.
- Tickets: `issues/01-catalog-kind-path.md` … `05-video-source.md` (`ready-for-agent`). Frontier is 01. 05 waits on 01 and 02; 03 waits on 02; 04 waits on 03.
