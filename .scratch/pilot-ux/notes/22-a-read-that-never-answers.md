# pilot-ux/22 — A read that never answers: implementation notes

The issue body (`issues/22-a-read-that-never-answers.md`) is frozen; this file is the working record
of what landed, the decisions the body left open, and what is left for the owner's
hand-verification. It is the fifth mask-side survivor of the second closeout review (the
first four are ticket 20) and it changes no backend.

## What landed

> **Renamed after this ticket.** The names below are the code's at the time; the cell is now
> `ItemWrite` / `ItemRead` / `itemWriteOf` and `useMaskWrite` is a wrapper over
> `useItemWrite(clipId, "mask")`, because the permission belongs to the (Clip, Task type) item and the
> editor rail reads the same cell for phase, class and triplet. Nothing this note decides changes.

- `web/src/desk/maskControls.ts` — the permission is now **four** states.
  - `useMaskWrite` reads SWR's `isLoading` and `error` (it destructured only `data` before) and
    hands them to `maskWriteOf` through a new `MaskRead` (`asked` / `isLoading` / `error`).
  - `maskWriteOf(item, read)` answers `unknown` for a read still out, `unreadable` for a read
    that ended without an item — `/api/me`'s 404 for a (Clip, task type) pair with no Assignment,
    or a request that failed — and `writable`/`refused` for an answered cell. An answered item
    wins over a stale retry error, and an error sticks while SWR retries, so the state never
    oscillates back into a hold.
  - `MaskPointerGate` gained `"unreadable"`, and `acceptsPointerInk(gate)` is the one place the
    canvas asks whether it takes a pointer (open/checking yes; busy/refused/unreadable no).
  - `heldPromptOnAnswer(write)` → `"send" | "drop" | "hold"`: the truth table the held-prompt
    effects are built from.
  - `maskReadFailure(write)` → the desk's own line (`MASK_READ_FAILED`) for an unreadable read,
    null otherwise.
  - `useMaskWrite` now `useMemo`s its result on the read's values, so the chord's `document`
    listener and the held-prompt effects do not re-register on every render for a state object
    that did not change.
- `web/src/desk/keyboard.ts` — `maskKeyAction` takes `{ editable, write, busy }` (the gate's own
  inputs) instead of a `mayUndo` boolean and derives `mayUndo` itself. New `maskKeyConsumes(action)`
  says whether the handler calls `preventDefault()`.
- `web/src/desk/MaskPanel.tsx` — the two held-prompt effects run `heldPromptOnAnswer`; the keydown
  handler passes `write`/`busy` and consumes only a chord it acts on; the panel renders the
  read-failure line in a `data-mask-read-failed` paragraph beside `data-mask-refusal`.
- `web/src/MaskOverlay.tsx` — `inputEnabled = acceptsPointerInk(gate)`; a gate that turns while a
  drag is in flight drops `drag.current` and repaints (a new effect on `inputEnabled`), the repaint
  only redraws in-flight ink while the gate accepts it, `onPointerMove` no longer draws under a
  shut gate, and `onPointerUp`'s early return now `bump()`s.
- `docs/adr/0030-...md` — the consequence that said the unread arm "has no sentence to show" now
  states the four states and the one line the desk words (about the read, never about ownership).

## Decisions

1. **A failed read is its own state, and the desk words its own line for it.**
   `/api/me`'s 404 body is `{"detail": "Not Found"}` — there is no server sentence to carry, and the
   desk will not invent a refusal (`_write_refusal`'s "no mask item yet" wording belongs to the
   server). So `unreadable` carries no refusal and the panel shows
   `MASK_READ_FAILED = "Could not read this Clip's mask permission — mask writes are off until it
   loads."` It is a statement about the read, not about ownership, so ADR 0030's one-author rule for
   refusals is untouched. A network failure and a 404 land in the same state on purpose: both mean
   no answer is coming now, and the panel has nothing better to say for one than the other.
2. **The hold ends immediately; it is not bounded by a timer.** The body offered "the server's
   sentence or a bounded hold that ends". There is no sentence, and a hold that ends is a hold that
   should not have started — the answer is not late, it is not coming. The prompt is dropped by the
   same `"drop"` arm that drops a refused one, and `pendingRef` no longer grows. If SWR's retry
   later lands an answer, `useMaskWrite` answers `writable`/`refused` from it as usual.
3. **The chord is inert and left to the browser, never inert and swallowed.** `maskKeyConsumes`
   returns true only for `"undo"`, so a refused item's Ctrl/Cmd+Z reaches the browser instead of
   being `preventDefault`-ed by a desk that does nothing with it. `isEditableTarget` answers first,
   so a field being typed in keeps its own undo either way; the choice is only about a desk key the
   mask gate turned down.
4. **The chord's `mayUndo` is derived, not passed.** `maskKeyAction` computes
   `mayUndo(state.write.writable, state.busy)`, so there is no boolean argument a call site could
   hardcode to `true` — the shape of the defect ticket 21 closed. The call site still chooses
   `predicting.current` (the synchronous flag) over `predictBusy`; that is unchanged from ticket
   21's decision 2 and is pinned by its own comment, not by a test.
5. **The in-flight ink is discarded and the canvas repainted.** A gesture started under
   `open`/`checking` is a write the desk may no longer make once the gate is `busy`, `refused` or
   `unreadable`; leaving its half-drawn ink on a canvas that nothing repaints is the defect. The
   decision is `acceptsPointerInk`, the wiring is the clear-and-`bump()` effect.
6. **The held-prompt effects are one decision, two wirings.** `heldPromptOnAnswer` is pinned; the
   `"send"` and `"drop"` effects that run it cannot be, so they are marked hand-verified where a
   reader looks (the effect comment, the `maskControls.test.ts` header, the `maskPanel.test.ts`
   header, and the owner's list below).
7. **`useMaskWrite` memoizes.** Ticket 21's decision 4 chose to depend on `write.writable` because
   the hook returned a fresh object every render. Memoizing the state on the read is the same
   property without the stale-closure footgun: `write` is now stable, so the keydown effect and the
   held-prompt effects depend on the state itself.

## Verification

- `web/`: `tsc -b --noEmit` clean; `vitest run` **202 passed** in 21 files (baseline at this
  ticket's HEAD: 196 — this ticket adds 6); `oxlint src` back to its two pre-existing warnings
  (`maskPanel.test.ts` children-prop, `desk/EditorCards.tsx` set-state-in-effect).
- `pytest`: **272 passed, 1 skipped** (backend untouched, same count as ticket 21's record).
- The new pins were checked against the unfixed behaviour: reverting `maskWriteOf`'s `unreadable`
  arm makes the failed-read test (`checking`, not `unreadable`) fail, and reverting `maskKeyAction`
  to a `mayUndo` boolean does not compile the chord test, which is the point.
- **Playwright was not run and no e2e spec was added** (AGENTS.md → Verification: the browser stack
  is the owner's while draining).

## What the owner should see by hand

1. **The held prompt on a fresh Clip.** Open a Clip as its assignee and drag on the picture before
   `/api/me` answers (or throttle the network): the stroke is held, and it Predicts when the answer
   lands writable. Do the same as a non-assignee: the stroke is dropped and the server's refusal
   sentence sits in the panel. No in-process test runs either effect.
2. **The failed read.** Make `/api/me?clip_id=…&task_type=mask` fail (stop the API, or open a Clip
   whose mask Assignment row was deleted by hand): the panel shows "Could not read this Clip's mask
   permission — mask writes are off until it loads.", the canvas is shut with no crosshair, and a
   drag made before the failure is not held forever. The paragraph's own rendering is pinned in
   `maskPanel.test.ts` since ticket 26, which seeds the failed read into SWR's cache (the `fallback`
   cannot carry an error); what stays by hand is the real request failing and the effects around it.
3. **The mid-drag flip.** Start a drag as the assignee and, while the button is down, have the item
   turn refused (reassign it in another tab) or start a Propagate Job: the gesture does not commit,
   its ink goes off the canvas, and the panel says which of the two it is.
4. **The chord on a refused item.** Press Ctrl/Cmd+Z with the mask item assigned to someone else:
   nothing is sent, no "Undo failed" notice appears, and the browser's own undo is not swallowed
   (e.g. focus a text field first — its own Ctrl+Z still works, as before).

## Leftovers, deliberately out of this issue

- **The `unreadable` arm has a render test since ticket 26.** SWR's `fallback` cannot seed an error,
  so `maskPanel.test.ts` seeds it into the cache the config's `provider` returns, and the panel's
  `data-mask-read-failed` paragraph asserts `MASK_READ_FAILED` exactly. The decision is still pinned
  in-process too (`maskWriteOf`, `maskPointerGate`, `maskReadFailure`, `heldPromptOnAnswer`); what
  stays by hand is the real request failing.
- **`isEditableTarget` still has no in-process pin** (ticket 21's leftover, unchanged).
- **The `/api/me` 404 could carry a better sentence** — the server's `_write_refusal(con, None, …)`
  already knows how to say "no mask item yet". This ticket keeps the desk's own line rather than
  change the backend payload; if the 404 body ever grows a sentence, `unreadable` could show it the
  way `refused` shows `write_refusal`.
- **SWR retries a 404 forever** (its default `shouldRetryOnError`, not this ticket's), so the state
  can flip back to `writable`/`refused` if a retry lands. That is the intended "an answer overrides
  the failure"; a bounded retry policy is a separate decision.
