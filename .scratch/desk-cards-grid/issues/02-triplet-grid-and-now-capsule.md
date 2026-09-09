# 02 — Triplet hairline grid, in-cell edit, and Now capsule

**What to build:** Format the Triplet Library table as a formal three-column grid with vertical hairline dividers (`divide-x divide-border/40`) between instrument, verb, and target columns, matching aligned column headers. Double-clicking any cell embeds the rename `<Input>` strictly inside that cell's slot without shifting column widths. In the Now card, render active Triplet labels as integrated three-part capsules (`[instrument | verb | target]`) separated by internal vertical hairlines, and display a calm muted message (`No triplets on frame N`) when empty. Apply the soft semantic selection tint, subtle border, right checkmark icon (`✓`), and row-hover trash highlight to Triplet Library rows, and embed the Triplet Add Vocab row in the Library Card footer.

**Blocked by:** 01 — Dual Editor Cards and soft Library selection.

Status: MERGED

- [x] Triplet Library table and column headers feature vertical hairline dividers separating instrument, verb, and target columns
- [x] Double-clicking any cell in a Triplet row replaces only that cell with an inline `<Input>` without column jitter or layout shift
- [x] Pressing Enter commits cell rename desk-wide and Escape cancels, maintaining 409 collision refusal
- [x] Current-frame Triplet labels render in the Now card as unified three-part capsules (`[instrument | verb | target]`) with internal vertical hairlines
- [x] Empty Now Triplet section displays calm muted text (`No triplets on frame N`)
- [x] Selected Triplet Library rows use soft semantic background tint, matching border, and right-aligned checkmark icon (`✓`)
- [x] Triplet Add Vocab row is embedded as the Library Card footer separated by a top border hairline
- [x] Triplet single-click toggle and desk-wide trash continue to function seamlessly
