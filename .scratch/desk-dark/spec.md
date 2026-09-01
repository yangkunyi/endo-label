Status: specified — tickets 01–03 resolved

# Spec: dark compact rail, vocab delete, visible span

Parents: `.scratch/desk-tables/spec.md` (three tables, selection is span payload, no Arm) and `.scratch/desk-workbench/spec.md` (shell, play, `[` `]`). This spec does not add mask. UI copy stays English.

## Problem Statement

The right rail is too wide (default 416px, triplet ComboBoxes force a horizontal scroll). Selected rows barely read on `stone-100`. Seed vocab names cannot be removed. `[` / `]` still has no visible from. The labeler asked for dark.

## Solution

**Dark sitting.** HeroUI dark on the root. No light toggle. No `stone-*` chrome. Compact tables (tighter rows). Right rail default **280px**, min **220**, max **420**. New localStorage layout key so an old 416px width does not stick.

**On-frame vs span payload.** Rows already written on this Frame use a strong filled selected state. The span payload (snapshotted at `[`) uses outline/check — not the same color. After `[`, scrubbing to an unlabeled Frame still shows the frozen HUD payload with the outline.

**phase / class tables.** Still vocab rows. Click / plus+Enter / x / double-click rename unchanged (x = this Frame only). Extra **trash** on the row: delete that vocab name (ADR 0012).

**triplet table.** Instance rows stay. Three **short native inputs** with a native `datalist` of that list (not HeroUI ComboBox). Enter or blur commits; a new word is added to that list and used on this row. Plus still appends an empty row; write only when all three cells are filled. x still deletes that instance on this Frame. **Vocab trash is not on the instance row.** Under the instance table, three compact name lists (instrument, verb, target); trash there deletes that list entry, or the request is refused if any triplet row still uses it.

**Span.** Keys `[` / `I` and `]` / `O` stay. HUD stays Write to span / Remove from span, plus the four-step recipe: `Select labels → [ → scrub → ]`. While from is set, the Frame slider fills from that index through the current Frame (order-insensitive, inclusive). `]` without `[` is still this Frame only. Keys ignored in inputs. Play pauses on a successful span write.

**Vocab.** Five lists start empty in code. Do not wipe an existing `vocab.json`. Trash uses one request per list.

## User Stories

### Look

1. As a labeler, I want the workbench always dark, so selected rows and the JPEG bench contrast.
2. As a labeler, I want a narrower right rail (280 default) and compact rows, so the JPEG is larger.
3. As a labeler, I want to add a triplet row without scrolling the table sideways.
4. As a labeler, I want this Frame’s labels filled strongly, and the pending span payload outlined, so I can tell them apart.

### Vocab

5. As a labeler, I want a new sitting to show empty phase, class, and triplet lists, and to add names with plus or by typing.
6. As a labeler, I want trash on a phase or class name to remove it from the desk list and from every Clip of that kind, or to fail with nothing changed.
7. As a labeler, I want trash on an instrument, verb, or target name to fail while any triplet row still uses it, leaving the list and the rows as they were.
8. As a labeler, I want x to keep meaning this Frame only, never vocab delete.
9. As a labeler, I want leftover seed names on an old `vocab.json` gone only when I trash them, not wiped at startup.

### Span

10. As a labeler, I want the HUD to show `Select labels → [ → scrub → ]`, Write/Remove, and the payload names.
11. As a labeler, I want the slider to fill from the `[` Frame to here until `]` writes.
12. As a labeler, I still want `I` / `O` as aliases of `[` / `]`.

### Unchanged

13. Immediate persist; Clip in the URL; Frame index in Zustand; no fold; drag to reorder the three tables; no mask; no Task-focus; no Session for these three; phase/class double-click rename still desk-wide; no rename of instrument/verb/target lists.

## Implementation Decisions

- **Theme:** `dark` class (or HeroUI equivalent) on the root. HeroUI Table, Select, Button, Slider, Input. Native `datalist` for triplet cells only.
- **Layout:** new localStorage key; default editor rail 280, min 220, max 420; Clip rail and bottom bar limits from ADR 0007 may stay.
- **HTTP:** vocab delete, one request per list. `phases` / `class_tags`: rewrite every Clip of that kind then the list, restore Clips on failure. `instruments` / `verbs` / `targets`: 409 (or equivalent) if any triplet document still contains that string in that slot; no write. Empty seed: default lists are `[]`; `setdefault` must not re-inject old seed names.
- **Triplet inputs:** three compact text fields + `datalist`; not ComboBox. Instance x vs list trash stay separate.
- **Slider fill:** visual only; from/to are still the `[` snapshot and the current Frame index. No numeric from/to fields.
- **Desktop** 1280×800 class sitting.

## Testing Decisions

- Compose: fresh vocab has empty lists; phase/class delete rewrites two Clips and rejects a half-failure; instrument delete refused while a row uses it, allowed after that row is gone; class-tag delete does not change triplet instrument strings.
- Playwright: dark sitting; right rail near 280 unless dragged; triplet plus+type without horizontal scroll on the table; trash vs x; HUD recipe visible; slider fill after `[`; `]` writes; no Arm; no filmstrip.

## Out of Scope

- mask, Task-focus, light theme, OS theme sync, wiping `vocab.json` on boot, ComboBox, fold, undo, rename of instruments/verbs/targets lists, phone layout.

## Further Notes

- [ADR 0006](../../docs/adr/0006-heroui-lucide.md), [0007](../../docs/adr/0007-single-page-workbench.md), [0009](../../docs/adr/0009-heroui-label-tables.md), [0010](../../docs/adr/0010-desk-wide-vocab-rename.md), [0011](../../docs/adr/0011-heroui-dark.md), [0012](../../docs/adr/0012-vocab-empty-and-delete.md).
- Tickets: `issues/01-dark-compact-sitting.md`, `issues/02-empty-vocab-seed.md`, `issues/03-vocab-delete-with-trash.md`.
