# pilot-ux/21 — The pins this range still owes

**What to build:** three behaviours landed by the 16/17/18/26/27 range that nothing asserts, found by its
closeout review. All three are about already-landed code, so this ticket has no blocker.

**1. Done's widening direction.** `endo_label/capabilities.py:70-77` now reads `is_reviewer or admin` for
`re_review` and for the reject back to Labeling, where the flag-based matrix had `admin or reviewer`. Ticket
27 pinned the narrowing — an uninvolved reviewer *with* the flag is refused, via the new `dan` account in
`tests/test_refused_write.py` — but not the widening: an assigned reviewer **without** the reviewer role flag
may now re-open its own Done item. `tests/test_annotator_flow.py`'s `_MATRIX` cannot see the difference
because its assigned reviewer (`carol`) carries the flag too, so every Done row reads the same under either
rule. Add the row — an assigned reviewer without the flag — beside the assigned reviewer and the admin, and
keep the narrowing row that exists.

**2. The desk's focus guard is wired.** `web/src/ClipDesk.tsx:28-36` holds `releaseFocus` and `:84` wires it as
`onPointerUp` on the desk's `<main>`. The predicate is pinned in-process, the wiring is not, and a node test
cannot render `<main>` — so a later refactor can drop the handler while the unit test stays green. Either make
the wiring assertable without a DOM, or stop the claim from being unmarked: say next to the guard that it is
hand-verified (AGENTS.md → Verification) and put it on the owner's list. What must not remain is an untested
claim that reads as pinned.

**3. The keyboard Undo path.** `runUndo` refuses to run for a non-writable item
(`web/src/desk/MaskPanel.tsx:384-387`) and the undo chord calls it unconditionally (`:568-584`), while the
Undo button is disabled on `!controls.undo || !canUndo` (`:753`). Nothing asserts the keyboard path is inert
for an item this Account may not write, so the guard is one refactor away from being bypassed by a chord.

Acceptance:

- [ ] `tests/test_annotator_flow.py`'s matrix carries an assigned reviewer without the role flag for every
      Done-state action, and still carries the uninvolved flagged reviewer
- [ ] the widening pin fails if the Done rows go back to the role flag
- [ ] the focus guard's wiring is either asserted without a DOM or explicitly marked hand-verified where a
      reader looks for its pin
- [ ] a test pins that the undo chord is inert for a non-writable item while the Undo button is disabled
