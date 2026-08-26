# Right rail is three HeroUI tables; selection is the span payload; no Arm control

The workbench shell stays (Clip rail, JPEG, slider, play — ADR 0007). The right rail is no longer stone cards with “Arm … span” and operation on/off. Each Task type is a HeroUI **Table**: phase and class rows are the desk vocab lists; triplet rows are this Frame’s instance rows (columns instrument, verb, target). Clicking rows writes the **current Frame** (phase single-select; class multi-select toggle; triplet row select does not write until plus-commit or cell edit). `[` / `]` paint the **selected** rows onto a range. A HUD control **Write to span** / **Remove from span** replaces add vs off. Tables stay open (no chevron fold); the three tables can be dragged to reorder. Use HeroUI Table, Select, and Button for real — do not restyle them back to `stone-*`.

## Considered Options

- **Keep Arm buttons and operation on/off** — rejected; the words are internal and the sitting was unreadable.
- **Tabs for the three tables** — rejected; that is Task-focus.
- **Fold tables to a header** — rejected; drag-reorder is enough density.

## Consequences

- Desk-appearance chevrons and workbench Arm/HUD-as-jargon stories are superseded for the right rail.
- Span HTTP (ADR 0008) stays; the client sends whatever is selected, in the HUD direction.
- Phase **Remove from span** clears phase on the range (`phase: null` on the existing span POST, or equivalent).
