Status: specified — tickets 01–05 ready-for-agent

# Spec: Ruler under the picture, Now fills, rate menu

Parents: `.scratch/desk-modern-player/spec.md`. Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0018](../../docs/adr/0018-timeline-ruler-clip-rail.md) (geometry + Ruler); tokens/transcode/Video Player still [ADR 0017](../../docs/adr/0017-modern-player-tokens.md). Kit: shadcn ([ADR 0013](../../docs/adr/0013-shadcn.md)). UI copy stays English. mask stays off this page.

Supersedes desk-modern-player stories that put the timeline only under the Player column, treat lane Playhead as the seek, cycle rate by click, and show Now as a left hairline on grey chips. Labels, stores, span HTTP, Task focus, Frame indexes, transcode, and Linear tokens do not change.

## Problem Statement

The labeler cannot pick a slow playback rate without cycling a button that only goes 1× and up, and that control does not open a list. Now on the current Frame is a grey chip with a thin left stripe, so the label color is easy to miss. The interval track does not line up with the picture (lane names eat width; the embedded progress bar is even narrower). Hiding that progress bar would leave an empty Clip with nothing obvious to drag. The right-hand editor's Now / Library / List sections run together.

## Solution

**Rate.** The media-chrome rate control is a **menu** (click opens a list, does not cycle). Rates: `0.25 0.5 1 1.5 2`. Still browser-owned; not a custom selector.

**Now.** On this Frame, each present label is a filled chip/row whose background is that label's color (same function as the timeline). Empty Now (`none` / `unlabeled` / empty triplet table) is muted text, no fill. Library stays a small swatch, not a filled button.

**Geometry.** The timeline is one full-width row under Clips+Player. Lane-head column width follows the Clips rail. Colored bars occupy only the Player column, aligned with the picture. Bars do not paint into the Clips list.

**Ruler.** The embedded progress bar is gone. An always-on **Ruler** sits flush under the picture; label lanes sit below it. An empty Clip has the Ruler only. The **Playhead** drags on the Ruler (frame-snapped). Its stem may cross lanes but does not capture pointer. Clicking a bar seeks to that interval's start. Bars stay display-only.

**Editor.** Hairline between Now, Library, and List; existing uppercase headings. No cards.

## User Stories

### Rate menu

1. As a labeler, I want playback rate as a list I open with a click, so that I do not cycle through speeds to reach the one I want.
2. As a labeler, I want `0.25` and `0.5` on that list, so that I can watch Frames slowly.
3. As a labeler, I want `1`, `1.5`, and `2` on the same list, so that I can also go faster.
4. As a labeler, I want the list to be the player's own control, so that the desk does not grow a custom rate widget.
5. As a labeler, I want the default rate to stay `1`, so that opening a Clip is normal speed.
6. As a labeler, I want jpeg and video Clips to share this menu, so that kind does not change transport.

### Now fill

7. As a labeler, I want each class tag on Now to fill with that tag's color, so that I see the label at a glance.
8. As a labeler, I want the current phase on Now to fill with that phase's color, so that phase matches class.
9. As a labeler, I want each triplet row on Now to fill with that exact triple's color, so that the three kinds match.
10. As a labeler, I want empty Now (no class tags / unlabeled phase / no triplet rows) to stay muted text without a colored fill, so that empty is not a fake label.
11. As a labeler, I want Library picks to keep a small color swatch rather than a filled chip, so that the rail does not become a row of rainbow buttons.
12. As a labeler, I want Now fill to use the same color function as timeline bars, so that one identity is one color.
13. As a labeler, I want text on a filled Now chip to stay readable on the dark desk, so that the name is not lost in the fill.

### Timeline geometry

14. As a labeler, I want the timeline row to span Clips and Player, so that lane names sit in the Clips column width and bars sit under the picture.
15. As a labeler, I want lane-head width to follow the Clips rail when I drag it, so that bars stay lined up with the picture after resize.
16. As a labeler, I want colored bars not to paint over the Clips list, so that the Playhead still matches the picture.
17. As a labeler, I want unlabeled gaps in a labeled lane to stay dim, so that empty is not a name.
18. As a labeler, I want one lane per label identity with the name written once at the lane head, so that blocks do not repeat the word.
19. As a labeler, I want many lanes to scroll while the player keeps its size, so that the picture does not shrink.
20. As a labeler, I want jpeg and video Clips to share this geometry, so that kind does not move the band.

### Ruler and Playhead

21. As a labeler, I want no embedded player progress bar, so that I am not lining the band up with a shorter chrome range.
22. As a labeler, I want play, current time, duration, rate menu, mute, volume, and fullscreen to stay on the player, so that hiding the range does not strip the rest of transport.
23. As a labeler, I want a Ruler flush under the picture, so that there is always a seek track.
24. As a labeler, I want label lanes below the Ruler, so that the Ruler is the first thing under the picture.
25. As a labeler, I want an empty Clip to show only the Ruler, so that I do not get a second unnamed dim lane.
26. As a labeler, I want labeled Clips to grow lanes under the Ruler, so that the Ruler never disappears.
27. As a labeler, I want to drag the Playhead on the Ruler, so that seek is frame-snapped on the track that is always there.
28. As a labeler, I want the Playhead stem to cross lanes without capturing pointer, so that clicking a bar still seeks to that interval's start.
29. As a labeler, I want interval bars to stay not draggable, so that I cannot pan or trim by accident.
30. As a labeler, I want clicking a lane or interval to seek to that interval's start, so that I jump to a label without dragging.
31. As a labeler, I want the Playhead to stay the indigo accent, so that it matches selection elsewhere.
32. As an operator, I want Frame index mapping unchanged (`round(t × fps)` else 25), so that label JSON does not move.

### Editor hairlines

33. As a labeler, I want a hairline between Now and Library, so that this Frame is distinct from the list I paint from.
34. As a labeler, I want a hairline between Library and the vocab List, so that picks are distinct from rename/delete.
35. As a labeler, I want no cards around those sections, so that the dark rail does not stack panels.
36. As a labeler, I want existing uppercase Now / Library headings to stay, so that the hairline is extra structure, not a new vocabulary.

### Span and sitting chrome that must still work

37. As a labeler, I want chip + Mark from / Apply / Remove and i/o/[ ] to still paint spans, so that the new band does not break interval edit.
38. As a labeler, I want Now to stay read-only (toggles stay on Library), so that this Frame display does not become a second editor.
39. As a labeler, I want Task focus to still pick which kind of lanes I see, so that the Ruler does not mix phase/class/triplet bars.
40. As a labeler, I want the other two kinds to stay a read-only summary, so that Task focus is still chrome only.

## Implementation Decisions

- Sitting chrome only. No HTTP, JSON, vocab, or Frame index change.
- Rate: media-chrome playback-rate **menu** with rates `0.25 0.5 1 1.5 2`. Do not restore a custom rate `<select>`. Default remains 1.
- Hide `MediaTimeRange`. Keep play, time, duration, rate menu, mute, volume, fullscreen.
- Timeline region is one row under the Clips rail and the Player, not inside Editors. Lane-head column width is the Clips rail width. Colored track width is the Player column.
- Ruler is always rendered, flush under the picture, above label lanes. Empty Clip: Ruler only (no unnamed fallback lane).
- Playhead pointer capture lives on the Ruler. Stem is `pointer-events: none`. Bars remain click-to-seek-to-start, not draggable.
- Now fill uses the existing label-color function at ~full chip/row background; text contrast stays readable on the dark tokens. Library swatches stay small.
- Editor sections: hairline + existing headings. No Card component, no extra shadow.
- ADR 0013 / 0017 / 0018 stand. Do not introduce a second design kit.

## Testing Decisions

- Test **external sitting behavior**, not CSS class names or media-chrome internals.
- **One seam:** existing Playwright desk e2e (same file the modern-player closeout already owns). No third test stack.
- Cover at least: rate control opens a list including `0.25`; Now fill present for a labeled Frame and absent when empty; timeline outside Editors; lane-head column tracks Clips width; no embedded progress range; Ruler present on an empty Clip; Playhead drag on the Ruler seeks; bar click seeks to interval start; bars not draggable; hairlines do not require a Card.
- Vitest stays for pure fold/color helpers if those functions change; do not unit-test layout.
- Prior art: modern-player timeline / Playhead / Now tests in that same Playwright file.

## Out of Scope

- JPEG transcode, cache, ffmpeg, Frame Pool
- Relighting Linear tokens or swapping the Video Player kit
- Draggable/trimmable interval bars
- Custom rate widget, extra rates beyond the five
- Cards, shadows, or a second editor layout
- HTTP/JSON/vocab/mask/Session
- Aligning bars to the old chrome progress width
- Painting bars into the Clips list

## Further Notes

Q3 geometry is a **try**: if Playhead vs picture is still wrong after A+D, reopen alignment — do not silently extend bars into Clips.

Seam check (to-spec step 2): one Playwright desk file. Same as 01–05 of modern-player.
