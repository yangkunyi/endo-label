Status: specified — tickets 01–03 ready-for-agent

# Spec: colored labels, named timeline bars, read-only Now, triplet rows

Parents: `.scratch/desk-player/spec.md` (player, Task focus, jpeg/video, span HTTP). Domain: [CONTEXT.md](../../CONTEXT.md). Sitting chrome: [ADR 0016](../../docs/adr/0016-player-task-focus-dual-source.md). Unique triplet: [ADR 0014](../../docs/adr/0014-unique-triplet.md). UI copy stays English. mask stays off this page.

This sitting pass supersedes desk-player stories that put × / toggle on **Now**. Stores, span HTTP, Task focus, and Frame indexes do not change.

## Problem Statement

The labeler cannot tell one label from another on the timeline: every interval is the same primary wash, and the name is only a tooltip. Now still has × / delete, so this-Frame edits live in two places. Triplet still feels like three separate vocab lists, not one label per (instrument, verb, target) row.

## Solution

Every **label** has a stable color. The focused-kind timeline paints each folded interval in that color and shows the label name on the bar. **Now** is read-only (this playhead Frame). All on/off for this Frame happens in **Library**. Triplet Library (and Now) is a three-column table: instrument, verb, target; each row is one triplet label (one exact triple).

Phase name, class tag, and exact triple are the three label identities. Unlabeled gaps stay dim and unnamed. Disk stays sparse per-Frame JSON. No seconds. No mask.

## User Stories

### Color identity

1. As a labeler, I want each phase name to have its own color, so that Preparation and Calot are not the same bar.
2. As a labeler, I want each class tag to have its own color, so that `blurred` and `grasper` are not the same bar.
3. As a labeler, I want each exact triple to have its own color, so that two different rows are not the same bar.
4. As a labeler, I want that color to stay the same when I switch Clips, so that `blurred` does not change costume mid-sitting.
5. As a labeler, I want that color to stay the same when I switch Task focus and come back, so that I can trust the legend.
6. As a labeler, I want two different names to look different enough to tell apart, so that I am not reading identical washes.
7. As a labeler, I want unlabeled time to stay a dim unnamed gap, so that empty is not a fake label color.
8. As a labeler, I want colors to be sitting chrome only, so that JSON on disk does not grow a color field this pass.

### Library swatches

9. As a labeler, I want each phase Library name to show its color, so that I pick by color and by word.
10. As a labeler, I want each class Library name to show its color, so that flags match the band.
11. As a labeler, I want each triplet Library row to show that triple’s color, so that the row matches the band.
12. As a labeler, I want the paint chip to use the same color as the selected label, so that Mark from / Apply still show what I will paint.

### Timeline bars

13. As a labeler, I want each labeled interval on the focused-kind band to fill with that label’s color, so that the band is a legend I can read at a glance.
14. As a labeler, I want the label name to appear on (or immediately above) that interval bar, so that I do not hover for a tooltip to know what I painted.
15. As a labeler, I want a phase interval to show the phase name on the bar, so that a surgical step reads as a titled block.
16. As a labeler, I want a class interval to show that flag’s name on its lane’s bar, so that overlapping flags stay separate titled lanes.
17. As a labeler, I want a triplet interval to show the triple on the bar (instrument / verb / target), so that one action is one titled block.
18. As a labeler, I want a short interval to still expose the name (truncate or title), so that a one-Frame blip is not a nameless speck.
19. As a labeler, I want adjacent different labels to keep a visible join, so that two steps do not melt into one smear.
20. As a labeler, I want clicking a named colored interval to seek to that interval’s start, as today, so that the band stays navigation.
21. As a labeler, I want switching Task focus to rebuild colors and names for the new kind, so that I am not reading class colors on a phase band.
22. As a labeler, I want the band to remain a fold of sparse JSON, so that we do not store interval documents.

### Now is read-only

23. As a labeler, I want Now to show this playhead Frame’s labels for the focused kind, so that the picture and the rail match.
24. As a labeler, I want Now to have no ×, no delete, and no click-to-toggle, so that I cannot edit from Now by accident.
25. As a labeler, I want phase Now to be the one name or unlabeled, read-only, so that I see the step without a second editor.
26. As a labeler, I want class Now to be chips of flags on this Frame, read-only, so that I see what is on without turning them off here.
27. As a labeler, I want triplet Now to be the rows on this Frame, read-only, so that I see the triples without deleting them here.
28. As a labeler, I want Now chips/rows to use the same colors as Library and the band, so that the three places agree.
29. As a labeler, I want seeking the player to update Now without writing, so that scrub is still not a save.

### Toggles live in Library

30. As a labeler, I want clicking a phase Library name to write this playhead Frame (overwrite, or unlabeled if I click the current name), so that on/off is only in Library.
31. As a labeler, I want clicking a class Library name to toggle that flag on this playhead Frame, so that on/off is only in Library.
32. As a labeler, I want clicking a triplet Library row to toggle that exact triple on this playhead Frame (add, or drop if it is already there), so that on/off is only in Library.
33. As a labeler, I want Library to show which labels are on this playhead Frame (selected / lit), so that I can see what a click will do.
34. As a labeler, I want **+** to add vocab only, never a Frame write, so that create is not an accidental toggle.
35. As a labeler, I want blank names rejected, so that lists stay usable.
36. As a labeler, I want List rename/trash unchanged (desk-wide vocab rules), so that renaming a phase still rewrites Clips and deleting a used instrument is still refused.
37. As a labeler, I want turning a label off on this Frame to happen by clicking it again in Library (or Remove span), so that I am not hunting × on Now.

### Triplet as rows

38. As a labeler, I want triplet Library to be a table of three columns — instrument, verb, target — so that a label is one row, not three independent picks.
39. As a labeler, I want each Library row to be one exact triple, so that “grasper / grasp / gallbladder” is one label.
40. As a labeler, I want Now for triplet to use the same three columns, so that Now is the read-only slice of those rows on this Frame.
41. As a labeler, I want column headers to say instrument, verb, and target, so that copy matches the glossary (not action, not organ, not subject–verb–object).
42. As a labeler, I want **+** on triplet to compose one row from three names, so that I can introduce a new triple without writing this Frame.
43. As a labeler, I want **+** to create missing instrument/verb/target vocab names if needed, still without writing this Frame.
44. As a labeler, I want the new row to appear in Library after **+**, so that I can then click it to toggle this Frame.
45. As a labeler, I want Library rows for this Clip to include every distinct triple already on any Frame of this Clip, so that used labels are not missing after reload.
46. As a labeler, I want a composed row that is not yet on any Frame to remain in Library for this sitting, so that I can paint it after I add it.
47. As a labeler, I want two identical triples to remain one row (unique), so that ADR 0014 still holds.
48. As a labeler, I want not to see a cartesian product of every instrument × verb × target, so that the table stays a list of real labels.

### Span paint (unchanged contract, colored chip)

49. As a labeler, I want Mark from / Apply / Remove to paint the Library selection (paint chip) across the player range, so that a step is not one click per Frame.
50. As a labeler, I want i / [ and o / ] to keep working when I am not typing, including while Seek is focused, so that keyboard span still matches the buttons.
51. As a labeler, I want a successful span to toast and to show the new colored named intervals, so that I know it landed.
52. As a labeler, I want no selection to disable range write, so that empty commits never hit disk.
53. As a labeler, I want class span to union or drop one flag, phase span to overwrite, triplet span to add-or-skip / remove that exact triple, as today.

### Unchanged law

54. As a labeler, I want copy to say phase, class, triplet — not Annotation.
55. As a labeler, I want no Session to edit these three.
56. As a labeler, I want Task focus still one kind at a time; the other two remain a read-only summary.
57. As a labeler, I want clicking a summary chip to switch focus only, not the playhead.
58. As a labeler, I want jpeg and video Clips to keep the same player and Frame indexes.
59. As a labeler, I want mask absent from tabs, Library, Now, and the band.
60. As an operator, I want compose health without GPU.

## Implementation Decisions

- **No store change.** Sparse per-Frame phase/class/triplet JSON stays. No color field, no interval documents, no seconds, no new triplet-library file this pass.
- **Label identity.** Phase: the phase name. Class: the class-tag name. Triplet: the exact triple `instrument / verb / target` (same uniqueness as ADR 0014). Color is a pure function of that identity (stable across Clips and reloads). Unlabeled is not an identity.
- **Where color shows.** Library row/name, read-only Now, paint chip, and focused-kind timeline segments share that function. Do not invent a second palette per surface.
- **Timeline.** Keep display-only fold of sparse JSON (one phase lane; one class lane per flag that appears on the Clip; one triplet lane per distinct triple on the Clip). Labeled segments use the label color and show the name on or immediately above the bar. Unlabeled gaps stay dim, no name. Click still seeks to segment start. Adjacent labeled segments keep a visible join.
- **Now.** Render only. No ×, no delete control, no click handler that writes. Lit state in Library is the affordance for this-Frame on/off.
- **Library writes.** Unchanged HTTP: phase PUT this Frame (overwrite or clear), class PUT toggle flag, triplet POST toggle-unique. **+** remains vocab POST only.
- **Triplet table.** Library and Now are three columns: instrument, verb, target. One row = one exact triple = one label. Headers use those glossary words.
- **Triplet Library population.** Rows = distinct triples present on this Clip, union rows composed with **+** during this sitting. Do not expand a cartesian product of the three vocab lists. Unused composed rows need not survive reload this pass (if they must, that is a later vocab-of-triples store — out of scope).
- **Triplet +.** Three fields; reject blank; ensure the three vocab names exist; insert the row into the sitting Library; do not write a Frame.
- **Span.** Existing span POST. Paint chip is the focused label (phase name, class tag, or whole triple). Keyboard span unchanged (including Seek-focused i/o/[]).
- **Kit.** Same dark shadcn sitting. English copy. No HeroUI. No light switch.

## Testing Decisions

- **Good test:** sitting behavior the labeler can see. Assert names, colors as a stable identity (same label → same token/swatch on Library, Now, and band), Now not writing, Library writing, triplet row toggle. Do not assert CSS class names, hex literals, or Zustand keys.
- **Seam (one, existing):** **Playwright** against the desk — same stack as `desk.spec.ts`.
  - Library click still writes this Frame; Now has no control that writes (no × / delete).
  - Two different phase (or class) names get different colors; the matching timeline interval shows that name and the same color token.
  - Triplet Library is three columns; clicking a row toggles that exact triple; Now lists the row read-only.
  - **+** on triplet adds a Library row and does not write the playhead Frame until the row is clicked.
- **Keep** compose HTTP tests as they are; this pass does not change APIs. Existing timeline fold unit tests stay valid if fold output still carries the label string; do not add a third test stack for palette math.
- **Prior art:** `web/e2e/desk.spec.ts`, `web/src/timeline.test.ts`.

## Out of Scope

- mask, Track, Session, Predict, Propagate.
- Persisting colors or a desk-wide list of complete triples on disk.
- Cartesian Library of every instrument × verb × target.
- Interval documents as the canonical store; seconds in JSON; transcode / Frame Pool writes.
- Light theme; phone layout; CI GPU; export/train.
- Changing rename/trash rules or unique-triplet HTTP.
- Putting toggles back on Now.

## Further Notes

- Desk-player story “× on Now chips/rows to change this Frame only” is superseded for sitting chrome. Library (and Remove span) is the write path.
- Glossary: spoken **class** / **triplet**; columns **instrument**, **verb**, **target**. User’s 器械 / 动作 / 器官 map to those three; UI must not say action, organ, or subject–verb–object.
- ADR 0014 and ADR 0008 stand. ADR 0016’s Now / Library / summary shell stands; Now becomes display-only.
- Tickets: `issues/01-readonly-now.md`, `02-colored-named-band.md`, `03-triplet-rows.md` all resolved.
