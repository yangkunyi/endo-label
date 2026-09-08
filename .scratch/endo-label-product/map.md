Label: wayfinder:map

# Endoscopic labeling product

## Destination

A spec for a local endoscopic surgical-video labeling product (one labeler): which **task types** belong in v1, how they share Clip / Frame / Session / storage, and what if anything is reused from the current mask desk. Throwaway prototypes exist only to verify functions — one desk, all four in-pool tasks on the same Clip — before the spec locks. This map does not ship the product and does not require keeping the current desk.

## Notes

- Domain: root `CONTEXT.md` + `docs/adr/`. Task types are named **phase**, **class**, **triplet**, **mask** (glossary: Phase, Frame class, Triplet, mask). No umbrella. **Annotation** is still this repo’s mask store.
- Skills every session: `/grilling`, `/domain-modeling`, `/research`. Prototype tickets also run `/prototype`. Plan; do not ship. Prototype tickets are throwaway verification, not the product.
- Map lives in **this** repo (`/data3/yky/endo_label`). Copied from `sam3_1_label_tool`; old feature tickets were not copied.
- Settled on chart: one labeler, local desk, durable labels. Phase ≠ Frame class. A Triplet is a Frame row (instrument + verb + target) and need not sit on a Track. One Clip may carry several task types. Clip = ordered Frames (Frame Pool). Mask/Track is **must-include in v1 as a task**; the current desk implementation is not sacred. Reuse only if it earns it.
- After [What task families endoscopic datasets annotate](issues/01-endo-task-families.md): candidate pool is **only** those four families — **Phase**, **Frame class**, **Triplet**, **mask/Track**. **class** is stackable per-Frame flags (tool presence, blurred vision, …), not tools-only. Research extras as their own task types stay out.
- Mask temporal fill is the current desk’s SAM 3.1 **Propagate Job** (seed on this Frame, explicit run, not auto after Predict). Phase / class / triplet are not SAM-propagated. Phase span is a human interval write, not Propagate.
- Phase names, class names, and Triplet instrument/verb/target lists are **customizable**. Not locked to Cholec80 / CholecT. Seed lists in the throwaway are examples only.
- Old-tree mask locks (not copied here): scribble Mask Handoff, pixel `rle_fg`, Protected Mask. Do not reopen unless a ticket here proves they block the product. The source desk is `/data3/yky/sam3_1_label_tool`.
- Refer to tickets by name, not bare numbers.
- Research agents write `.scratch/endo-label-product/research/*.md` and the ticket `## Answer`; they do not edit this map. Next `/wayfinder` copies gists into Decisions so far.

## Decisions so far

- [What task families endoscopic datasets annotate](issues/01-endo-task-families.md) — Public sets actually label: exclusive Phase/workflow, multi-hot tool presence (Frame class), Triplet rows, pixel masks (often not identity Tracks), plus extras (step, verb-only action, skill, CVS, keypoints, boxes, laparoscope motion). Full table: [research/endo-task-families.md](research/endo-task-families.md).
- [Which annotators host several task families in one project](issues/02-multi-task-annotators.md) — CVAT / Label Studio / Encord can mix timeline or frame class with instance geometry in one project; none have a native Frame-row Triplet. `scribble_service` writes tissue Track masks and only reads Triplet GT. Inventory: [research/multi-task-annotators.md](research/multi-task-annotators.md).
- [Which 2-3 task types the throwaway prototype runs](issues/04-prototype-task-pick.md) — All four: Phase, Frame class, Triplet, mask/Track. 2–3 cap lifted for this throwaway only.
- [Phase stored per Frame or as intervals](issues/05-phase-durable-form.md) — Per-Frame exclusive Phase is canonical; interval is the paint gesture.
- [What word names a durable label across task types](issues/03-umbrella-durable-term.md) — No umbrella. Use phase, class, triplet, mask.
- [Throwaway desk for all four tasks on one Clip](issues/06-throwaway-multi-task-desk.md) — Four share one Clip. Shape is good. File: [prototype/four-task-desk.html](prototype/four-task-desk.html).
- [Which task types belong in v1](issues/07-v1-task-list.md) — v1 is phase, class, triplet, mask.
- [One Session per Clip for all task types, or not](issues/08-session-across-tasks.md) — Session = mask/SAM only, lazy-open on Predict/Propagate. All four editors usable at once on the same Frame. No Task-focus switch.
- [What to reuse from the current mask desk](issues/09-reuse-mask-desk.md) — **New repo** `/data3/yky/endo_label`. Port a thin mask module from this desk. Four sibling backends. Do not grow `video_label_service.app`. Do not copy `.scratch` / superseded ADRs.
- phase / class / triplet product slice — spec + tickets 01–07 resolved: [../phase-class-triplet/spec.md](../phase-class-triplet/spec.md). Desk-wide vocab. Triplet has no Track. Sitting is YAML + FastAPI `:7880` serving `web/dist`. Local Playwright is `cd web && npm run test:e2e` (isolated `:7881` / Vite `:5174`), not CI.
- mask on the sitting player — spec implemented: [../mask-desk/spec.md](../mask-desk/spec.md). Geometric Prompt + Scribble + Propagate Job. Overlay on the player; Track list on the right rail; Session lazy; Annotation immediate. Tickets 01–07 resolved, commits `ea43908`…`1863f57`. class/triplet bind later.
- [This worktree uses its own ports](../mask-desk/issues/01-worktree-ports.md) — `dev2` sitting `7882`, Vite `5175`, Playwright e2e `7892`/`5192`. Commit `ea4390821c0d6929d702bac66f5a04d0287c2f0f`.
- [Click a point, see a Track, Annotation is on disk](../mask-desk/issues/02-point-overlay-persist.md) — overlay Geometric Prompt, 800 ms / rail Predict, lazy Session, immediate Annotation. Commit `9f956d8755bcff4fa2acd457101fd41c1f0d1493`.
- [Leftover points stay; click a pin to delete](../mask-desk/issues/03-geometric-memory.md) — Geometric Memory pins, click-pin delete + re-Predict, rail-only Active Track, New Track. Commit `326b8e3c5992ea9715f9bfc0475abc85180fc9c9`.
- [Drag is Scribble; Mask Handoff to SAM](../mask-desk/issues/04-scribble-handoff.md) — drag ≥0.005 is Scribble, width 1–40 default 8 stamped per stroke, Scribble→Handoff provenance `mask_handoff`, Scribble-down 503 keeps mask. Commit `504af2e`.
- [Undo this Frame's last committed mask edit](../mask-desk/issues/05-undo.md) — per-cell undo stack, `POST /api/session/undo`, Ctrl/Cmd+Z + rail Undo, restore mask + pins + Scribble Memory. Commit `a135ddd`.
- [Propagate Job from this Frame; Protected stay](../mask-desk/issues/06-propagate-job.md) — explicit rail Job, forward/backward/both, pollable, `source=propagated`, `manual`/`refined` protected, 409 matrix while running. Commit `b4cd640`.
- [Desk Playwright closeout](../mask-desk/issues/07-e2e-closeout.md) — 11 mask e2e on `7892`/`5192` + worker-down compose on `7893`; full Playwright 46 passed. Commit `1863f57`.
- [Leftover pins stay on their Frame](../mask-desk/issues/08-pins-stay-on-their-frame.md) — Session snapshot tagged with the Frame it was fetched for; leftover pins render only while that Frame is on screen. Commit `c5d7c76`.
- [Propagate / SAM-loading status](../mask-desk/issues/09-propagate-status-display-blocking-stays.md) — rail "Propagating…" with elapsed time; footer "Loading SAM model…". Blocking Job model stays. Commit `d3ad216`.
- [Track-on-Frame Source and Protected on the rail](../mask-desk/issues/10-protected-visible-in-desk.md) — per-Track badge empty/manual/refined/propagated, lock for Protected, ` · handoff`, ` · kept` when Propagate skips a Protected slot. e2e closeout 08–10 (`web/e2e/mask-desk.spec.ts` 17 passed). Commits `96529aa`, `497e657`.

## Not yet specified

- Review / Protected Mask rules for non-mask records.
- Export / interchange formats.
- Binding Frame class / Triplet to a Track (parked; [research/class-triplet-mask-binding.md](research/class-triplet-mask-binding.md)).
- Concept Prompt on this sitting.

## Out of scope

- Multi-user annotation ops (assignments, queues, roles).
- Live OR / intraoperative assistance.
- Shipping the product on this map (handoff is `/to-spec` after the way is clear).
- Writing into `scribble_service` annotation paths (ADR 0002 spirit).
- CVAT / Label Studio as the **primary** UI (research may still read them).
- Training models.
- Merging this product into the old scribble station.
- Reproducing only one public dataset as the destination.
- Research extras as their own task types: finer **step**, verb-only **action/gesture**, Clip-level **skill**, **CVS** criteria, keypoints, boxes, laparoscope motion.
