# pilot-ux/21 — The pins this range still owes: implementation notes

The issue body (`issues/21-the-pins-this-range-still-owes.md`) is frozen; this file is the working
record of what landed, the decisions the findings left open, and what is left for the owner's
hand-verification.

Three behaviours landed by the 16/17/18/26/27 range with nothing asserting them. All three are pins
on already-landed code, so nothing in `endo_label/` or `web/src/` changed behaviour — only the
guards' seams, their tests, and the claims that read as pinned.

## 1. Done's widening direction

`item_capabilities` re-opens a Done item for its assigned reviewer or an admin
(`endo_label/capabilities.py:75-76`). Ticket 27 pinned the *narrowing* — an uninvolved reviewer
carrying the flag is refused — through `dan` in `tests/test_refused_write.py`, but not the
*other* direction: an assigned reviewer **without** the reviewer role flag, who the flag-based
matrix would have refused and the assignment rule allows. The matrix could not see the difference
because its one item's assigned reviewer (`carol`) carried the flag too.

The matrix now walks Done on two items. `_DONE_ITEMS` is `(("CLIPA", "mask"), ("CLIPB", "class"))`;
the first keeps `carol` (assigned reviewer, with the flag), the second is `frank` (annotator, no
reviewer flag, assigned reviewer). `_ITEM_OF` routes `("Done", "frank")` to the second item, and
`_build_state` grew an `item`/`reviewer` override so the same public walk drives it. `erin` (flag,
never assigned) stays the narrowing row.

Decisions:

1. **A second Done item, not a reassignment.** The ticket's "beside the assigned reviewer and the
   admin" is read literally: `carol`'s row (flag + assignment) and `frank`'s row (assignment only)
   sit side by side in the Done cell, so one item's reviewer never has to stand for both cases.
   `CLIPB/class` is used because `CLIPB/phase` is the Unassigned state's item and would change
   state under the second walk.
2. **`frank` is an annotator, not a no-role account.** Membership, not the role flag, is what
   assignment requires (`coordination.assign_reviewer` checks membership and reviewer≠assignee), so
   an annotator handed review work is the real shape of the widening. `dave` still carries the
   "holds no role" case.
3. **The pin is proven to fail under the old rows.** With `reject`/`re_review` from Done temporarily
   reading `admin or reviewer`, `test_me_capability_matrix_is_role_by_state` fails on both `frank`
   (false where the matrix says true) and `erin` (true where the matrix says false).

## 2. The focus guard's wiring

The predicate is pinned in `web/src/desk/focusGuard.test.ts`; the wiring is not, and a node test
cannot render `<main>`. This is marked where a reader looks for the pin, rather than left reading as
covered:

- `web/src/ClipDesk.tsx` — the `releaseFocus` docstring, and a comment above the `return`, say the
  `onPointerUp` attachment is hand-verified (AGENTS.md → Verification).
- `web/src/desk/focusGuard.ts` and `web/src/desk/focusGuard.test.ts` — both headers now say the
  predicate is what the test pins and the `<main>` handler is hand-verified, so the green unit test
  is not read as pinning the wiring.
- The behaviour itself is on the owner's list below.

Ticket 18 made the same call for the same handler ("it is the one acceptance item no in-process
test can carry"); this ticket only stops the claim from being unmarked.

## 3. The keyboard Undo path

`runUndo`'s guard and the Undo button's `controls.undo` are now one predicate, `mayUndo(writable,
busy)`, which `maskControlStates` reads for `undo`. The keydown handler's rule moved out of the
effect into `maskKeyAction(event, { editable, write, busy })` (`web/src/desk/keyboard.ts`), so the
chord's inertness for a non-writable item is a pinned decision rather than a guard a later
refactor can drop: the chord returns `"ignore"` instead of `"undo"`, and the button is disabled by
the same `mayUndo`. Ticket 25 moved `mayUndo` itself to `keyboard.ts` — the side that fetches
nothing — and `maskControls` imports it from there, so `isEditableTarget`'s callers
(`TimelinePanel`, `FrameControls`, `PlayerPanel`) no longer reach `useSWR` through this file.

Two of the decisions below were reversed by the rounds that followed, and now say what the code
does: the chord derives `mayUndo` from the gate's own inputs rather than being handed the boolean
(22), and `preventDefault` is the named decision `maskKeyConsumes` (22). Ticket 22's notes
(`22-a-read-that-never-answers.md`) are where those landed.

Decisions:

1. **The chord keeps asking the server when there is nothing to undo.** The button also waits on
   `canUndo` (a Session snapshot to restore); the chord does not, and still reports "Nothing to undo
   on this Frame". `mayUndo` is only the shared ownership/busy gate.
2. **`predicting.current`, not `predictBusy`, in the chord's check.** The ref is the synchronous
   flag, so a chord cannot race the render that would turn `predictBusy` on. The button's mapping
   uses the state, as before.
3. **An inert chord is left to the browser, never swallowed.** The old handler prevented default
   on any ctrl/meta+Z and let `runUndo` bail; the chord now consumes only a key it acts on —
   `maskKeyConsumes(action)` is true for `"undo"` alone — so a non-writable item's Ctrl/Cmd+Z,
   and Escape, reach the browser instead of being swallowed by a desk that does nothing with
   them. Editable targets are unaffected (`isEditableTarget` returns before either). Ticket 22
   made this an explicit decision rather than a property of the branch it sat in.
4. **`mayUndo` takes `writable`, not the `/api/me` cell, and the chord derives it.** Ticket 21
   passed the boolean in from the call site; ticket 22 reversed that, so `maskKeyAction` computes
   `mayUndo(state.write.writable, state.busy)` itself and no call site can hardcode a `true` the
   disabled Undo button would not honour. Ticket 21 took the flag because `useMaskWrite` returned
   a fresh object every render; ticket 22 memoizes that state on the read, so the `document`
   keydown listener now depends on `write` itself and the flag is only the predicate's input.

## Verification

- `pytest`: **272 passed, 1 skipped** (baseline at this ticket's HEAD is the same count — the matrix
  test changed, no test was added).
- `web/`: `vitest run` **191 passed** in 21 files (baseline 186 in 20: 4 in the new
  `desk/keyboard.test.ts`, 1 added to `desk/maskControls.test.ts`); `tsc -b --noEmit` clean;
  `oxlint src` clean apart from the pre-existing `maskPanel.test.ts:54`, `useClipFilters.ts:82` and
  `desk/EditorCards.tsx:352` warnings.
- This worktree had no `web/node_modules` of its own, so `web/node_modules` was symlinked to the
  main checkout's for the run (gitignored; left in place).
- Both new vitest pins were checked against the unfixed code: removing the `mayUndo` branch from
  `maskKeyAction` fails the chord test, and reverting the Done rows to the role flag fails the
  pytest matrix.
- **Playwright was not run** and no e2e spec was added to (AGENTS.md → Verification: the browser
  stack is the owner's while draining).

## What the owner should see by hand

1. On the desk of any Clip, click a `<button>` (e.g. a Frame control) and then press Space: the
   transport plays and the button is not re-fired. Click the rail's **Every Clip (admin)** *text*,
   then Space: the transport plays and the scope did not toggle. This is the `<main>` wiring of
   `releaseFocus`, and no in-process test can carry it.
2. Open a Clip whose mask item this Account may not write (assigned to someone else): press
   Ctrl/Cmd+Z. Nothing is sent and no "Undo failed" notice appears — the chord is inert with the
   Undo button. Then, as the assignee, make an edit and press the chord: the edit is undone.
3. As the assignee of a Done item, use Reject / re-review from the desk: they work; from an
   account that merely carries the reviewer flag but is not assigned, they are disabled.

## Leftovers, deliberately out of this issue

- **`isEditableTarget` still has no in-process pin.** It is a DOM read (`instanceof HTMLElement`,
  `closest`), so it stays a hand-verified branch; `maskKeyAction` pins the rule around it.
- **The keydown listener's registration itself is hand-verified.** The decision is pinned; that the
  effect attaches it to `document` is a React wiring claim like the focus guard's, and item 1 of
  the owner's list covers the behaviour.
