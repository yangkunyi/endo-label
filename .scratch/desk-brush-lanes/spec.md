Status: specified — all tickets resolved

# Spec: Lane well does not steal the picture; Brush is not Library Selection; Lanes paint, select, hide

Parents: `.scratch/desk-cards-grid/spec.md`, `.scratch/desk-ruler/spec.md`, `.scratch/desk-vocab-library/spec.md`. Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0021](../../docs/adr/0021-brush-lane-well.md). Related: [ADR 0008](../../docs/adr/0008-class-triplet-span.md) span HTTP, [ADR 0014](../../docs/adr/0014-unique-triplet.md), [ADR 0016](../../docs/adr/0016-player-task-focus-dual-source.md) Task focus, [ADR 0017](../../docs/adr/0017-modern-player-tokens.md) tokens/player, [ADR 0019](../../docs/adr/0019-exact-triple-vocab.md), [ADR 0020](../../docs/adr/0020-editor-cards-and-grid.md). Kit: shadcn ([ADR 0013](../../docs/adr/0013-shadcn.md)). UI copy stays English. mask stays off this page.

Supersedes sitting stories that: grow the timeline with each Lane and shrink the picture; treat the last this-Frame write as the interval payload (paint chip); seek to a bar’s first Frame on click; treat an empty Clip as Ruler-only with no reserved strip.

Labels, per-Frame JSON, span HTTP shape, Task focus, Frame indexes, transcode, Editor Cards, exact-triple Vocab, and Linear tokens do not change. A multi-identity Apply is several existing span POSTs, not a new document.

## Tickets

- [01 — Lane well is a reserved strip; picture height does not follow Lanes](issues/01-lane-well-reserved-height.md) (`resolved`)
- [02 — Brush replaces the paint chip; Library name stays this-Frame](issues/02-brush-replaces-paint-chip.md) (`resolved`)
- [03 — Several identities in one Apply; Ruler and ghost preview](issues/03-multi-brush-and-range-preview.md) (`resolved`)
- [04 — Lane bars seek under the pointer, paint on empty drag, Shift-select, trim, Backspace](issues/04-lane-seek-paint-select-trim.md) (`resolved`, blocked by 01)
- [05 — Library eye shows or hides a Lane; unused start hidden](issues/05-lane-visibility-eye.md) (`resolved`, blocked by 01, 04)
- [06 — Full desk e2e closeout](issues/06-e2e-closeout.md) (`resolved`, blocked by 01–05)

## Problem Statement

When Lanes appear under the picture, the player loses height, so the surgical image jumps. Interval paint is coupled to the current Frame: Library click writes this Frame and only then arms a single paint chip, so `i`/`o`/`[`/`]` do not make clear which Vocab identity will be written, and class flags cannot share one Apply. Range is only a pair of numbers in the footer — nothing on the Ruler or Lanes. Removing a span means the same chip gesture, not pointing at the colored bar the labeler already sees.

## Solution

Reserve a fixed-height **Lane well** under the Ruler. Picture height does not follow how many Lanes exist. Scroll inside the well.

**Brush** is a sitting set of Vocab identities for the focused Task type, independent of **Library Selection**. Library name click still toggles this Frame only. A separate Brush control on the row arms or disarms that identity for interval paint, without writing a Frame. Class and triplet Brushes may hold several identities; phase holds at most one (a later pick replaces). `i`/`[` Mark from and `o`/`]` Apply write the whole Brush across the inclusive range. Empty Brush: those keys and the Apply/Remove/Mark from controls do nothing.

**Lane** of a visible identity is the other paint path: drag on empty track paints that identity on the dragged Frame range. Click a bar seeks to the Frame under the pointer. Hold Shift and click to select bars (multi-select, no seek). Backspace/Delete drops the selected segments. Drag the ends of a selected bar to trim; commit on pointer up. Bottom **Remove** remains the Brush + In–Out eraser. The player MediaTimeRange is not a label control.

**Lane visibility** is an eye on the Library row. Identities already on this Clip start visible; unused start hidden. The labeler shows an empty Lane to drag-paint a name that is not on this Clip yet. A labeled Lane may be hidden. Hide is not Vocab trash and not unlabeled. Visibility persists in localStorage on this machine.

While Mark from is set, the Ruler shows the from–to span and the well shows ghost bars on visible Brush Lanes.

## User Stories

### Picture and Lane well

1. As a labeler, I want the picture height to stay the same whether the well has zero Lanes or many, so that adding a class tag does not jump the anatomy.
2. As a labeler, I want the Lane well to be a reserved strip about 6rem tall under the Ruler, so that Lanes have a stable home that does not steal flex from the player.
3. As a labeler, I want extra Lanes to scroll inside that strip, so that a long class list does not grow the well.
4. As a labeler, I want an open Clip with Frames to always show that strip, even when no Lane is visible, so that the player does not jump when the first Lane appears.
5. As a labeler, I want the Ruler to stay flush under the picture, above the well, so that seek stays a dedicated unlabeled track.
6. As a labeler, I want Lane-head names to keep the Clip-rail width and colored bars to stay under the picture, so that the Playhead still matches the frame.
7. As a labeler, I want jpeg and video Clips to share this geometry, so that kind does not move the band.

### Brush vs Library Selection

8. As a labeler, I want clicking a Library name (or Triplet row body) to toggle only the current Frame, so that arming an interval does not dirty this Frame.
9. As a labeler, I want a dedicated Brush control on each Library row, so that I can put that identity into the Brush without writing a Frame.
10. As a labeler, I want clicking Brush on an identity already in the Brush to take it out, so that the set is a toggle.
11. As a labeler, I want the footer to list every identity in the current Brush with its color, so that I can see what Apply will write before I press `o`.
12. As a labeler, I want an × on a footer Brush chip to drop only that identity from the Brush, so that I do not have to hunt the Library row.
13. As a labeler, I want an empty Brush to disable Mark from, Apply, Remove, `i`, `[`, `o`, and `]`, so that empty commits never hit disk.
14. As a labeler, I want `i` and `[` to keep meaning Mark from only, so that they never enter a paint or select mode.
15. As a labeler, I want `o` and `]` to Apply the whole Brush and never Remove, so that a key is not a hidden direction switch.
16. As a labeler, I want class Brush to hold several class tags, so that one Apply can turn `grasper` and `blurred` on across the same range.
17. As a labeler, I want triplet Brush to hold several exact triples, so that one Apply can add more than one row kind across the same range.
18. As a labeler, I want phase Brush to hold at most one phase name, so that exclusive Phase cannot be armed twice.
19. As a labeler, I want picking a second phase into the Brush to replace the first, so that I do not have to disarm by hand.
20. As a labeler, I want each Task focus to remember its own Brush, so that switching class → phase → class does not throw away the class set.
21. As a labeler, I want changing Clip to keep the Brush, so that the same class tags can be painted on the next Clip.
22. As a labeler, I want changing Clip to clear Mark from, so that a range cannot span two Clips.
23. As a labeler, I want Apply without Mark from to write the Brush on this Frame only, so that a single-Frame apply uses the same button.
24. As a labeler, I want Apply to leave identities not in the Brush untouched on those Frames, so that painting `blurred` does not drop `grasper`.
25. As a labeler, I want a successful Apply to toast what was written and on which Frame range, then clear Mark from and keep the Brush, so that I can paint the same set again.
26. As a labeler, I want a failed Apply to show a red toast and leave disk and Mark from unchanged, so that a 500 does not look like success.

### Lane paint, seek, select, trim

27. As a labeler, I want dragging on the empty part of a visible Lane to paint that Lane’s identity from the press Frame to the release Frame inclusive, so that the identity is the row I dragged on.
28. As a labeler, I want a click without drag on empty Lane to seek to that Frame, so that empty track is still a seek surface.
29. As a labeler, I want clicking a colored bar (no Shift) to seek to the Frame under the pointer, so that a long bar’s middle is reachable.
30. As a labeler, I want that unmodified click to clear bar selection, so that seek does not leave a stale selection.
31. As a labeler, I want holding Shift and clicking a bar to select that segment without seeking, so that navigation and edit stay on different chords.
32. As a labeler, I want Shift-clicking another bar to add it to the selection, so that I can delete several segments at once.
33. As a labeler, I want Shift-clicking an already selected bar to deselect it, so that the chord is a toggle.
34. As a labeler, I want selected bars to show a clear outline, so that I can see what Backspace will drop.
35. As a labeler, I want Backspace or Delete (when not typing in an input) to remove each selected segment from disk, so that pointing at a bar is how I delete a visible run.
36. As a labeler, I want that delete to drop only that identity on those Frames, so that stacked class flags on the same Frames stay.
37. As a labeler, I want Escape to clear bar selection without writing disk, so that I can abort.
38. As a labeler, I want dragging either end of a selected bar, then releasing, to trim that segment to the new inclusive range, so that I can shorten or lengthen a run without Remove.
39. As a labeler, I want dragging the middle of a filled bar (no Shift) not to move the whole segment, so that bars cannot be accidentally relocated.
40. As a labeler, I want no marquee-drag to select bars, so that drag-on-empty stays paint.
41. As a labeler, I want Remove (button) to invert the Brush across Mark from–current (or this Frame if unmarked), so that I can cut the middle of a long run without selecting every piece.
42. As a labeler, I want the player MediaTimeRange and the Ruler not to delete labels, so that progress and seek never act as an eraser.

### Range preview

43. As a labeler, I want the Ruler to highlight the inclusive from–to while Mark from is set, so that the range is on the seek track, not only in the footer.
44. As a labeler, I want ghost bars on each visible Brush Lane for that same from–to, so that several armed identities read as several upcoming paints.
45. As a labeler, I want ghost bars to look distinct from committed bars (lower opacity or outline), so that I do not think they are already on disk.
46. As a labeler, I want ghost bars not to be seek or select targets, so that preview cannot steal pointer from real bars.
47. As a labeler, I want Apply/Remove of a hidden Brush identity to still write disk, so that hiding a Lane is not a lock.

### Lane visibility (eye)

48. As a labeler, I want an eye control on each Library row, so that I can show or hide that identity’s Lane without deleting anything.
49. As a labeler, I want the eye to be a different control from the name, the Brush control, and trash, so that hide, this-Frame, interval payload, and Vocab delete stay distinct.
50. As a labeler, I want identities already present on this Clip to start with the eye on, so that existing work is visible without a hunt.
51. As a labeler, I want unused Vocab identities to start with the eye off, so that a long Library does not fill the well with empty rows.
52. As a labeler, I want turning the eye on for an unused identity to show an empty Lane I can drag-paint, so that Q5-B works for names not yet on this Clip.
53. As a labeler, I want to turn the eye off on a labeled Lane, so that I can unclutter the well without dropping labels.
54. As a labeler, I want Now, Library Selection, and Brush to ignore the eye, so that hiding a Lane does not change this Frame or the next Apply.
55. As a labeler, I want visibility to persist on this machine across Clips and reloads, so that the same class tags stay in the well I care about.
56. As a labeler, I want a machine with no stored map to use the present-on-Clip vs unused defaults, so that a fresh sitting is predictable.
57. As a labeler, I want an explicit stored hide to win over “present on this Clip”, so that Q20 stays true after reload.
58. As a labeler, I want adding a new Vocab name to start hidden (unused), so that `+` does not dump a new empty Lane into the well.

### Task focus, kinds, chrome

59. As a labeler, I want the well to show only visible Lanes of the focused Task type, so that class bars do not mix with phase bars.
60. As a labeler, I want switching Task focus to rebuild the well and clear bar selection, so that a phase selection cannot linger under class Lanes.
61. As a labeler, I want switching Task focus to keep each kind’s Brush, so that the class set is still there when I come back.
62. As a labeler, I want Library name click, double-click rename, and trash confirm to keep working, so that this-Frame and desk-wide Vocab edits do not regress.
63. As a labeler, I want Now to stay read-only, so that badges never arm Brush or hide Lanes.
64. As a labeler, I want Space, rate menu, and media-chrome transport to keep working, so that player chrome is untouched.
65. As a labeler, I want `i`/`o`/`[`/`]`/Backspace/Delete ignored while typing in an input or combobox, so that rename and add-name stay safe.
66. As a labeler, I want English copy on the new controls (`Brush`, `Show lane`, `Hide lane`), so that the desk matches prior sitting specs.

## Implementation Decisions

- **Player vs well**: The Clip+Player column is a vertical split: player `flex-1 min-h-0`; Ruler shrink-0; Lane well shrink-0 at `6rem` (`h-24`) with internal `overflow-y-auto`. The well is not a flex sibling that grows with Lane count. Overlay on the picture is out.
- **Ruler**: Stays above the well, unlabeled seek. Playhead drags on the Ruler only. Stem may cross Lanes and does not capture pointer.
- **Replace paint chip**: Sitting store holds Brush per Task focus (`class` names[], `triplet` exact triples[], `phase` one name or none). Footer renders that set instead of a single paint chip. Opening another Clip does **not** clear Brush (today’s chip-clear on Clip change goes away). Mark from still clears on Clip change.
- **Library row hits**: Name / Triplet row body → this-Frame toggle (existing). Separate Brush control (button, `aria-pressed`) → toggle membership in that kind’s Brush, no HTTP. Eye button → Lane visibility only. Trash stays hover-revealed confirm-delete of Vocab.
- **Phase Brush**: Inserting a name replaces any previous phase Brush identity.
- **Apply / Remove HTTP**: Existing span routes. Class/triplet Apply loops one POST per Brush identity (union on, or remove). Phase Apply is one POST. Order: stable Library/Vocab order. Failures stop the loop, toast, do not claim success for the remainder.
- **Lane list**: Visible identities of the focused kind, including unused-but-eye-on (empty Lane). Hidden identities omitted from the well even if they have bars on disk.
- **Visibility map**: localStorage, keyed by Task type + identity (phase/class name, or exact triple). Missing key: visible if that identity appears on this Clip’s frames, else hidden. Stored value always wins. Same map across Clips on this machine.
- **Click vs Shift vs drag**:
  - Pointer up on a bar, no Shift, no drag: seek to Frame under pointer; clear bar selection.
  - Shift + click bar: toggle that folded segment in the selection; do not seek.
  - Drag on empty Lane: on pointer up, span-paint that identity on min–max Frames of the drag (inclusive), same semantics as Apply for one identity.
  - Drag ends of a **selected** bar: on pointer up, trim (expand = paint on, shrink = remove) that identity on the changed Frames.
  - Drag middle of a filled bar: do not move the segment. Unmodified drag may seek along the pointer (same mapping as Ruler); it does not paint.
  - No marquee selection.
- **Bar selection**: In-memory only, per open Clip + Task focus. Focus change or Clip change clears it. Backspace/Delete (not in an editable field) POSTs the inverse span for each selected segment. Escape clears selection. No confirm dialog.
- **Preview**: While Mark from is set and Brush is non-empty, Ruler fills from–to (Playhead indigo / accent, not a single identity color when Brush has several). Ghost bars on visible Brush Lanes only; pointer-events none.
- **Tokens**: Existing dark Linear tokens. Selected bar: accent outline. Ghost: ~40% opacity of `labelColor`. Eye uses Lucide `Eye` / `EyeOff`.
- **Backend**: No schema, route, or JSON shape change.

## Testing Decisions

- **When Playwright runs**: Only ticket 06. Tickets 01–05 do not run or edit `web/e2e/desk.spec.ts`. Product tickets prove themselves with vitest (where the spec named a unit seam) and `tsc`. Existing e2e may go red after 02–05; 06 rewrites them and must finish green.
- **Primary seam (ticket 06)**: The existing Playwright desk suite. Drive the real sitting: Library Brush control, eye, Lane well height vs player, Shift-click bars, drag-empty paint, Apply of several class tags, Remove still range-erases. Do not add a second browser suite. Do not test span HTTP through Python for this spec (already covered).
- **What a good test is**: External sitting behavior — picture height stable after a Lane appears; Brush arm does not change this-Frame JSON; Apply writes every armed class tag; Shift-click + Backspace drops that segment; eye hides the Lane but GET still has the frames. No assertions on Zustand field names or CSS class strings except stable `aria-*` / `data-*` already used by the suite.
- **Unit seam (tickets 02, 03, 05)**: Small vitest cases for Brush set algebra (phase replace, class toggle), visibility default (missing key + present vs unused), and Frame-from-clientX already used by the Ruler. `tsc` still green on every ticket.
- **Regression (ticket 06)**: Existing Playwright stories for Library this-Frame toggle, Now read-only, Vocab rename/trash, `i`/`o` with a payload, jpeg vs video player, Task-focus tabs, Editor Cards, and Ruler drag stay green — with payload meaning Brush, not last this-Frame write. Tests that armed a chip by toggling this Frame must arm Brush instead.
- **Prior art**: `web/e2e/desk.spec.ts` serial desk tests; `deskStore.test.ts` for sitting state; `timeline.test.ts` for fold.

## Out of Scope

- mask, Session, scribble, canvas.
- Number keys 1–9 as Brush shortcuts.
- Sticky select mode (`S` on/off).
- Marquee-select, dragging a bar’s body to relocate it, trim handles on unselected bars.
- New span HTTP that accepts several class tags in one body.
- Delete-by-boxing on the Ruler or MediaTimeRange.
- Confirm dialog on Backspace.
- Per-Clip visibility maps, server-stored sitting prefs, YAML changes.
- Drag-and-drop Library reorder, Lane reorder.
- Changing Editor Cards, Triplet grid geometry, or Vocab rename/trash rules.

## Further Notes

Preserve existing locators where the story is unchanged (`aria-pressed` on this-Frame Library rows, `data-ruler`, `data-timeline-seg`, Editor Cards). New controls need `aria-label` (`Brush`, `Show lane`, `Hide lane`) so Playwright does not scrape icons. Folded unlabeled dim gaps are not selectable segments. Ghost bars are not Lanes.
