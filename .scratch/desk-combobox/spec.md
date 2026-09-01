Status: specified — tickets 01–03 ready-for-agent

# Spec: shadcn Pick+Create desk (paint chip, Mark from, Apply)

Parents: `.scratch/desk-dark/spec.md` (dark sitting, empty vocab, trash vs x) and `.scratch/desk-workbench/spec.md` (one workbench, Clip rail, slider, play). Kit: [ADR 0013](../../docs/adr/0013-shadcn.md). Triplet uniqueness: [ADR 0014](../../docs/adr/0014-unique-triplet.md). Sitting chrome: [ADR 0015](../../docs/adr/0015-combobox-desk.md). This spec does not add mask. UI copy stays English.

## Problem Statement

The labeler cannot tell when an interval write happened. `[` looks like a mode. **Write to span** does not write — it only switches direction. `]` / `O` persist with no toast and no lasting mark. The right rail is three crowded tables. Adding a name is plus-then-fill, not a dropdown. The sitting is ugly and the interval gesture is unlearnable.

## Solution

Throw the sitting chrome and the interval *gesture*. Keep the three stores and the span HTTP, except this-Frame triplet POST becomes toggle-on-unique (ADR 0014).

One dark shadcn workbench: Clip rail, JPEG, right stack **class → triplet → phase** (fixed order), bottom slider + play. Each editor is a Pick+Create combobox (pick existing vocab or type a new name: the name joins that list and writes this Frame). The last write is a visible **paint chip**. Mark from pins one slider end; the current Frame is the other; the track fills and shows `from → to`. **Apply to frames** and **Remove from frames** actually POST the chip. Success: toast plus a brief slider flash; from clears; the chip stays. Failure: red toast, no flash. No chip: Mark from, Apply, Remove, and `[` `]` do nothing.

This-Frame off: phase re-picks the current name to unlabeled; class chips (and re-picking a lit name) toggle that flag; triplet re-submits the same triple to drop it (at most one row per exact triple). Vocab rename/trash stay in a closed List per editor, never on the combobox. `]` / `O` always Apply. Remove is the Remove button only.

## User Stories

### Sitting shell

1. As a labeler, I want `/` and `/clips/:clipId` to be the same workbench, so that picking a Clip does not unload the rails.
2. As a labeler, I want a left rail of allowlisted Clips with Frame counts, so that I open a real Clip from the Frame Pool.
3. As a labeler, I want the center JPEG contained, never cropped, so that anatomy is not clipped.
4. As a labeler, I want a bottom slider to scrub `0..N-1` without writing labels, so that moving is not a save.
5. As a labeler, I want Space to play and pause (ignored in inputs), so that I can watch the Clip.
6. As a labeler, I want playback fps (default 1, also 10 and 25) and skip-every-N, so that I can skim a JPEG pool with no fps metadata.
7. As a labeler, I want play not to loop, and to pause when an interval write succeeds, so that I can see where the write landed.
8. As a labeler, I want to drag Clip-rail width, editor-rail width, and bottom-bar height, with those sizes in a **new** localStorage key, so that an old 416px rail does not stick.
9. As a labeler, I want class, triplet, and phase in that fixed order, not drag-reorderable, so that the right rail is predictable.
10. As a labeler, I want the sitting always dark, with no light switch, so that the JPEG and selected controls contrast.
11. As a labeler, I want shadcn controls, not HeroUI Tables, so that the bench does not read as three CRUD grids.
12. As a labeler, I want no Frame filmstrip, no Arm control, and no Task-focus switch, so that all three Task types stay usable on this Frame.
13. As a labeler, I want English copy, so that the desk matches prior sitting specs.
14. As a labeler, I want desktop sitting (1280×800 class), not a phone layout.

### Pick+Create on this Frame

15. As a labeler, I want a class combobox that lists class tags, so that I can pick a flag onto this Frame.
16. As a labeler, I want to type a new class tag and commit, so that the name joins `class_tags` and turns on for this Frame.
17. As a labeler, I want chips of the flags on this Frame, so that stacked class is visible next to the JPEG.
18. As a labeler, I want clicking a class chip to turn that flag off on this Frame, so that I do not hunt the combobox to undo.
19. As a labeler, I want picking a class tag that is already on this Frame to turn it off, so that the combobox also toggles.
20. As a labeler, I want a triplet row of three comboboxes (instrument, verb, target), so that I can Pick+Create each cell.
21. As a labeler, I want a complete triple to write this Frame only when all three cells are filled, so that half-rows do not persist.
22. As a labeler, I want a new word in a triplet cell to join that vocab list and be used on the row, so that I do not visit a second add-name form.
23. As a labeler, I want several *different* triples on this Frame, so that more than one action can be true.
24. As a labeler, I want at most one row per exact triple on this Frame, so that Pick+Create can toggle.
25. As a labeler, I want submitting a triple that is already on this Frame to delete that row, so that off is the same gesture as on.
26. As a labeler, I want × on a triplet instance row to delete that row on this Frame, so that I can remove without retyping.
27. As a labeler, I want a phase combobox showing this Frame’s phase or empty, so that exclusive phase is one control.
28. As a labeler, I want picking a phase name to overwrite this Frame’s phase, so that phase never stacks.
29. As a labeler, I want re-picking the current phase name to unlabeled this Frame, so that clear is a toggle.
30. As a labeler, I want typing a new phase name to add it to `phases` and paint this Frame, so that the list can grow in sitting.
31. As a labeler, I want blank or whitespace-only create to be rejected, so that vocab lists stay usable.
32. As a labeler, I want unknown names rejected by the server as today, so that the combobox cannot invent a spelling that is not on the matching list after a failed create.
33. As a labeler, I want each successful this-Frame write persisted immediately, so that refresh does not drop it.
34. As a labeler, I want writing class to leave phase and triplet on this Frame untouched, and the same independence the other way, so that editors do not wipe each other.
35. As a labeler, I want empty vocab lists on a fresh sitting, with placeholder `Type to add`, so that I am not stuck with seed names.

### Paint chip

36. As a labeler, I want the last this-Frame Pick+Create (or toggle-on) to become the visible paint chip, so that I know what Apply will write.
37. As a labeler, I want the chip to name the Task type and the payload (`class: blurred`, `phase: Calot`, `triplet: a / b / c`), so that I do not guess.
38. As a labeler, I want a later Pick+Create to replace the chip without clearing Mark from, so that I can change the payload mid-range.
39. As a labeler, I want no chip when nothing has been written this sitting (or after a toggle-off that leaves no payload), so that Apply cannot fire a ghost name.
40. As a labeler, I want Mark from, Apply, Remove, `[`, `]`, `I`, and `O` to do nothing when there is no chip, so that empty commits never hit the disk.

### Interval

41. As a labeler, I want Mark from (and `[` / `I`) to pin the current Frame as one end of the range, so that I can walk to the other end.
42. As a labeler, I want the slider fill and the numbers `from → to` (order-insensitive, inclusive) while from is set, so that the range is visible.
43. As a labeler, I want the current Frame to be the other end until I Apply or Remove, so that scrubbing aims the range.
44. As a labeler, I want **Apply to frames N–M** to POST the chip across that range, so that the button is a real write.
45. As a labeler, I want **Remove from frames N–M** to POST the inverse for that chip (phase unlabeled, one class flag off, matching triples removed by name), so that interval off is explicit.
46. As a labeler, I want those two buttons to show the Frame numbers, so that I know the span before I press.
47. As a labeler, I want Apply without Mark from to write only this Frame, so that a single-Frame apply uses the same button.
48. As a labeler, I want Remove without Mark from to affect only this Frame for the chip, so that off-this-Frame does not need a range.
49. As a labeler, I want `]` / `O` to mean Apply only, never Remove, so that a key is not a hidden direction switch.
50. As a labeler, I want those keys ignored in inputs, so that typing a vocab name does not paint.
51. As a labeler, I want no control whose only job is switching write vs remove without persisting, so that I am not lied to.
52. As a labeler, I want the words “span mode” absent from the desk, so that Mark from is not a mode.
53. As a labeler, I want a successful Apply/Remove to toast what was written and on which Frames, so that I know it happened.
54. As a labeler, I want the slider range to flash on success, so that I see *where* it happened.
55. As a labeler, I want from to clear after success and the chip to stay, so that I can paint the next interval with the same name.
56. As a labeler, I want a failed write to toast in red without flashing the slider, so that I do not think it stuck.
57. As a labeler, I want a class interval on to union that one flag, so that other flags on those Frames stay.
58. As a labeler, I want a phase interval to overwrite phase on every Frame in range, so that exclusive phase still holds.
59. As a labeler, I want a triplet interval on to add the triple where missing and skip Frames that already hold it, so that a second Apply does not duplicate.
60. As a labeler, I want a range outside `0..N-1` rejected, so that I cannot write a Frame that does not exist.
61. As a labeler, I want an interval of one kind to leave the other two stores untouched.

### Vocab List

62. As a labeler, I want a closed List per editor, so that rename and trash do not sit in the combobox.
63. As a labeler, I want phase and class Lists to double-click rename (desk-wide rewrite), so that ADR 0010 still holds.
64. As a labeler, I want trash on a phase or class-tag name to delete it from the list and rewrite every Clip of that kind, or fail with nothing half-updated, so that ADR 0012 still holds.
65. As a labeler, I want triplet Lists (instrument, verb, target) to trash a name or 409 while any row still uses it, so that a triple is not silently stripped.
66. As a labeler, I want × on a this-Frame chip or row to never delete a vocab name, so that x vs trash stays.
67. As a labeler, I want leftover seed names on an old `vocab.json` gone only when I trash them, not wiped at startup.

### Unchanged product law

68. As a labeler, I want copy to say phase, class, and triplet — not Annotation.
69. As a labeler, I want no Session to edit these three, so that a labels-only sitting needs no GPU.
70. As a labeler, I want Frame index in sitting state, Clip id in the URL.
71. As a labeler, I want the Frame Pool JPEGs read-only.

## Implementation Decisions

- **Seam:** existing compose HTTP plus the existing Playwright desk. No new backend process. Span routes unchanged (`POST` phase/class/triplet span). This-Frame triplet `POST` changes: if that exact triple is already on the Frame, delete those rows (toggle off) and return the remaining list; else append one row. Several different triples still stack. Old duplicate rows on disk collapse on the next write of that Frame (toggle off removes every matching row).
- **Kit:** remove HeroUI from the desk. Add shadcn (copied components) + Tailwind. Lucide may stay. Always `dark` tokens; no theme toggle. New localStorage layout key; default editor rail still in the compact band (about 280, clamp ~220–420).
- **Right rail:** no Table, no fold chevron, no drag-reorder. class combobox + this-Frame chips; triplet instance rows + three comboboxes; phase combobox. Order class, triplet, phase.
- **Paint chip:** sitting state, not a server field. Set on a successful this-Frame write/toggle-on. Cleared when the last toggle-off leaves no payload to paint. Independent of Mark from.
- **Mark from:** sitting state `{ clipId, frameIndex }`. Slider fill is visual; from/to sent to span HTTP are that index and the current Frame, swapped if needed. Apply/Remove labels include those numbers.
- **Keys:** document listeners; skip editable targets. `[`/`I` Mark from if chip exists. `]`/`O` Apply if chip exists. Space play. No key for Remove.
- **List:** per-editor disclosure. Rename/trash HTTP unchanged.
- **Toasts:** client-only; not stored. Success copy names the chip and the inclusive Frame range. Do not add undo.

## Testing Decisions

- **Good test:** drive the public HTTP or the sitting, assert disk and what the labeler sees. Do not assert HeroUI/shadcn class names or Zustand keys.
- **Compose (existing TestClient):** replace “identical triples allowed” with: second POST of the same triple on this Frame removes it; a different triple still stacks; span add still skips Frames that have it; span remove still deletes by name; class/phase independence; leftover duplicate rows on a document disappear when that triple is toggled off.
- **Playwright (existing local Chromium sitting):** dark workbench; no HeroUI table grid as the editors; Pick+Create a class/phase/triple onto this Frame; chip visible; Mark from then scrub then Apply writes the range; toast + slider flash; from gone, chip remains; Write-to-span direction toggle absent; `]` applies; Remove button removes; no chip → Apply does not write; no Arm; no filmstrip; List trash vs this-Frame ×; empty vocab placeholder.
- **Prior art:** `tests/test_compose.py`, `web` Playwright e2e, `web/src/*.test.ts` for client helpers if the chip/from state is worth a unit — prefer e2e for gesture.

**Seams (two, both existing):** (1) FastAPI TestClient — triplet uniqueness/toggle and unchanged span. (2) Playwright against the desk — gesture, chip, toast, shadcn sitting. No third seam.

## Out of Scope

- mask, Track, Session chrome, Predict, Propagate, canvas library.
- Task-focus; light theme; OS theme sync.
- Undo, draft, Save.
- Wiping `vocab.json` on boot; rename of instrument/verb/target lists.
- Filmstrip; editor drag-reorder; Arm; numeric from/to fields; ComboBox from HeroUI.
- Phone layout; CI for Playwright; export; review.

## Further Notes

- Glossary: `CONTEXT.md` (triplet unique per Frame; no Task-focus; Annotation still the mask store).
- ADR 0008 span HTTP stays. ADR 0009 tables superseded by 0015. ADR 0006 superseded by 0013. ADR 0011 always-dark stands. ADR 0012 trash stands.
- Do not re-open mask in this spec.
- Tickets: `issues/01-unique-triplet-toggle.md`, `issues/02-shadcn-pick-create.md`, `issues/03-paint-chip-apply.md` (`ready-for-agent`). Frontier is 01. 02 includes full HeroUI removal. 03 is interval gesture.
