# pilot-ux/06 — Mask coverage: its own row and Track lanes

**What to build:** mask's own answer to "标到哪了". It is **not** part of 05's strip ("mask 不管，
mask 单独一条"): mask has no Task focus tab, so it gets a row of its own plus per-Track spans.

Two halves:
- **Mask strip** — Frames that carry at least one Track's mask. Same visual grammar as 05's strip
  (thin band, gaps hollow, click seeks) but bound to mask, not to Task focus.
- **Track lane** — one row per Track in the Lane well, its spans = the Frames where that Track has
  a mask; the row head shows the Track Label and colour. Track lanes are read-only: they seek on
  click and cannot be painted or trimmed (mask is written with the mask tools, never by a span
  write). They are hidden by default and appear once the Clip has Tracks, toggled like Lane
  visibility.

Code:
- Data: `GET /api/clips/{clip_id}/annotations` (`data/mask` summary) for the spans, plus the
  per-Frame route the desk already uses so a Predict/Propagate/Clear refreshes the row. Refresh
  when the mask Session writes (the desk's existing `mutateAnnotation` call sites).
- Where: the strip joins the timeline region's strip area; the Track lanes go into the Lane well
  next to the vocab Lanes, reusing `data-lane-head` / `data-timeline-lane` markup so the geometry
  tests keep working.

- [ ] the mask strip marks every Frame that has any Track mask, and gaps for the rest
- [ ] one Track lane per Track, spans matching the stored Annotation
- [ ] Predict / Propagate / Clear / Track delete refresh the row without a page reload
- [ ] Track lanes are read-only: click seeks, no paint, no trim
- [ ] the Lane well still does not resize when rows appear
- [ ] a test covers the summary → spans mapping
