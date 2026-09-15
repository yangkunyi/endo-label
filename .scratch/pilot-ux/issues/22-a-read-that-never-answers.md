# pilot-ux/22 — A read that never answers is not the same as a read in flight

**What to build:** the mask-side survivors of the closeout review over `pilot-ux/20` and `pilot-ux/21` — a
permission that never answers, and three behaviours those tickets landed that nothing pins.

**A read that fails is not a hanging read.** `web/src/desk/maskControls.ts:148-152` (`useMaskWrite`)
destructures only `data` from SWR and drops the error. `/api/me` answers 404 for a Clip and Task type with no
item, and answers nothing when the fetch fails; both leave the state `unknown` for good, so
`maskPointerGate` returns `checking` (`:127-140`), `MaskOverlay` keeps the canvas open
(`web/src/MaskOverlay.tsx:125-127`), and the prompt is held for an answer that will never come: nothing sends
it (`runPredict`'s `!write.writable` guard, `web/src/desk/MaskPanel.tsx:251`), nothing says why (`refusal` is
null for a non-refused state), and `pendingRef` grows. ADR 0030's middle — "the answer that lands writable is
what sends it" — is written for the answer that lands; a read that never lands needs its own truth: no write,
and either the server's sentence or a bounded hold that ends. `useMaskWrite` must carry `isLoading`/`error`
into `MaskWrite` instead of swallowing them, and the error arm must be decided and pinned.

**Three landed behaviours nothing pins.**

- The two held-prompt effects (`web/src/desk/MaskPanel.tsx:330-345`): the writable answer sends the held
  prompt, the refused answer drops it beside the panel's sentence. Vitest here is node (`web/vite.config.ts`
  includes `src/**/*.test.ts`) and `renderToStaticMarkup` runs no effects, so pin the decisions they are
  built from (`maskWriteOf` / `maskControlStates` / `maskPointerGate` on an answered read) and mark the
  effect wiring hand-verified where a reader looks for its pin. What must not remain is a claim that reads as
  pinned.
- The mid-drag gate flip (`web/src/MaskOverlay.tsx:265-274`): a permission or a Job that turns while a drag
  is in flight makes the gesture a write the desk may no longer make, and the early return skips `bump()`, so
  the last drawn segment stays as ink on a canvas nothing repaints. Clear the in-flight ink or repaint on the
  flip, and pin the choice as a pure function.
- `mayUndo` at the chord's call site (`web/src/desk/MaskPanel.tsx:600-612`): the arguments are unpinned, so
  `mayUndo: true` keeps every test green and re-opens exactly what `pilot-ux/21` closed — the chord walking
  past the disabled Undo button. Make the argument assertable without a DOM, or this ticket's own claim is
  unmarked.

**And one decision, written down:** a refused item makes the undo chord `ignore` (`web/src/desk/keyboard.ts:
38-44`), so the handler no longer calls `preventDefault()` and the browser's own Ctrl+Z receives the event.
Say which is intended — inert and swallowed, or inert and left to the browser — and pin it.

Acceptance:

- [ ] `useMaskWrite` tells a read that answered from one that failed or is still in flight, and a failed read
      is not the `unknown`/`checking` state for the rest of the session
- [ ] a failed read does not hold prompts for an answer that will not come, and what the panel says in that
      state is decided and written down
- [ ] the in-flight ink after a gate flip is cleared or repainted, and the choice is pinned as a pure function
- [ ] the `mayUndo` argument at the chord's call site is pinned, so `mayUndo: true` fails a test
- [ ] the held-prompt behaviours are asserted in-process or explicitly marked hand-verified where a reader
      looks for their pin
- [ ] the undo chord's `preventDefault` behaviour on a refused item is decided and pinned
- [ ] no Playwright spec is added and the e2e stack is not run (AGENTS.md → Verification)
