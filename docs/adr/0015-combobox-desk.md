# Right rail is Pick+Create comboboxes; a paint chip is the interval payload; Apply/Remove commit

The three HeroUI Tables (ADR 0009) go away. Each Task type is a shadcn combobox: pick an existing vocab name or type a new one (create + write this Frame). That last write is the visible **paint chip**. Mark from pins one end of the slider; the current Frame is the other. **Apply to frames** and **Remove from frames** POST the chip across the inclusive range (existing span HTTP). `]` / `O` always Apply, never Remove. No direction-toggle button that does not write. No Arm. No Task-focus. Kit is shadcn (ADR 0013). Always dark (ADR 0011). Triplet this-Frame write toggles a unique triple (ADR 0014).

## Considered Options

- **Keep tables; only fix HUD copy** — rejected; the labeler asked to throw the sitting chrome and the `[` `]`-only write.
- **Span payload = every label on this Frame** — rejected; class flags would paint together.
- **Selection separate from this-Frame state** — rejected; that was the unreadable table selection.

## Consequences

- ADR 0009 is superseded. Span routes in ADR 0008 stay.
- Desk-appearance chevrons and workbench Arm stories stay dead.
- Playwright must drive comboboxes and a real Apply button, not row-select + `]`.
