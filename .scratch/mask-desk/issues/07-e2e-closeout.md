# mask-desk/07 — Desk Playwright closeout (only e2e ticket)

**What to build:** All mask sitting Playwright lives here — tickets 02–06 ship compose/Vitest only. On `:7892`/`:5192`, walk the desk: point → Track overlay and rail; leftover pin delete; scribble drag; Undo; short Propagate; pending drop on scrub; Clip change closes Session; phase then a point stay independent stores. Vocab e2e still green. Full local suite green (pytest, vitest, tsc, Playwright).

- [x] Point on picture → silhouette + Track row; click picture does not play; Space does
- [x] Leftover pin visible; click pin deletes; Active Track from the rail only
- [x] Drag stroke creates/refines a Track; right-click does not open the browser menu
- [x] Undo (keyboard or rail) restores this Frame; no Save
- [x] Short forward Propagate fills a neighbor Frame; seed stays protected
- [x] Scrub after pending marks: no extra Track, no Predict
- [x] Change Clip: Session inactive; previous Clip’s Annotation still GET-able
- [x] Mixed sitting: phase span then a point; each store has only its own kind
- [x] Worker-down sitting still edits phase/class/triplet
- [x] pytest, vitest, tsc, and Playwright green on 7882 / 5175 / 7892 / 5192

## Answer

`web/e2e/mask-desk.spec.ts` (11 tests, serial, fake backends, e2e pair `:7892` API + `:5192` Vite) walks the desk end to end against the running process: a point Predict produces the overlay silhouette (canvas pixel sampled through the displayed image rect), the `track-1` rail row, and a `manual` Annotation on disk while the video stays paused and the frame stays 0; Space still plays. Reload shows the silhouette from disk with no Save control. A leftover pin is visible (opaque pin pixel over the 120-alpha silhouette), a click on it deletes only that pin (`geometric_memory` keeps the other point, mask counts unchanged). Active Track comes from the rail only: after New Track, a picture click refines the rail-chosen Track (asserted on the Predict body `track_id`) and never steals the selection. A drag is a Scribble stroke that creates a Track; a synthetic `contextmenu` is cancel-defaulted and a negative click alone fails Predict with the "at least one positive point or stroke" toast. Ctrl+Z and the rail Undo both restore this Frame's Annotation counts and pins. A blank-max forward Propagate completes ("1 of 1"), writes `source=propagated` on Frame 1, and leaves the seed `manual` with identical counts. Scrubbing right after a pending mark sends no Predict, opens no Session, and leaves no Track. Changing to `CLIP_E2E_B` closes the Session while `CLIP_E2E`'s Annotation stays GET-able and nothing bleeds onto the new Clip's overlay. A mixed sitting (phase span 0–1, then a point) leaves phase/class/triplet and Annotation each holding only its own kind, in both directions.

Worker-down: `web/e2e/worker_down_sitting.py` serves the same compose app on `:7893` (a third `reuseExistingServer: false` webServer in `playwright.config.ts`) with a SAM checkpoint path that does not exist, so `worker.ready` is false without touching torch or a GPU. The test routes `/api/**` to that process: phase, class, and triplet writes all land; the picture click fails Predict with the worker's 503 message; no Session opens and no Track appears.

Two pre-existing files needed one-line adjustments, both e2e-only: `worktree-ports.test.ts` pinned the Playwright config at exactly two webServers (now three, still strict/no-reuse), and `desk.spec.ts` clicked the `<video>` to move focus off inputs — the picture is the mask canvas now (ADR 0024), so it clicks the footer paint chip instead. Validation: pytest 142 passed / 1 skipped, Vitest 54 passed, `tsc -b --noEmit` clean, Playwright 46 passed (35 vocab + 11 mask) on `:7892`/`:5192`/`:7893`; sitting defaults `:7882`/`:5175` unchanged and covered by the existing port tests. `web/package.json` / lock untouched (Vite 7.3.6 stays operator work).
