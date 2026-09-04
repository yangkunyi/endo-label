Status: specified — tickets 01–03 ready-for-agent

# Spec: Dual Editor Cards for Now and Library, Triplet grid with hairline dividers, and soft semantic selection

Parents: `.scratch/desk-vocab-library/spec.md`, `.scratch/desk-ruler/spec.md`. Domain: [CONTEXT.md](../../CONTEXT.md). Decision: [ADR 0020](../../docs/adr/0020-editor-cards-and-grid.md). Related ADRs: [ADR 0014](../../docs/adr/0014-unique-triplet.md), [ADR 0016](../../docs/adr/0016-player-task-focus-dual-source.md), [ADR 0017](../../docs/adr/0017-modern-player-tokens.md), [ADR 0019](../../docs/adr/0019-exact-triple-vocab.md).

## Tickets

- [01 — Dual Editor Cards and soft Library selection](issues/01-dual-cards-and-soft-selection.md) (`resolved`)
- [02 — Triplet hairline grid, in-cell edit, and Now capsule](issues/02-triplet-grid-and-now-capsule.md) (`resolved`)
- [03 — Full desk e2e closeout](issues/03-e2e-closeout.md) (`resolved`)

## Problem Statement

The right-hand editor rail presents Now and Library labels under raw text labels divided only by bare hairline rules, producing an unpolished, skeleton-like appearance. The Library selected state previously suffered from either being visually imperceptible against near-black backgrounds or overly aggressive with conflicting blue accent bars and scaling swatches. Furthermore, the Triplet table lacks vertical grid lines, leaving instrument, verb, and target words floating together without columnar boundaries, making rapid visual parsing and cell editing feel untidy.

## Solution

Group the right-hand editor rail into two distinct, elevated **Editor Cards** (**Now** and **Library**), each enclosed by a subtle dark surface and border, complete with an uppercase header and an item count badge. 

In the **Now** card, display a clean, read-only summary of the current Frame: Phase and Class as rounded color swatches, and Triplet as an integrated three-word capsule with micro-dividers. When no labels are assigned to the current Frame, show a calm, muted message rather than bare text.

In the **Library** card, refine the row selection to use a soft semantic tint (12–15% opacity) of the label's own color, a matching delicate outline, high-contrast white text, and a right-aligned checkmark (`✓`) icon, eliminating layout shift and harsh accent stripes. Ensure delete trash icons stay unobtrusive by default and highlight cleanly on row hover.

Format the **Triplet Library** table as a formal grid with vertical hairline dividers between instrument, verb, and target columns, aligned with column headers. Double-clicking any cell embeds the editing input seamlessly within that exact cell slot. Finally, integrate the Add Vocab inputs as a clean footer inside the Library Card.

## User Stories

1. As a labeler, I want the Now section wrapped in a dedicated, bounded Editor Card with a subtle surface background and fine border, so that current-frame state is immediately distinct from the workspace canvas.
2. As a labeler, I want the Now card header to display the title "NOW" alongside an item count pill (e.g. `NOW · 1`), so that I instantly know how many labels are active on the current Frame.
3. As a labeler, I want the Library section wrapped in a separate dedicated Editor Card below Now, so that available vocabulary is clearly compartmentalized from active Frame labels.
4. As a labeler, I want the Library card header to display the title "LIBRARY" alongside an item count pill (e.g. `LIBRARY · 6`), so that I can see the total vocabulary volume at a glance.
5. As a labeler, I want Phase labels on the current Frame to render in the Now card as a colored badge with a swatch, so that the exclusive phase identity is immediately recognizable.
6. As a labeler, I want Class tags on the current Frame to render in the Now card as a cluster of compact colored badges, so that stackable flags are easy to read together.
7. As a labeler, I want Triplet rows on the current Frame to render in the Now card as integrated three-part capsules (`[instrument | verb | target]`), so that the multi-word relationship reads as one unified compound identity.
8. As a labeler, I want the words within a Triplet Now capsule separated by fine internal vertical hairlines, so that the three slots are individually legible without separating into disconnected tags.
9. As a labeler, I want an empty Now section to display a calm, muted message (`No labels on frame N`), so that an unlabeled Frame feels intentional rather than broken or empty.
10. As a labeler, I want an unselected Library row to appear transparent with muted-gray text, so that inactive vocabulary does not compete for attention.
11. As a labeler, I want hovering an unselected Library row to produce a gentle surface highlight, so that clickable rows are obvious during mouse movement.
12. As a labeler, I want a selected Library row to have a soft 12–15% opacity background tint matching its unique label color, so that the row visually connects to its timeline and Now representations.
13. As a labeler, I want a selected Library row to feature a subtle matching border outline and crisp white text, so that the active selection is distinct without layout shift.
14. As a labeler, I want a selected Library row to show a clear checkmark icon (`✓`) on its right side, so that I have an unambiguous positive indicator that the label is applied to this Frame.
15. As a labeler, I want the row delete trash icon to remain dimmed at low opacity by default, so that destructive actions do not visually clutter the vocabulary list.
16. As a labeler, I want hovering a Library row to elevate its trash icon opacity and hover to a clear destructive red, so that deleting an identity remains discoverable and accessible.
17. As a labeler, I want the Triplet Library table to feature vertical hairline dividers between instrument, verb, and target columns, so that the table forms a clear three-column grid.
18. As a labeler, I want the Triplet column headers (`instrument`, `verb`, `target`) to align precisely with their corresponding column cells and dividers, so that the table layout is balanced.
19. As a labeler, I want double-clicking any cell in a Triplet row to turn only that specific cell into an inline input without shifting adjacent columns, so that editing a word is direct and contained.
20. As a labeler, I want pressing Enter in a Triplet cell input to commit the rename desk-wide and pressing Escape to cancel, so that keyboard ergonomics match Phase and Class renames.
21. As a labeler, I want the Add Vocab input area anchored as a permanent footer inside the Library Card separated by a top border, so that adding new terms is always reachable without expanding menus.
22. As a labeler, I want the Add Vocab inputs to use a compact `h-7 text-xs` size, so that vertical space is conserved for the label lists.
23. As a labeler, I want clicking an unselected Library row to toggle it onto the current Frame, so that single-click labeling remains instant.
24. As a labeler, I want clicking a selected Library row to toggle it off the current Frame, so that removing a label on the current Frame does not require a secondary control.
25. As a labeler, I want the Now section to remain strictly read-only, so that clicking Now badges does not trigger accidental state mutations.
26. As a labeler, I want span painting (chip, Mark from, Apply, Remove, and keyboard shortcuts `i`, `o`, `[`, `]`) to continue functioning seamlessly with the new Editor Cards, so that interval workflows remain unbroken.
27. As a labeler, I want all typography, colors, and surface tokens to align with the dark palette, so that the desk feels like a cohesive desktop application.

## Implementation Decisions

- **Editor Card Containers**: The right-hand editor rail under Task Focus tabs encapsulates **Now** and **Library** into two distinct `<section>` card containers styled with `bg-surface/40 border border-border/70 rounded-lg p-3`. Replaces the unbordered headings and `<hr>` hairlines.
- **Card Micro-Headers**: Each card begins with a header row containing an uppercase title (`text-xs font-semibold uppercase tracking-wider text-muted-foreground`) and a rounded badge pill displaying the item count (`text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground`).
- **Now Display Architecture**:
  - Phase: Single colored badge with swatch; empty state shows `No phase on frame N`.
  - Class: Flex wrap of colored badges; empty state shows `No class tags on frame N`.
  - Triplet: Stack of three-part capsule pills (`[instrument | verb | target]`) with internal vertical hairlines (`border-r border-white/20`); empty state shows `No triplets on frame N`.
- **Refined Selection Token**: A selected Library row applies:
  - Background: `hsla` calculated from `labelColor(identity)` with 12% alpha.
  - Border: 1px border with `labelColor(identity)` at 35% alpha.
  - Text: `text-foreground font-medium`.
  - Checkmark: `<Check size={14} className="text-primary shrink-0 mr-1" />` placed to the left of the delete trash button.
  - Zero layout shift: Unselected rows maintain a transparent 1px border.
- **Trash Hover Elegance**: Trash buttons use `opacity-30 transition-opacity group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10`.
- **Triplet Hairline Grid**:
  - The table columns are partitioned using `grid grid-cols-[1fr_1fr_1fr]` or `table` with `divide-x divide-border/40`.
  - Column headers (`instrument`, `verb`, `target`) align with table column widths and are separated by matching vertical hairlines.
  - Double-clicking a cell swaps the text span for an `<Input className="h-6 px-1 text-xs" />` within that cell only.
- **Integrated Add Vocab Footer**:
  - Moved from a floating margin element into the bottom of the Library Card, preceded by an internal card divider (`border-t border-border/50 pt-2 mt-2`).
  - Inputs use `h-7 text-xs`.
- **Backend & HTTP Unchanged**: No changes to API routes, schemas, database formats, or storage files. All updates are visual and front-end interaction refinements.

## Testing Decisions

- **Primary Seam**: The existing Playwright browser suite (`web/e2e/desk.spec.ts`).
- **Behavioral Coverage**:
  - Verify Now and Library Editor Card containers exist and render count badges.
  - Verify empty Now display renders the muted empty message per task focus.
  - Verify selected Library rows reflect `aria-pressed="true"`, checkmark icon visibility, and semantic background.
  - Verify Triplet table structure renders vertical column dividers, aligns headers, and embeds inline edit cleanly on double-click.
  - Verify Add Vocab footer adds new terms and updates the Library count badge.
  - Regression check: Span painting, keyboard shortcuts (`[`, `]`, `i`, `o`), Clip switching, and desk-wide trash/rename must remain fully green across the existing 30 Playwright tests.
- **Unit Seam**: `vitest` unit tests and `tsc` type-checking ensure no regressions in helper functions and type boundaries.

## Out of Scope

- Changes to backend models, FastAPI routes, or serialization formats.
- Drag-and-drop reordering of vocabulary rows.
- Multi-column filtering or search within the Library table.
- Timeline track or video player alterations.

## Further Notes

All changes strictly preserve existing accessibility attributes (`aria-pressed`, `aria-label`, `role="table"`, `role="list"`) so that existing Playwright locators and accessibility standards remain robust.
