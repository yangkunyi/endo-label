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

## Not yet specified

- Where those name lists live (one desk-wide vocab vs per Clip vs per operator). Default until decided: one editable list on the desk.
- Whether a Triplet later points at a Track (chart said not required; prototype may reopen).
- Review / Protected Mask rules for non-mask records.
- Export / interchange formats.
- Role of Concept Prompt / Geometric Prompt for mask (keep current desk?) vs other task types.

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
