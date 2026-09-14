# desk-ruler/02 — Now fills with the label color

**What to build:** On this Frame, class / phase / triplet Now uses the label color as the chip or row background (same color function as timeline bars). Empty Now (`none` / `unlabeled` / empty triplet table) is muted text with no fill. Library keeps a small swatch, not a filled button. Text on a filled Now stays readable. Playwright: labeled Now is filled; empty Now is not.

- [x] Class, phase, and triplet Now fill with that identity's color
- [x] Empty Now is muted text with no colored fill
- [x] Library picks stay a small swatch, not a filled chip
- [x] Now color matches the timeline bar for the same identity
- [x] Playwright covers filled vs empty Now

## Answer

Class / phase chips and triplet Now cells fill with `labelColor` (same function as timeline bars); empty Now is muted `none` / `unlabeled` / no rows, no fill. Library stays a small swatch. Playwright `labeled Now fills with label color; empty Now does not` in `web/e2e/desk.spec.ts`.

Commits `3e0ed31` (fill) and `6f05c15` (triplet cells).
