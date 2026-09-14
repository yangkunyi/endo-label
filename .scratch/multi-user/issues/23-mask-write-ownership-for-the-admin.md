# multi-user/23 — Mask write ownership for the admin

**What to build:** a call on who may write mask. Ticket 19 put every mask write (predict, undo, propagate, track edit/delete, point delete, clear-mask, save, review) behind the item's assignment (`endo_label/mask/http.py` → `require_label_assignee`, and `coordination._write_allowed` hardcodes `admin=False`). Since the desk renders the mask editor unconditionally and consumes no `edit_labels` capability for it, any Account that is not the item's assignee — the admin included — gets `403 Forbidden` surfaced as "Predict failed". The 22 e2e sitting only passes because its harness assigns every clip's mask item first.

Either mask follows the same ownership rule as phase/class/triplet (then the desk must hide or disable the editor when the item is not writable, and the admin self-assigns before masking), or the admin is a special writer (then `_write_allowed` and the ticket-19 decision record change with it). Whichever way, a refused write must say why — not "Predict failed".

**Answered (2026-09-14, owner): mask follows assignment.** There is no admin bypass and no
claim-on-first-write: an admin self-assigns before masking, exactly like everyone else. The desk-side
work and the decision record are ticketed as `multi-user/26`; the refusal sentence this ticket also asked
for already landed with the write-refusal rewrite.

**Found by:** review finding from the 22 closeout; `.scratch/multi-user/issues/22-playwright-closeout.md`

- [ ] decision recorded (ADR or CONTEXT.md note) on mask write authority
- [ ] the desk's mask controls render from capabilities, not unconditionally
- [ ] a refused mask write shows the ownership reason
- [ ] `web/e2e/mask-desk.spec.ts` no longer depends on a hidden assignment to pass
