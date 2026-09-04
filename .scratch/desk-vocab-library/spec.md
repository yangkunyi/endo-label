Status: specified — tickets 01–04 resolved

# Spec: Library toggle, Vocab delete on the row, exact-triple table

Parents: `.scratch/desk-colored-library/spec.md`, `.scratch/desk-ruler/spec.md`. Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0019](../../docs/adr/0019-exact-triple-vocab.md). Unique triple: [ADR 0014](../../docs/adr/0014-unique-triplet.md). Rename rewrite: [ADR 0010](../../docs/adr/0010-desk-wide-vocab-rename.md) except triplet Vocab cells, which 0019 supersedes. UI copy stays English. mask stays off this page.

Supersedes sitting stories that hide vocab trash behind List, treat instruments/verbs/targets as three Vocab lists, refuse delete of a column name while in use, and treat Now as the only way to dismiss a this-Frame label (via Remove from). Span HTTP shape, Task focus, Frame indexes, Ruler, and Now fill colors do not change except where this spec says Library selected state.

## Problem Statement

The labeler cannot tell adding a name, toggling this Frame, painting a span, and deleting a desk-wide identity apart. Library looks like it should delete, but trash lives under a folded List. Now is read-only, so a this-Frame label feels stuck unless they use Remove from. Triplet is three word lists instead of one row per combination, so delete/rename do not match class.

## Solution

**This Frame.** Now stays read-only and filled. Library is the this-Frame toggle. A Library row looks **selected** when that identity is on this Frame; click again turns it off. Plus adds a Vocab name only — it does not write this Frame.

**Desk-wide Vocab.** Each Library row has trash. Confirm, then delete that identity everywhere: phase unlabeled, class flag dropped, or that exact triple removed from every Clip. Phase and class: double-click the Library name to rename (rewrite every Clip). The folded List section is gone.

**Triplet Vocab** is the table of exact triples, not three column lists. Plus composes a new row into that table. Typeahead words come from triples that already exist. Trash on a row deletes that triple desk-wide (confirm). Double-click one cell renames that Vocab triple desk-wide; **refuse** if any Frame would then hold two identical triples.

**Migration.** Drop `instruments` / `verbs` / `targets`. Triplet **rows already on Frames stay**. The new table is those unique exact triples. Unused words that never appeared in a row are discarded.

**Span.** Mark from / Apply / Remove still paint an interval of the paint chip. They are not how a Vocab name is deleted.

## User Stories

### This Frame vs Now vs Library

1. As a labeler, I want Now to stay read-only, so that this Frame is a display, not a second editor.
2. As a labeler, I want clicking a Library name or triple row to toggle that identity on this Frame, so that I do not need Remove from for one Frame.
3. As a labeler, I want a Library row to look selected when it is on this Frame, so that I can see what a second click will turn off.
4. As a labeler, I want an unselected Library row to stay a ghost button with a small swatch, so that selected is the only “on” chrome in Library.
5. As a labeler, I want empty Now to stay muted with no fill, so that empty is not a label.
6. As a labeler, I want Now fill to keep matching the timeline color for that identity, so that one identity is one color.

### Plus adds Vocab only

7. As a labeler, I want `+` on phase or class to add a name to the desk list without writing this Frame, so that I can build the list first.
8. As a labeler, I want `+` on triplet to add an exact triple to the Vocab table without writing this Frame, so that composing and labeling stay separate.
9. As a labeler, I want a blank `+` to do nothing, so that empty names never land.
10. As a labeler, I want a duplicate `+` to be rejected, so that the table does not grow twins.

### Vocab delete on the Library row

11. As a labeler, I want a trash control on each phase Library row, so that I do not open a hidden List to delete a name.
12. As a labeler, I want a trash control on each class Library row, for the same reason.
13. As a labeler, I want a trash control on each triplet Library row, so that I delete a combination, not a column word.
14. As a labeler, I want a confirm step before trash, so that I do not wipe every Clip by misclick.
15. As a labeler, I want deleting a phase name to unlabel that phase on every Clip, so that the list and Frames agree.
16. As a labeler, I want deleting a class tag to drop that flag on every Clip, so that the list and Frames agree.
17. As a labeler, I want deleting a Vocab triple to drop that row on every Clip, so that the list and Frames agree.
18. As a labeler, I want the folded List section gone, so that there are not two copies of the same names.

### Rename

19. As a labeler, I want to double-click a phase name in Library to rename it desk-wide, so that Frames follow the new string.
20. As a labeler, I want to double-click a class tag in Library to rename it desk-wide, for the same reason.
21. As a labeler, I want empty or duplicate rename rejected, so that names stay unique.
22. As a labeler, I want to double-click one cell of a Vocab triple to rewrite that triple desk-wide, so that a typo in one word does not require delete-and-readd.
23. As a labeler, I want that triple-cell rename refused when any Frame would then hold two identical triples, so that unique exact triple is not broken.
24. As a labeler, I want a refused rename to leave Frames unchanged, so that a conflict is not a silent merge.

### Triplet table

25. As a labeler, I want Library for triplet to be one row per exact triple, so that a combination is one identity.
26. As a labeler, I want no independent instrument, verb, or target Vocab lists, so that I cannot delete a word out from under rows.
27. As a labeler, I want typeahead for a new triple’s cells to offer words that already appear in the table, so that I can reuse wording without a third list.
28. As a labeler, I want a new word I type into `+` to be allowed, so that the table can grow new wording.
29. As a labeler, I want clicking a triple row to toggle only that exact triple on this Frame, so that other rows on this Frame stay.
30. As a labeler, I want ADR 0014 to still hold: two identical triples cannot sit on one Frame; submit again toggles off.

### Migration

31. As an operator, I want existing triplet rows on Frames kept, so that old labels are not wiped.
32. As an operator, I want the Vocab triple table filled from unique exact triples already on disk, so that Library matches Frames after upgrade.
33. As an operator, I want the old instruments, verbs, and targets lists dropped, so that there is one source of truth.
34. As an operator, I want unused words that never appeared in a triplet row discarded, so that ghosts do not linger.
35. As an operator, I want an existing `vocab.json` that still has column lists to migrate once, so that a second boot does not rebuild from empty.

### Span still interval-only

36. As a labeler, I want Mark from / Apply / Remove to still paint the paint chip across a Frame range, so that interval edit is unchanged.
37. As a labeler, I want Remove from not to delete a Vocab name, so that span off is not desk-wide delete.
38. As a labeler, I want i/o/[ ] to still mark and apply, so that keyboard paint survives.
39. As a labeler, I want painting a triple on across a span to skip Frames that already hold that exact triple, so that unique still holds.

### Sitting chrome that must not regress

40. As a labeler, I want Task focus to still pick phase, class, or triplet, so that Library shows one kind.
41. As a labeler, I want the other two kinds to stay a read-only summary, so that focus is chrome only.
42. As a labeler, I want Ruler, Playhead, and Now fill from desk-ruler to stay, so that this pass does not restyle the player.
43. As a labeler, I want jpeg and video Clips to share this Library, so that kind does not change Vocab.

## Implementation Decisions

- Sitting chrome + Vocab HTTP. Frame JSON for phase/class/triplet instance rows stays the same shape; triplet **Vocab** storage changes from three string lists to a list of exact triples.
- Drop independent `instruments` / `verbs` / `targets` from the Vocab document after migrate. Migrate on read: unique triples from all Clip triplet documents become the table; then persist without the three lists.
- Delete Vocab name: one request, all Clips of that kind rewritten or the request fails with no Clip half-updated (same atomicity as ADR 0010/0012). Confirm in the sitting before the request.
- Rename Vocab triple cell: one request rewriting every matching row; 409/reject if any Frame would violate unique exact triple; no silent drop.
- Library selected = identity present on this Frame. Plus does not PUT this Frame.
- Remove the List disclosure. Rename and trash live on Library rows.
- Typeahead is derived from existing Vocab triples, not a stored third list.
- Span endpoints unchanged. Paint chip still an identity (phase name, class tag, or exact triple).
- ADR 0013/0017/0018 chrome stays. No second kit.

## Testing Decisions

- Test **external behavior**: this-Frame toggle, confirm-then-desk-wide delete, migrate keeps Frame rows, rename collision refuses.
- **Seams (both already in the repo, no third stack):**
  1. **Compose / sitting HTTP** — desk-wide rewrite, migrate, unique-triple refuse (prior art: vocab rename/delete compose tests).
  2. **Playwright `desk` e2e** — Library selected, Plus does not write Frame, trash confirm, List gone, triple rows, span still works (prior art: colored-library / desk-ruler desk.spec).
- Do not unit-test CSS class names. Assert selected vs not, confirm dialog, and HTTP side effects.

## Out of Scope

- Wiping existing triplet rows on Frames
- Cartesian product of old column lists
- Now click-to-clear this Frame
- Plus writing this Frame
- Silent merge on triple rename collision
- mask / Session / Track
- Ruler / player / token restyle
- Changing unique-triple-per-Frame (ADR 0014)
- Independent instrument/verb/target Vocab UI

## Further Notes

Seam check: compose for rewrite/migrate; Playwright for Library chrome. Same two files the last Vocab and desk tickets already own.
