Status: specified — tickets 01–03 resolved

# Spec: HeroUI label tables (phase / class / triplet)

Parents: `.scratch/desk-workbench/spec.md` (shell, play, span keys, layout) and `.scratch/phase-class-triplet/spec.md` (stores, independence). This spec **replaces the right-rail cards**, Arm buttons, operation on/off, and chevron folds. It does not add mask. UI copy stays English: phase, class, triplet, instrument, verb, target.

## Problem Statement

The sitting still looks like a stone form. HeroUI is a dependency, not the look. Span is explained as “Arm class span” / “operation on”. Triplet is three `<select>`s plus Add row. The labeler asked for tables, plus/x rows, double-click names, and a full visual pass that actually uses HeroUI.

## Solution

Keep ADR 0007 shell: left Clip rail, center JPEG (`object-contain`), bottom slider + play, `[` / `I` and `]` / `O`, Space play/pause, localStorage sizes and editor order, no Frame filmstrip, no page jump.

Right rail: three **HeroUI Tables**, default order class, triplet, phase, drag to reorder, **no fold**. Use HeroUI Table, Select, Button (and Slider/Listbox on the shell). Do not override them with `stone-*`.

**phase table.** One row per name on the desk phase list. Single-select. The selected row is this Frame’s phase (or none if unlabeled). Click a row: PUT this Frame to that name immediately. Plus: empty row at the bottom; Enter commits a new vocab name, selects it (writes this Frame). x: clear this Frame’s phase (deselect). Double-click the name: desk-wide rename (ADR 0010).

**class table.** One row per class-tag name. Multi-select = flags **on** this Frame. Click: toggle that flag on this Frame (chip semantics). Plus: empty row, Enter adds vocab and turns it on this Frame. x: turn that flag off this Frame (does not delete vocab). Double-click: desk-wide rename of that class tag.

**triplet table.** Rows are this Frame’s instance rows. Columns: instrument | verb | target. Plus: empty row; POST that row only when all three cells are filled. x: DELETE that row. Double-click a cell: change **this row** on this Frame (immediate persist). Typing a new word in a cell: add it to that list, then use it; do not rename other rows or Clips. Incomplete rows are not written and cannot be span targets.

**Span.** Selection **is** the payload. No Arm control. HUD: **Write to span** (default) / **Remove from span**. `[` marks from; `]` writes. `]` without `[` = this Frame only (already applied by click for phase/class; still needed for triplet span-on-one-frame).

- Write: phase overwrites the selected name; class unions every selected tag; triplet idempotent-adds every selected **complete** row (multi-select allowed).
- Remove: phase clears the range (`phase: null` on span); class removes each selected tag; triplet deletes matching triples by name.

Keys ignored in inputs. Play pauses on successful span write.

**Out of this pass:** vocab delete; mask; Task-focus; global rename of instrument/verb/target lists (only phase and class-tag tables do rename).

## User Stories

### Look and shell

1. As a labeler, I want the workbench to use HeroUI components for tables, selects, buttons, and the slider, so that the desk does not look like the stone form.
2. As a labeler, I want the same layout as the workbench spec (Clip | JPEG | tables, slider below), including play, skip-N, fps control, and localStorage split sizes.
3. As a labeler, I want to drag the three tables to reorder them, with no chevron fold.
4. As a labeler, I want copy to say phase, class, triplet, instrument, verb, target — not Arm, not subject–verb–object, not Annotation.

### phase table

5. As a labeler, I want every phase name on the desk list as a row, and at most one row selected, equal to this Frame’s phase.
6. As a labeler, I want a click on a phase row to persist that name on this Frame immediately.
7. As a labeler, I want x on a phase row to clear this Frame only.
8. As a labeler, I want plus then a new name + Enter to add the name to the list and select it (write this Frame).
9. As a labeler, I want double-click + a new string to rename that phase everywhere on the desk, including every Clip’s Frames that had the old string.
10. As a labeler, I want duplicate or blank rename rejected, with the old name still on disk.

### class table

11. As a labeler, I want every class-tag name as a row; selected rows are exactly the flags on this Frame.
12. As a labeler, I want a click to toggle that flag on this Frame only, stackable.
13. As a labeler, I want plus + Enter to add a tag name and turn it on this Frame.
14. As a labeler, I want x to turn that flag off this Frame, not delete it from the list.
15. As a labeler, I want double-click rename of a class tag to rewrite that string in every Clip’s class document, not in triplet instruments.

### triplet table

16. As a labeler, I want this Frame’s rows as a three-column table: instrument, verb, target.
17. As a labeler, I want plus to append an empty row, and a write only when all three cells have names on the matching lists.
18. As a labeler, I want x to delete that row on this Frame.
19. As a labeler, I want double-click on a cell to change that row only, immediately.
20. As a labeler, I want typing a new word in a cell to add it to that vocab list and use it on this row, without renaming other Frames.
21. As a labeler, I want two rows with the same triple still allowed on this Frame (instance rows, not a vocab list).

### Span without Arm

22. As a labeler, I want the HUD to say Write to span or Remove from span, default Write, and to list the selected phase name, class tags, and complete triplet rows that will be sent.
23. As a labeler, I want `[` / `I` then `]` / `O` to persist immediately using that HUD direction and selection.
24. As a labeler, I want Remove from span to clear phase on the range, remove selected class tags, and delete matching triplet triples by name, independently per kind.
25. As a labeler, I want incomplete triplet rows ignored by span.
26. As a labeler, I want no control labeled Arm, armed, or operation on/off.

### Unchanged

27. Immediate persist; Frame index in Zustand; Clip in the URL; no mask; no Task-focus; no Session for these three.

## Implementation Decisions

- **HTTP:** Keep class/triplet span POST (ADR 0008). Phase span POST accepts `phase: null` to clear a range. Vocab rename: one request per list (`phases` or `class_tags`) with `{from, to}` that rewrites that list and every Clip document of that kind, or fails with no partial Clip left renamed.
- **Triplet cell edit:** update that Frame’s triplet document only (replace the row’s field or delete+add with the same id if ids must stay).
- **UI kit:** `@heroui/react` Table, Select, Button, Slider; lucide plus/x. No `stone-*` chrome. `@import "@heroui/styles"` stays.
- **No fold state** in Zustand for these three tables. Editor **order** and split sizes stay localStorage (ADR 0007).
- **Selection:** phase selected row ↔ this Frame’s phase string; class selected rows ↔ this Frame’s tag set; triplet selected rows are UI-only until span (clicking a triplet row does not POST).
- **Desktop** 1280×800 class sitting.

## Testing Decisions

- Compose: phase span null range; vocab rename rewrites two Clips and rejects duplicate; class/triplet span still independent; rename class tag does not change triplet instrument strings.
- Playwright: HeroUI tables visible; no “Arm class span”; click phase row writes this Frame; class multi-select; triplet plus empty row then three cells persist; double-click triplet cell does not rename other Frames; HUD Write/Remove; `[` `]` ; no filmstrip; Space play.

## Out of Scope

- mask, Task-focus, vocab delete, rename of instruments/verbs/targets lists, timestamps, shadcn, copying the old SAM desk, phone layout, undo.

## Further Notes

- [ADR 0006](../../docs/adr/0006-heroui-lucide.md), [0007](../../docs/adr/0007-single-page-workbench.md), [0008](../../docs/adr/0008-class-triplet-span.md), [0009](../../docs/adr/0009-heroui-label-tables.md), [0010](../../docs/adr/0010-desk-wide-vocab-rename.md).
- Tickets: `issues/01-heroui-tables-write-this-frame.md`, `issues/02-remove-from-span.md`, `issues/03-desk-wide-vocab-rename.md`.
