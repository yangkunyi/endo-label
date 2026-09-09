# 03 — Leftover points stay; click a pin to delete

**What to build:** After a Geometric Predict, leftover pins stay on that Track on that Frame (Geometric Memory) and go out again on the next Predict with the current Mask Prior. A click (no drag) on a leftover pin deletes that pin and re-Predicts the rest plus Prior. Pins are not in Annotation. Active Track is chosen only from the right-rail list; New Track clears Active so the next positive prompt creates identity. Picture click never selects a Track.

**Blocked by:** 02 — Click a point, see a Track, Annotation is on disk

Status: MERGED

- [x] GET Session for this Frame returns leftover points after Predict; Annotation GET has none
- [x] Second Geometric Predict on the same Track-on-Frame resends leftovers + this request + Mask Prior
- [x] Click a leftover pin deletes it and re-Predicts; last leftover + Prior still allowed
- [x] Pins do not copy onto other Frames; Clear mask drops pins on that cell
- [x] Active Track only from the rail; New Track means next positive prompt creates a Track
- [x] Compose pytest + Vitest cover pin merge, second Predict, pin delete. No Playwright here — desk e2e is ticket 07.

## Answer

GET `/api/session?frame_index=` lists leftover Geometric Memory `{x, y, positive}` on that Track-on-Frame. Annotation GET has none; reopen with `load_annotations` does not resurrect pins. Second Geometric Predict resends leftover points, then this request, plus the current Mask Prior. `DELETE /api/session/tracks/{id}/frames/{index}/points/{point_index}` drops that pin and re-Predicts the rest plus Prior; last leftover is Prior-only. Pins stay on the Frame they were clicked; Clear mask drops that cell’s pins. Desk: leftover pins for the Active Track, 10 CSS-px hit, click-delete (no drag). Active Track only from the right-rail list; New Track clears Active so the next positive prompt creates identity; picture click never selects. Compose pytest + Vitest; no Playwright (ticket 07).
