# mask-desk/05 — Undo this Frame’s last committed mask edit

**What to build:** Ctrl/Cmd+Z and a rail Undo restore this Frame’s Track-on-Frame, Geometric Memory, and Scribble Memory from immediately before the last committed Predict, leftover-point delete, or Clear mask. Persist Annotation immediately. Pending marks that never Predict-ed are not Undo (Esc / scrub still drops them). Leftover-point delete is not labeled Undo — it still re-Predicts. Empty stack is not an error. No Redo. Typing in Track Label, Space does not play.

- [x] Undo after Predict restores the previous silhouette and pins on this Frame
- [x] Undo after leftover-point delete restores that pin and mask
- [x] Undo after Clear mask restores that cell
- [x] Annotation GET after Undo matches the restored mask; no Save
- [x] Empty Undo is 200 / no-op; there is no Redo
- [x] Keyboard and rail control both work; compose pytest + Vitest. No Playwright here — desk e2e is ticket 07.

## Answer

`POST /api/session/undo {frame_index}` restores this Frame’s last committed cell edit. The Session keeps a one-way undo stack of pre-edit Track-on-Frame snapshots (silhouette + Source, leftover Geometric Memory, and the Scribble mask-memory silhouette — the ported ScribbleModel has no getter, so session.py mirrors every silhouette it loads/clears per cell). Each committed Predict, leftover-point delete (its re-Predict shares the same snapshot push), and Clear mask appends one snapshot before mutating; empty SAM returns and failed Predicts never enter the stack. Undo pops the newest snapshot for the requested Frame, restores mask + pins + Scribble Memory, and replaces the Clip’s Annotation immediately (ADR 0025) — no Save. Empty stack is 200 `{undone: false}`; there is no Redo endpoint. Undo is 409 while a Propagate Job runs (story 84) and 404 out of range / no Session. Undo of the Predict that created a Track drops the cell and removes the Track when no mask is left on any other Frame; a Track holding masks elsewhere survives with its other cells.

Desk: Ctrl/Cmd+Z (blocked by the editable-target guard, so typing in Track Label keeps native text undo and Space never plays while typing) and a rail Undo button both call it; a rail Clear mask button produces the third undoable edit; Esc drops pending marks and cancels the debounce without Predict. Track rows double-click into a Track Label input (PATCH `/api/session/tracks/{id}`, which now also persists Annotation immediately per ADR 0025). An Undo that removed the Active Track clears the Active selection.

Tests: compose pytest (fake backends) covers restore after Predict / pin delete / Clear / scribble carve, frame-scoped Undo with the full stack lifecycle, Annotation GET equality, restored pins + Prior going back out on the next Predict, empty-stack no-op + absent Redo, and Track Label persist. Vitest covers the Ctrl/Cmd+Z key test and Active-Track pruning. No Playwright — desk e2e is ticket 07.
