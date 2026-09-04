# Dual Editor Cards for Now and Library, Triplet hairline grid, and soft semantic-tint selection

The right editor rail previously presented Now and Library under raw text headings separated by bare hairline `<hr>` rules. The selected state in Library was either indistinguishable on near-black backgrounds (`#1a1b1c` on `#141516`) or overloaded with high-contrast indigo left stripes and scale rings. Triplet Library rows rendered three words in a flex/grid button without vertical borders, making columns float awkwardly and cell editing jump out of alignment.

**Editor Cards:** The editor rail groups content into two elevated, bounded cards (**Now** and **Library**) using `bg-surface/40 border border-border/70 rounded-lg p-3`. Each card header displays an uppercase section title alongside a count badge (e.g. `NOW · 1`, `LIBRARY · 5`), establishing a clear visual hierarchy.

**Now State Overview:** Now is a compact, read-only summary of the current Frame. Phase and Class render as rounded colored badges; Triplet renders as an integrated three-word capsule `[instrument | verb | target]` separated by subtle internal vertical hairlines. When empty, Now displays a calm muted notice (`No labels on frame N`) rather than bare text `none`.

**Refined Library Selection:** A Library row whose identity is present on the current Frame displays a soft semantic tint of its own label color (12–15% opacity), a matching fine border, high-contrast white text, and a right-aligned checkmark (`✓`) icon. Unselected rows remain transparent. The delete trash icon is low-saturation by default (`opacity-30`) and elevates to full visibility and red hover state on row hover.

**Triplet Table Grid:** The Triplet Library table adopts a structured grid format with vertical hairline dividers (`divide-x divide-border/40`) between `instrument`, `verb`, and `target`. Table headers align with column boundaries. Double-clicking any cell embeds an inline `<Input>` seamlessly within that cell slot, preserving table geometry.

**Add Row Footer:** The new-label input area is integrated as a permanent footer inside the Library Card, separated from the list by a subtle top border, using compact `h-7 text-xs` inputs.

This supersedes ADR 0018's bare hairline separation between Now and Library and ADR 0019's unbordered text buttons for Triplet rows. ADR 0014 (unique triplet per Frame), ADR 0016 (Task-focus rail), and ADR 0019 (exact-triple Vocab) continue to hold.

## Considered Options

- **High-saturation indigo left stripe on selected row** — rejected; visually aggressive, creates layout jitter without compensating borders, and clashes with label colors.
- **Dark-gray fill without checkmark** — rejected; nearly indistinguishable on dark OLED/IPS displays.
- **Borderless flat column layout** — rejected; lacks structure and boundary definition on wider screens.
- **Triplet Now as full mirror table** — rejected; compact capsule badges keep Now cleanly distinguishable from the interactive Library table.
- **Modal or popover for Add Row** — rejected; adds friction to fast keystroke-driven labeling workflows.
