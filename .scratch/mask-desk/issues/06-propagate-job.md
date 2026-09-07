# 06 — Propagate Job from this Frame; Protected stay

**What to build:** When at least one Track has a mask on the current Frame, the rail can start Propagate: direction forward / backward / both, optional max frames (empty = to Clip edge), start = this Frame. Explicit button, never auto after Predict. Job is pollable; overlay geometry is off while it runs; Predict / Undo / pin delete / Clear / second Propagate are 409. Written Frames have `source=propagated`. `manual` and `refined` Track-on-Frames are not overwritten. Completed Job writes Annotation immediately (merge so Protected disk slots survive). Does not write phase, class, or triplet.

**Blocked by:** 02 — Click a point, see a Track, Annotation is on disk

**Status:** resolved

- [x] No seed mask on this Frame → Propagate disabled / 400
- [x] Short forward Job fills neighbor Frames; seed Frame stays `manual`/`refined`
- [x] Re-run replaces unprotected `propagated` slots only
- [x] 409 on mask edits while the Job runs; scrub and GET Session still allowed
- [x] phase/class/triplet documents unchanged after a completed Job
- [x] Compose pytest (fake stream) covers the Job. No Playwright here — desk e2e is ticket 07.

## Answer

HTTP: the ported contract already carried `POST /api/session/propagate` (202, `direction` forward/backward/both, `start_frame_index`, optional `max_frames`, 400 when no Track has a mask on the start Frame) and `GET /api/jobs/{id}`, which fills one pending Frame per status poll so progress is visible; written Frames get `source=propagated`, `manual`/`refined` slots are skipped, and completion merges (`annotations.auto_save_merge`) so Protected disk slots the Session does not hold survive while `phase`/`class`/`triplet` stores are untouched. This ticket added the lock around the per-poll advance in `get_job` so concurrent polls cannot double-consume `pending_frames`, plus the compose pytest suite (fake predictor stream) covering: 400 without a seed on the start Frame and bad direction; a short forward Job filling neighbors with the seed staying `manual`; backward/`max_frames` range limits; re-Propagate replacing only unprotected `propagated` slots (a `refined` slot survives with its exact counts); the full 409 matrix while the Job runs (Predict, pin delete, Clear, Undo, Reset, Track label/delete, second Propagate) with scrub and GETs still 200 and edits working again after completion; completed-Job Annotation merge keeping a Protected disk slot the Session never held; and phase/class/triplet documents byte-identical across a Job.

Desk: the Track rail gains a Propagate card — direction radio group, "max frames per direction" input (`to edge` placeholder, blank = Clip edge), and an explicit Propagate button, disabled until at least one Track has a mask on the current Frame (disk Annotation read) and while a Job runs. Propagate never fires after Predict; it shares the lazy-Session open (`load_annotations: true`) with Predict. The desk polls the Job every 400 ms, shows `frames_done/frames_total` with a "mask edits wait" note, turns overlay geometry input off for the duration (`inputEnabled` on MaskOverlay — a click cannot become an unexplained 409), disables Predict/Undo/Clear/pin delete, refreshes both Annotation reads on completion, and reports `N of M Frames filled` or the worker error. Scrubbing stays live during a Job. Desk copy warns that re-run replaces non-protected `propagated` masks. No Playwright — desk e2e is ticket 07.
