# endo-label-product/08 — One Session per Clip for all task types, or not

## Question

The current mask desk: at most one Session, one Clip, GPU state dies when the Clip changes.

For the spec: is **Session** still one live working state per Clip that holds **all** v1 task types, or does each task type get its own Session (or no Session at all for Phase / Frame class / Triplet)?

Use what the throwaway desk actually felt like. Update `CONTEXT.md` if Session’s definition changes.

## Answer

**Split by weight, not by Clip.** **Session** is mask-only (SAM GPU). Phase / class / triplet are labels on the Clip and do **not** need a Session.

All four tool sets can be used on the **same Frame at the same time**. No Task-focus switch. Session still exists only for mask, and only starts when Predict / Propagate actually runs. You can ignore unused tools on a light sitting; that is not a mode. `CONTEXT.md` **Task focus** is retired (do not use).
