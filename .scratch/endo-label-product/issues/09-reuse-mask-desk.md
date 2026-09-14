# endo-label-product/09 — What to reuse from the current mask desk

## Question

The current `video_label_service` is not sacred. What, if anything, does the spec reuse?

Consider at least: Frame Pool / Clip catalog, relative coords, `rle_fg`, Session facade, SAM 3.1 worker, Scribble Model + Mask Handoff, Protected Mask / Review, the Vite desk, Annotation JSON. For each: reuse, rewrite, drop.

This is a reuse lock for the spec, not an implementation plan.

## Answer

**New repo for the product; port the mask *module*, not this tree.**

Baggage in `sam3_1_label_tool` is `.scratch/` tickets, superseded ADRs (0001, 0006, thin-scribble), dual `sam3/` copies, kit, the Vite desk grown ticket-by-ticket. That is not the SAM worker. A new repo is clean **only if** you copy a **thin mask backend** (catalog, `rle_fg`, Session, SAM 3.1, Scribble + Mask Handoff, Protected Mask) and leave the rest behind. Rewriting SAM from scratch is not “less baggage”; it is losing the working module.

- **Four sibling backends** in the new repo: phase, class, triplet, mask. Each store + HTTP. Run **alone** or **compose** on the same Clip / same Frame (class + mask tools on together).
- **Do not** grow `video_label_service.app` into the platform (Session would eat the other three).
- **UI:** new (or a slim copy of the Vite shell). All four editors on one Clip/Frame at once — no focus switch. Session lazy-opens on first mask Predict / Propagate.
- This repo stays the **source** of the mask module and the wayfinder map until `/to-spec` names the new tree.
