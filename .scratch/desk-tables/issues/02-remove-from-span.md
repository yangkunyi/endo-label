# 02 — Remove from span, including phase clear

**What to build:** The HUD offers **Write to span** (default) and **Remove from span**, and lists the selected phase name, class tags, and complete triplet rows that will be sent. Closing a span with `]` / `O` uses that direction. Remove clears phase on the range (`phase: null` on the phase span POST), removes each selected class tag, and deletes matching triplet triples by name, independently per kind. Incomplete triplet rows stay ignored. `]` without `[` still means this Frame only.

**Blocked by:** 01 — HeroUI tables write this Frame

**Status:** resolved

- [x] The HUD shows Write to span or Remove from span, defaults to Write, and names the selected phase, class tags, and complete triplet rows; it never says Arm, armed, or operation on/off
- [x] Phase span POST accepts `phase: null` and clears every Frame in the inclusive, order-insensitive range, or rejects a bad range with no partial change
- [x] Remove from span: phase clears the range; class removes each selected tag (other flags stay); triplet deletes matching triples by name on each Frame; a class or triplet span still does not read or write the other kinds
- [x] Write from ticket 01 still works with the HUD left on Write
- [x] Incomplete triplet rows are not span targets in either direction
- [x] A successful span write (either direction) pauses play; keys stay ignored in inputs
- [x] Compose tests cover phase span null (range, swap, single Frame, out-of-range rejection, independence); Playwright covers the HUD toggle, Remove for each kind, and `[` / `]`

## Answer

HUD buttons: **Write to span** (default) and **Remove from span**. They list the selected phase name, class tags, and complete triplet rows. `]` / `O` POSTs that direction (`phase: null`, class `on: false`, triplet `op: "remove"`). Incomplete triplet rows stay out of the payload. Write path from ticket 01 is unchanged.
