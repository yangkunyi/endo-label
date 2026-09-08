Status: implemented — tickets 01–07 resolved on `dev2` (commits `ea43908`…`1863f57`)

# Spec: mask on the sitting player (Geometric Prompt, Scribble, Propagate)

Parents: `.scratch/endo-label-product/map.md` (v1 includes mask; Session lazy and mask-only). Sitting chrome: `.scratch/desk-player/spec.md` and later player ADRs. Domain: [CONTEXT.md](../../CONTEXT.md). Overlay: [ADR 0023](../../docs/adr/0023-mask-overlay-on-player.md), [ADR 0024](../../docs/adr/0024-picture-is-mask-canvas.md). Persist: [ADR 0025](../../docs/adr/0025-mask-annotation-immediate.md). Binding research (out of this spec): `.scratch/endo-label-product/research/class-triplet-mask-binding.md`. UI copy stays English.

This spec is the mask / Track / SAM slice. It does not replace phase / class / triplet.

## Problem Statement

A labeler already sits on one Clip with a player, a Ruler, and Task focus for phase / class / triplet. They need to draw pixel silhouettes on the same Frames: click points, drag scribbles, and explicitly Propagate along the Clip. The mask HTTP is composed in the process, but the desk has no overlay, no Track list, and no Session client. The ported Session is missing Geometric Memory, leftover-point delete, and Undo. Mask still feels like another product, not this sitting.

## Solution

Keep the player sitting. Overlay a canvas on the picture. The picture is an annotation canvas: click and drag are Geometric Prompts and Scribble Prompts; play is Space, the player button, and the Ruler. Task focus stays phase / class / triplet. A Track list stays on the right rail and scrolls with it.

One tool: click is a point, drag is a stroke; left positive, right negative. Leftover points stay on that Track-on-Frame (Geometric Memory) and go out again on the next Geometric Predict with the Mask Prior. Scribble Prompts run the Scribble Model, then Mask Handoff into SAM 3.1. Predict writes this Frame only. Propagate is an explicit Job (forward / backward / both) from the current Frame’s seed masks and does not overwrite Protected Masks (`source` is `manual` or `refined`).

Session opens on the first real Predict or Propagate (`load_annotations: true`). phase / class / triplet never need it. Each successful mask edit replaces that Clip’s Annotation immediately. No Save button. Undo restores this Frame’s last committed mask edit. class / triplet are not bound to a Track in this spec.

## User Stories

### Sitting, Session, independence

1. As a labeler, I want to open a Clip and edit phase / class / triplet without a Session or a GPU worker, so that a labels-only sitting still starts.
2. As a labeler, I want the first Predict or Propagate to open a Session on this Clip with saved Annotation loaded, so that existing masks are Mask Priors and I never press Open Session.
3. As a labeler, I want a second Predict on the same Clip to reuse that Session, so that Geometric Memory and Scribble Memory survive from mark to mark.
4. As a labeler, I want changing Clip to close the Session, so that GPU state does not leak onto Clip B.
5. As a labeler, I want closing the Session to leave Annotation on disk, so that a process restart still shows silhouettes I already committed.
6. As a labeler, I want health to show whether the SAM worker is ready, so that a 503 on first Predict is not a mystery.
7. As a labeler, I want a SAM worker that is down to leave phase / class / triplet writable, so that GPU failure is not a sitting lock.
8. As a labeler, I want Predict, Clear, leftover-point delete, Undo, and Propagate to leave phase, class, and triplet on those Frames unchanged, so that mask is not a wipe of the other three.
9. As a labeler, I want painting phase / class / triplet to leave Annotation and Session Tracks unchanged, so that a vocab write is not a mask write.
10. As a labeler, I want Task focus to stay phase / class / triplet only, so that mask is not a fourth tab.
11. As a labeler, I want the Track list visible on the right rail no matter which vocab I am editing, so that I do not hide Tracks to paint a phase.
12. As a labeler, I want the right rail to scroll when Track list plus the vocab editor do not fit, so that neither is clipped.
13. As a labeler, I want masks that exist on this Frame to overlay the picture while I watch or paint vocab, so that I see where silhouettes already sit.
14. As an operator, I want the default predictor and Scribble backends to stay fake, so that desk tests and a labels-only sitting do not need a GPU.

### Picture, play, coordinates

15. As a labeler, I want the mask overlay to sit on the existing player picture (jpeg Clip via transcoded mp4, or video Clip), so that I do not get a second sitting.
16. As a labeler, I want play and pause via Space (when I am not typing), the player button, and the Ruler, so that transport matches this player.
17. As a labeler, I want a click on the picture not to play or pause, so that a Geometric Prompt is not a transport click.
18. As a labeler, I want the overlay to map through the displayed image rectangle into relative `[0,1]` coordinates (origin top-left, x right, y down), so that letterboxing does not shift prompts.
19. As a labeler, I want painting to pause playback, so that I do not mark a moving Frame.
20. As a labeler, I want scrubbing the Playhead to show that Frame’s masks, leftover points, and Track-on-Frame state, so that the overlay matches the clock.
21. As a labeler, I want the Ruler, timeline lanes, and vocab paint chip to keep working while the overlay is present, so that mask does not steal the bench.

### Geometric Prompt and Geometric Memory

22. As a labeler, I want a left click on the picture to place a pending positive point, so that I can seed or grow a Track.
23. As a labeler, I want a right click on the picture to place a pending negative point, so that I can carve without a stroke.
24. As a labeler, I want the browser context menu not to open on a right click on the picture, so that a negative point is not a menu.
25. As a labeler, I want a drag (extent at least 0.005 in relative space) to be a Scribble Prompt instead of a point, so that one tool covers both gestures.
26. As a labeler, I want left drag to be a positive stroke and right drag a negative stroke, so that sign matches the clicks.
27. As a labeler, I want pending marks to auto-Predict after 800 ms with no further mark, so that I do not have to press Predict every time.
28. As a labeler, I want a Predict control on the Track rail, so that I can fire before the debounce.
29. As a labeler, I want a successful Geometric Predict without an Active Track and with at least one positive point to create a Track, so that the first mark can start identity.
30. As a labeler, I want negatives alone, with no Active Track, to be rejected, so that a Track is not born from only “not this”.
31. As a labeler, I want a successful Predict on an Active Track to refine that Track-on-Frame, so that later points are not a new object by default.
32. As a labeler, I want leftover points to remain visible on that Track on that Frame after Predict, so that I see what still conditions SAM.
33. As a labeler, I want the next Geometric Predict on that Track-on-Frame to resend leftover points plus this request plus the current Mask Prior, so that pins accumulate instead of replacing.
34. As a labeler, I want a click (no drag) on a leftover pin to delete that pin and re-Predict the rest plus Mask Prior, so that a bad pin is removable without Undo.
35. As a labeler, I want leftover points not to be stored in Annotation, so that Save/reopen does not resurrect pins.
36. As a labeler, I want leftover points not to copy onto Propagated Frames, so that pins stay on the Frame I clicked.
37. As a labeler, I want at most 16 Tracks on a Session, so that a runaway click-create is capped.
38. As a labeler, I want boxes not to be a desk Geometric Prompt, so that a stray box payload is rejected.

### Scribble Prompt and Mask Handoff

39. As a labeler, I want a committed positive stroke to create a Track when none is Active, so that a scribble can start identity the same way a positive point can.
40. As a labeler, I want a negative stroke alone not to create a Track, so that carve-without-object is impossible.
41. As a labeler, I want stroke width to be 1–40 (default 8), full diameter on the 1024 letterbox, so that ink thickness matches the source desk.
42. As a labeler, I want width stamped per pending stroke, so that a later slider move does not rewrite strokes I already drew.
43. As a labeler, I want strokes to run the Scribble Model and then Mask Handoff of the complete silhouette into SAM 3.1, so that SAM sees a mask, not a box or a thin ink raster.
44. As a labeler, I want a down Scribble worker to fail a stroke Predict with a clear 503 and leave the Track-on-Frame unchanged, so that I am not given a silent SAM-only fallback.
45. As a labeler, I want point-only Predict to work when Scribble is down, so that Geometric Prompts do not wait on the second worker.
46. As a labeler, I want an existing Track-on-Frame loaded into Scribble Memory before the first correction stroke, so that a negative stroke can carve.
47. As a labeler, I want a SAM failure after a successful Scribble to roll back Scribble Memory and leave the Track-on-Frame unchanged, so that a bad Handoff does not commit.
48. As a labeler, I want mixed pending points and strokes in one Predict (strokes first via Handoff, then leftover plus new points), so that I can scribble then pin in one burst.
49. As a labeler, I want the visible mask after Predict to be SAM’s return (after Handoff when strokes ran), so that a snap-smooth polish is not a second silhouette.

### Tracks, rail, overlay

50. As a labeler, I want a Track list on the right rail with each Track Label, so that I can see identities without a mask tab.
51. As a labeler, I want to pick the Active Track from that list, so that the next prompt refines the right object.
52. As a labeler, I want a click on the picture never to change Active Track, so that placing a point is not an accidental select.
53. As a labeler, I want New Track to clear Active Track, so that the next positive prompt creates identity.
54. As a labeler, I want to edit a Track Label, so that `track-N` can become a name I recognize.
55. As a labeler, I want Track Label edits not to write or require a Frame class or Triplet row, so that a name is not a bind.
56. As a labeler, I want Clear mask to drop this Active Track’s Track-on-Frame on this Frame, including Geometric Memory and Scribble Memory for that cell, so that a bad silhouette is gone.
57. As a labeler, I want deleting a Track from the Session to drop it from overlay and from the next Annotation write, so that a mistaken identity is removable.
58. As a labeler, I want each Track’s silhouette on this Frame drawn on the overlay, so that overlaps are visible.
59. As a labeler, I want leftover pins drawn for the Active Track on this Frame, so that I can hit-test delete.

### Undo and pending

60. As a labeler, I want Undo (Ctrl/Cmd+Z, and a rail control) to restore this Frame’s Track-on-Frame, Geometric Memory, and Scribble Memory from immediately before the last committed Predict, leftover-point delete, or Clear mask, so that a bad commit is reversible.
61. As a labeler, I want Undo not to restore pending marks that never Predict-ed, so that clearing pending is not Undo.
62. As a labeler, I want a leftover-point delete not to be called Undo, so that pin delete still re-Predicts.
63. As a labeler, I want no Redo, so that the stack is one-way.
64. As a labeler, I want Undo to persist the restored Annotation immediately, so that Undo is as durable as Predict.
65. As a labeler, I want pending points and strokes to belong only to the current Frame, so that I cannot mark Frame 3 and commit on Frame 8.
66. As a labeler, I want scrubbing or changing Clip to drop pending marks and cancel the debounce without Predict, so that a seek is not a silent model run.
67. As a labeler, I want Space while typing a Track Label not to play, so that a name with spaces is typeable.

### Persist (Annotation)

68. As a labeler, I want a successful Predict to replace this Clip’s Annotation on disk immediately, so that I do not press Save.
69. As a labeler, I want leftover-point delete, Clear mask, Undo restore, Track Label edit, Track delete, and a completed Propagate Job to write Annotation the same way, so that every committed mask edit matches phase/class/triplet “write then it is there”.
70. As a labeler, I want Geometric Memory and Scribble Memory still off disk, so that reopen does not resurrect pins or ink.
71. As a labeler, I want GET of Annotation for a Frame to work with no Session, so that overlay can show saved silhouettes before the first Predict.
72. As a labeler, I want a Clip with no Annotation to overlay nothing, so that empty is absence.
73. As a labeler, I want Annotation for Clip A never to appear on Clip B, so that two Clips do not share masks.

### Propagate

74. As a labeler, I want Propagate disabled until at least one Track has a mask on the current Frame, so that I cannot start a Job with no Seed.
75. As a labeler, I want to choose forward, backward, or both, so that fill direction is explicit.
76. As a labeler, I want an optional max frames per direction, empty meaning to the Clip edge, so that a short fill is possible.
77. As a labeler, I want start to be the current Frame, so that the Seed is what I am looking at.
78. As a labeler, I want Propagate to be a button I press, never an automatic follow-on after Predict, so that watching is not a fill.
79. As a labeler, I want a Job I can watch (frames done / total), so that a long fill is not a freeze.
80. As a labeler, I want written Frames to have `source=propagated`, so that later fill can tell seed work from model fill.
81. As a labeler, I want the Seed Frame’s `manual` or `refined` mask left as-is, so that Propagate does not rewrite the Frame I just painted.
82. As a labeler, I want any Track-on-Frame whose Source is `manual` or `refined` skipped on overwrite, so that a corrected silhouette survives a re-run.
83. As a labeler, I want unprotected `propagated` slots replaceable on a later Job, so that I can re-fill junk.
84. As a labeler, I want Predict, leftover-point delete, Clear mask, Undo, Reset, Track delete/label, and a second Propagate rejected with a conflict while a Job runs, so that two writers do not share a Session.
85. As a labeler, I want scrubbing and GET Session allowed while a Job runs, so that I can watch fill land.
86. As a labeler, I want overlay geometry input off while a Job runs, so that a click is not a 409 surprise without explanation.
87. As a labeler, I want a completed Job (including zero targets) to write Annotation immediately, so that fill is on disk without Save.
88. As a labeler, I want Propagate not to write phase, class, or triplet, so that temporal fill is mask-only.

### Errors and caps

89. As a labeler, I want Predict without a ready SAM worker to fail 503 with the worker message, so that I know to wait or pick a GPU sitting.
90. As a labeler, I want an empty SAM return after a committed request to leave the previous Track-on-Frame (and restore a last leftover pin if that delete caused it), so that “nothing” is not a wipe.
91. As a labeler, I want Frame index outside `0..N-1` rejected, so that I cannot prompt a Frame the catalog does not have.

## Implementation Decisions

- **Seams (two, both already in this repo).**
  1. **Compose HTTP Session** — the product interface for Session, Predict, leftover-point delete, Undo, Propagate Job, Annotation GET, and immediate persist. Callers use the existing mask routes composed with phase / class / triplet. Fake predictor and fake Scribble. No GPU.
  2. **Sitting desk** — overlay + Track rail as a client of that HTTP, on the current player sitting. Local Playwright against the isolated labels-only process already used for the vocab desk; Vitest for overlay coordinate math, click-vs-drag, debounce, and pending-on-scrub.
- **Do not add a third seam.** Do not test JSON file layout, GPU kernels, or old-tree Vite pages.
- **Session HTTP stays the ported contract**, filled where this tree is short: Geometric Memory on GET Session for a Frame; leftover-point delete that re-Predicts remaining pins plus Mask Prior; Undo snapshot of this Frame’s Track-on-Frame + Geometric Memory + Scribble Memory; reject non-empty boxes; do not run edge polish after Predict (visible mask is SAM’s return, after Mask Handoff when strokes ran).
- **Immediate persist (ADR 0025).** Successful Predict, leftover-point delete, Clear mask, Undo restore, Track Label patch, Track delete, and completed Propagate Job write Annotation at once (full document replace for Session-authored writes; Propagate completion still merges so Protected Masks on disk are not clobbered). No Save control on the desk. Geometric Memory and Scribble Memory stay off disk.
- **Lazy Session.** Desk does not open a Session on Clip enter. First Predict or Propagate `POST`s Session with `load_annotations: true`. Clip change `DELETE`s Session. Vocab editors never call Session.
- **Overlay (ADR 0023, 0024).** Canvas stacked on the player picture; pointer captured on the picture; play via Space / player button / Ruler only. Pause while a mark is in progress. Relative coords through the displayed image rect. Right-click does not open the browser menu.
- **One tool.** Click vs drag (relative extent ≥ 0.005) splits Geometric Prompt vs Scribble Prompt. No separate Scribble mode. Width slider 1–40, default 8, per pending stroke.
- **Auto-Predict.** 800 ms after the last pending mark, or the rail Predict control. Debounce cancels on scrub / Clip change without sending.
- **Active Track** is chosen only from the right-rail list (and New Track). Picture click never selects a Track. Click on a leftover pin is delete, not select.
- **Track rail.** Always on the right rail, independent of Task focus: list, Active, New Track, Track Label, width, Predict, Propagate (direction, max frames, button), Undo, Clear mask. The rail scrolls.
- **Propagate Job.** Same public contract as the source desk: `forward` / `backward` / `both`, start = current Frame, optional max frames, poll advances, Protected skip when `source` is `manual` or `refined`. No Review UI; `accepted` is not part of Protected in this spec. Desk copy warns that re-Propagate replaces non-protected `propagated` masks.
- **Cap.** 16 Tracks. Create requires at least one positive point or positive stroke (or an existing `track_id`).
- **Independence.** Mask writes touch Annotation / Session only. Vocab writes touch their own stores only. No foreign key from class or triplet to Track.
- **Desk does not copy** the source workbench page or FrameCanvas. HTTP may still accept unused Concept / Review payloads; the sitting does not expose them.
- **Default backends remain fake.** Real SAM 3.1 / Scribble workers stay optional via existing sitting config; weights stay outside this tree.
- **Words.** UI and HTTP speak Track, Track-on-Frame, Geometric Prompt, Scribble Prompt, Predict, Propagate, Session, Annotation. Do not call phase/class/triplet Annotation.

## Testing Decisions

- **Good test:** assert behaviour a labeler can see on HTTP or on the desk (status, overlay presence, Annotation GET after a write, Session still inactive after a vocab write). Do not assert module names, in-memory maps, or checkpoint math. Do not use a GPU.
- **HTTP seam:** one compose app, TestClient, temporary Frame Pool and Annotation root, fake predictor, fake Scribble. Prior art: compose tests that already keep Session inactive across phase/class/triplet writes; source-desk tests for geometry, leftover pins, Propagate, Undo (behaviour only — re-state in this tree).
- **Must cover on HTTP:**
  - Session stays inactive until Predict/Propagate; first Predict may create Session in the desk, but HTTP tests that open Session explicitly still prove Geometric Memory, Handoff, persist.
  - Geometric Memory merge + leftover-point delete re-Predict; last leftover + Prior; pins absent from Annotation GET.
  - Boxes rejected.
  - Scribble then Handoff; Scribble-down 503 on strokes, points still work; rollback on empty SAM after Scribble.
  - Immediate Annotation after Predict / delete pin / Clear / Undo; GET Annotation with no Session.
  - Propagate Job, Protected skip for `manual`/`refined`, conflict 409 while running, no phase/class/triplet mutation.
  - Undo restores mask + pins; empty stack is not an error; no Redo.
  - Independence: mixed vocab writes do not change Annotation; mask writes do not change vocab documents.
- **Desk seam:** Vitest for displayed-rect → `[0,1]`, click vs drag threshold, 800 ms debounce cancel on frame change, pending drop — tickets 02–06. Playwright is **ticket 07 only** (isolated API `:7892` / Vite `:5192` / fixture Clip; not main’s `:7881`/`:5174`, not `dev1`’s `:7891`/`:5191`). Fake backends. Sitting default this worktree is `:7882` (Vite dev `:5175`). Operator Frame Pool unused. Ticket 01 may still run the existing vocab e2e to prove the new ports.
- **Must cover on the desk (ticket 07 Playwright):**
  - Open Clip, paint phase, Session still inactive.
  - Click picture does not toggle play; Space does (when not typing).
  - Left click → Predict (debounce or button) → overlay silhouette; Annotation GET shows it after reload of the page with no extra Save.
  - Track list visible while Task focus is class.
  - Scrub drops pending (no extra Track).
  - Propagate short range on the fixture Clip updates a neighbor Frame’s overlay.
- **Do not test:** Concept Prompt UI, Review Accept/Reject, class/triplet foreign keys, real GPU, old FrameCanvas, mask timeline lane, Redo.

## Out of Scope

- Binding Frame class or Triplet to a Track (later; research note only).
- Concept Prompt on the sitting.
- Review Decision UI; Protected-by-accepted.
- Redo.
- A fourth Task-focus tab named mask.
- A mask lane on the timeline.
- Replacing the player with a JPEG-only canvas or the source FrameCanvas page.
- Click-to-play on the picture.
- Explicit Save / dirty-leave modal.
- Opening Session on Clip enter.
- Edge polish after Predict.
- Boxes as Geometric Prompts.
- Export / interchange formats.
- Review rules for phase/class/triplet.
- Multi-user, live OR, training, writing `scribble_service` paths.
- Copying the source Vite desk or growing `video_label_service.app`.

## Further Notes

- Grill locked Geometric Memory, one-tool click/drag, overlay not a focus tab, binding deferred, HTTP contract + new UI, lazy Session, overlay on the player, 800 ms auto-Predict, Undo, picture never plays on click, Track list always on the right rail, immediate Annotation, pending drop on scrub.
- Source desk remains the primary source for Predict / Handoff / Propagate Job numbers (debounce 800 ms, drag threshold 0.005, width 1–40, cap 16, pin hit radius 10 CSS px).
- Tickets: `.scratch/mask-desk/issues/01`–`07`. **01–05 resolved.** Frontier is 06 (Propagate Job). Do not implement without grabbing a ticket.
