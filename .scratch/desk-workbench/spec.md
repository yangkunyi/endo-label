Status: specified — tickets 01–06 resolved

# Spec: desk workbench (Clip rail, slider, span keys, HeroUI)

Parent specs: `.scratch/phase-class-triplet/spec.md` (writes, vocab, independence) and `.scratch/desk-appearance/spec.md` (collapsible forms, summaries). This spec changes sitting chrome, Frame transport, and adds class/triplet **span** HTTP. It does not add mask.

## Problem Statement

The labeler picks a Clip, scrubs Frames, and writes phase / class / triplet on the same Frame. Today that is two pages (`/` then `/clips/:clipId`), a left **Frame** thumbnail strip, numeric phase from/to, and a stone/emerald form. Picking another Clip unloads the desk. There is no play. class and triplet are current-Frame only unless the labeler clicks every index.

This sitting should feel like one workbench: Clips on the left, JPEG in the middle, editors on the right, a slider (and play) at the bottom, modern HeroUI chrome, and an interval paint for all three Task types.

## Solution

One desktop workbench (HeroUI + lucide, ADR 0006–0007):

- `/` and `/clips/:clipId` render the same page. Empty `/`: Clip list, no JPEG until a Clip is opened. Opening a Clip sets the URL to `/clips/:clipId` without replacing the shell. Frame index stays in Zustand.
- **Left rail:** allowlisted Clips, scroll. No Frame thumbnails.
- **Center:** current JPEG, `object-contain`, never cropped.
- **Right rail:** class, triplet, phase cards (default that order). Drag to reorder. Chevron folds from desk-appearance stay. Summaries still writable on the current Frame.
- **Bottom:** range slider for Frame index; play/pause; playback fps control.
- Drag borders: Clip width, editor width, bottom-bar height. Order + those sizes in **localStorage**.

**Play.** Space toggles play/pause (ignored in text inputs). JPEG pool has no fps: the desk exposes a playback fps control, default **1**, also 10 and 25, plus skip-every-N Frames. Loop off. Writing a span pauses play. Play only calls scrub; it does not write labels or open a Session.

**Span.** `[` / `I` marks from on the current Frame. `]` / `O` marks to and writes immediately (inclusive, order-insensitive, same as phase span). No from/to number fields. Each editor can **arm** (on or off). Several editors may be armed; the write runs once per armed kind. HUD next to the slider lists every line that will be written (Task type, name/triple, on vs off). If nothing is armed, the write uses the **focused** editor (last clicked card); the HUD must show that. `]` without `[` writes only the current Frame. Keys are ignored when focus is in an input/textarea/select.

**Writes.**

- phase: existing span POST; overwrites the name on every Frame in range.
- class: new span POST; **union** one tag on, or remove that one tag, on every Frame in range.
- triplet: new span POST; add the triple where missing, or remove matching triples by name.

Chip toggle, Add row, Delete, and Clear this Frame still affect **this Frame only**. Immediate persist. Independent stores. Not Task-focus.

## User Stories

### Workbench

1. As a labeler, I want `/` to show the workbench with a Clip list and an empty center, so that I do not visit a separate list page.
2. As a labeler, I want clicking a Clip in the left rail to show that Clip’s Frame 0 (or the last index if I already had this Clip open this sitting) and to set the URL to `/clips/:clipId` without unloading the rails.
3. As a labeler, I want the left rail to list allowlisted Clips and Frame counts, scrollable, with no coverage %.
4. As a labeler, I want no Frame thumbnail strip, so that the left rail is Clips only.
5. As a labeler, I want the current JPEG contained in the center, never cropped.
6. As a labeler, I want a bottom slider to scrub any index `0..N-1` without writing labels.
7. As a labeler, I want to drag the Clip-rail width, the editor-rail width, and the bottom-bar height, and have those sizes survive a refresh on this machine.
8. As a labeler, I want to drag the three editor cards to change their order, default class then triplet then phase, surviving refresh on this machine.
9. As a labeler, I want chevrons and always-on summaries (chips, triplet Delete, Clear this Frame’s phase) as in desk-appearance.
10. As a labeler, I want desktop sitting only this pass.

### Play

11. As a labeler, I want Space to play and pause the JPEG sequence (scrub on a timer), so that I can watch the Clip.
12. As a labeler, I want to set playback fps (default 1; also 10 and 25) because the Frame Pool has no fps metadata.
13. As a labeler, I want an option to advance every Nth Frame while playing, so that I can skim.
14. As a labeler, I want play not to loop, and to pause when a span write succeeds.
15. As a labeler, I want play to leave phase, class, and triplet unchanged, and not to open a Session.

### Span keys and HUD

16. As a labeler, I want `[` or `I` to set the span start to the current Frame when at least one write target is known (armed or focused).
17. As a labeler, I want `]` or `O` to set the end, swap if needed, and persist immediately.
18. As a labeler, I want `]` without a start to write only the current Frame.
19. As a labeler, I want each editor to arm independently, including add vs remove for class and triplet, and several to be armed at once.
20. As a labeler, I want `]` to call one span HTTP per armed kind, so that Calot and `blurred` can land on the same range in one gesture.
21. As a labeler, I want an unarmed `]` / `[` to use the focused editor card, and I want the HUD to show that target before I press the key.
22. As a labeler, I want the HUD to list type + label (or triple) + add/remove for every line that will write.
23. As a labeler, I want these keys ignored while I type a new vocab name or other text field.
24. As a labeler, I want chip clicks and Add row to keep writing only the current Frame, so that arming is a separate control.

### class / triplet interval (ADR 0008)

25. As a labeler, I want a class span **on** to add that one flag to every Frame in range without dropping other flags.
26. As a labeler, I want a class span **off** to remove that one flag from every Frame in range.
27. As a labeler, I want a triplet span **on** to add the row to each Frame that does not already have that exact triple.
28. As a labeler, I want a triplet span **off** to delete rows matching that triple by name on every Frame in range.
29. As a labeler, I want a range that steps outside `0..N-1` rejected.
30. As a labeler, I want a span of one kind to leave the other two stores untouched.
31. As a labeler, I want names not on the desk vocab rejected, same as single-Frame writes.

### Unchanged parent contracts

32. As a labeler, I want copy to say phase, class, and triplet — not Annotation.
33. As a labeler, I want no mask tools, no Session chrome, and no Task-focus switch.
34. As a labeler, I want each successful write on disk immediately, with no draft and no Save.
35. As a labeler, I want Frame index out of the URL.

## Implementation Decisions

- **Seam:** compose HTTP. New routes: `POST /api/class/{clip}/span` with `tag`, `from`, `to`, `on` (bool); `POST /api/triplet/{clip}/span` with `instrument`, `verb`, `target`, `from`, `to`, `op` (`add` | `remove`). Phase span unchanged. Inclusive; if `from > to`, swap. One document rewrite per kind.
- **UI kit (ADR 0006):** HeroUI + lucide-react. No shadcn. No new canvas library.
- **Routes (ADR 0007):** both `/` and `/clips/:clipId` mount the workbench. Clip id from the URL; Frame index Zustand; layout localStorage.
- **Playback fps:** UI state (and may live next to layout in localStorage). Not a field in label JSON. Not required in `config.yaml` this pass.
- **Folds:** keep desk-appearance defaults (phase form open; class body and triplet form closed) unless the open Clip already has fold state this sitting.
- **Keys:** document-level listeners, skip when the event target is editable.
- **Focus:** last pointer activation on an editor card. HUD reads armed set if non-empty, else that card’s current payload.
- **Splitters:** pointer-drag, no extra dock library required.
- **Desktop only.** Playwright viewport 1280×800 remains the sitting class.

## Testing Decisions

- **Good test:** compose TestClient for the two new span routes (union/remove class; idempotent add / name-delete triplet; independence; out of range; unknown vocab). Playwright for workbench sitting.
- **Must cover on the desk:** open Clip from left rail (URL changes, JPEG shows); slider scrubs; Space plays and pauses; HUD visible; arm class + phase, `[` then `]` writes both; unarmed `]` uses the focused card and HUD matches; chip still toggles only this Frame; reorder survives reload (localStorage); no Frame filmstrip; three headings still present.
- **Do not test:** mask, timestamps, reading fps from JPEGs, mobile, shadcn, copying the old SAM desk.

## Out of Scope

- mask, Track, Session, Predict, Propagate, canvas library.
- Task-focus / exclusive mode.
- Time-based labels; fps inside JSON; Frame Pool video files.
- Vocab delete/rename; logins; per-labeler vocab (ADR 0004).
- shadcn/ui; copying `sam3_1_label_tool` pages.
- Phone/tablet layout.
- Undo / draft / Save.
- Export.

## Further Notes

- Stack: [ADR 0001](../../docs/adr/0001-frontend-stack.md) as amended by [ADR 0006](../../docs/adr/0006-heroui-lucide.md). Workbench: [ADR 0007](../../docs/adr/0007-single-page-workbench.md). Span stores: [ADR 0008](../../docs/adr/0008-class-triplet-span.md). Collapse: [ADR 0005](../../docs/adr/0005-desk-bench-chrome.md) still applies except the left filmstrip.
- Glossary: `CONTEXT.md` — class and triplet may paint an interval; **Annotation** still means the mask disk store; **Task focus** still do not use.
- Tickets: none yet. `/to-tickets` when someone wants them.
