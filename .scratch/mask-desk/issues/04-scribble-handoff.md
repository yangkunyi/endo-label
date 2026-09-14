# mask-desk/04 — Drag is Scribble; Mask Handoff to SAM

**What to build:** Same tool as points: a drag (relative extent ≥ 0.005) is a Scribble Prompt (left positive, right negative). Width 1–40, default 8, stamped per pending stroke. Strokes run the Scribble Model then Mask Handoff of the complete silhouette into SAM 3.1. A positive stroke may create a Track; a negative stroke alone may not. Scribble worker down → stroke Predict 503, Track-on-Frame unchanged; point-only Predict still works. Empty SAM after Scribble rolls back Scribble Memory. Visible mask is SAM's return; no edge polish after Predict. Immediate Annotation write as in 02.

- [x] Click vs drag split; right-click/drag does not open the browser menu
- [x] Width slider 1–40 default 8; each pending stroke keeps the width it was drawn with
- [x] Stroke Predict: Scribble then Handoff; `mask_handoff` on provenance when strokes ran
- [x] Positive stroke can create a Track; negative-only cannot
- [x] Scribble 503 on strokes; points still succeed; failed Handoff leaves the previous mask
- [x] Compose pytest (fake Scribble) + Vitest cover click-vs-drag and Handoff. No Playwright here — desk e2e is ticket 07.

## Answer

One tool, two gestures. On the overlay canvas a press-and-drag with relative extent ≥ 0.005 (`DRAG_EXTENT`) commits a Scribble Prompt polyline; a click still commits a point. Left is positive, right negative, and `onContextMenu` stays suppressed so right click/drag never opens the browser menu. Width slider 1–40 default 8 sits on the Track rail; `dragCommit` stamps the current width into each pending stroke, so a later slider move never rewrites drawn ink. Pending strokes render as ink scaled from the 1024 letterbox to the displayed rect (`strokeInkWidthPx`).

Predict sends `scribbles` / `scribble_labels` / `scribble_widths` alongside any pending points. The Session runs the Scribble Model first, hands the complete silhouette to SAM as Mask Prior, and stamps `model_provenance.mask_handoff: true` on the Track-on-Frame; the visible mask is SAM's return with no polish. A positive stroke creates a Track when none is Active (same rule as a positive point); negative-only is a 400. Scribble worker down → stroke Predict 503 and the previous mask stays; point-only Predict still works. Empty SAM after Scribble rolls back Scribble Memory to the pre-request silhouette, so failed ink never resurfaces. Annotation is written immediately on success as in 02.

Tests: compose pytest with fake Scribble/fake SAM covers handoff provenance, negative-only, carve with Scribble Memory, 503 on strokes with points still working, failed and empty Handoff rollback, and width validation/forwarding (default 8). Vitest covers click-vs-drag commit, per-stroke width stamping, mark splitting, ink scaling, and width clamping. No Playwright — desk e2e is ticket 07.
