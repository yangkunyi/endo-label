# pilot-ux/27 — The write path says one thing and does another

**What to build:** the two survivors of the closeout review that live in the Clip-filter module — the
contract comment `pilot-ux/24` contradicted, and the storage write that now happens somewhere nothing
pins. You own `web/src/clipFilters.ts`, `web/src/useClipFilters.ts` and `web/src/clipFilters.test.ts` for
this ticket; `pilot-ux/26` owns `web/src/desk/`, `web/e2e/` and the notes, and `pilot-ux/28` owns the
Python side. Stay inside these three files.

**1. The module contradicts itself, and the surviving half is the wrong one.**
`web/src/clipFilters.ts:171-173` (`resolveClipFilters`'s docstring) still says:

> A pick made in that window is a patch of the stored value **and not of this read** (see
> `chooseClipFilters`)

That was true before `pilot-ux/24`. For `project`/`tag` it is now false by design — a pick *is* a patch of
the read's value there, which is the half of 24 that stops a value a loaded list proved dead from
surviving a change. `chooseClipFilters`'s own docstring (`:245-256`) says the opposite. Both cannot stand:
the reviewers called this the one material finding of the range, not because anything runs differently but
because the file is a contract, and the next reader who trusts `:171-173` re-opens the hole 24 closed.
Reconcile them into one statement of the per-field rule (a field the read has answered for is the
resolution's; a field it has not is the reader's) and make the module header, `resolveClipFilters`,
`ClipFiltersView`, `chooseClipFilters` and the hook's header say the same thing. A comment that is only
true of `scope` must say so.

**2. The one write the reader's own change performs happens inside a state updater, and no test covers the
seam that runs.**
`web/src/useClipFilters.ts:124-135`:

```ts
setStored((current) => applyClipFilterChange(current, caller, options, patch));
```

and `applyClipFilterChange` (`clipFilters.ts:289-298`) writes `localStorage` on its way. Two consequences
the review found, and they are one problem — the write is in the wrong place, and nothing pins which
function the hook calls:

- A state updater is supposed to be pure, and React may call it more than once or never commit its result.
  Today `saveStoredClipFilters` is idempotent and `update.hasEagerState` makes the last call the committed
  one, so nothing is observably broken — but the entry is the shared state this whole module exists to
  keep, and the invariant that makes it safe is nowhere stated or enforced. Whatever shape you choose, the
  entry must hold only values that were committed and shown, and the write must happen where a commit has
  happened rather than while React is deciding.
- **The seam has no pin, and that is the part to fix.** No node test imports `useClipFilters`; the pins
  call `applyClipFilterChange` directly. Revert `choose` to the bare `chooseClipFilters` — dropping the
  write entirely, so a reader's change never reaches the browser — and vitest stays green (206 passed);
  only `web/e2e/clip-scope.spec.ts`'s "the admin may change the scope from the desk rail" catches it, and
  by AGENTS.md → Verification nobody on this drain runs that. So: push the decision out of the hook until
  the hook is too thin to hold a mistake (a pure reducer or an equivalent single pure step whose answer is
  "the next state, and what to persist" is the obvious shape), pin that step for the cases that matter —
  a change by an unknown caller with a dead stored Project or tag leaves neither behind, the admin's `all`
  survives a Project pick during the window, two changes in one event both land, a browser whose reader
  never chose gains no entry, and a change still persists itself — and state in the hook header exactly
  what the node suite cannot reach (effects and wiring) instead of leaving a comment that reads like
  coverage. `pilot-ux/24`'s note says "the decision layer is pinned and the wiring is marked
  hand-verified"; the review showed that comment promised more than it pinned, so be precise.

The behaviours earlier rounds pinned must stay pinned and unchanged: a non-admin's stored `all` is
corrected when the read answers, the correction sentence survives the commit that writes the selection and
clears on a change, an admin's `all` survives a pick made during the window, and the request is narrowed
without the reader's stored value being overwritten.

Acceptance:

- [ ] one per-field rule, stated the same way in the module header, `resolveClipFilters`'s docstring,
      `chooseClipFilters`'s docstring and the hook's header; nothing in the tree still says a pick never
      patches this read
- [ ] the browser's entry can only hold a value that was committed and shown, and no state updater has a
      side effect
- [ ] the step the hook applies a change with is pure and pinned in-process; reverting the hook's call to a
      fold that drops the write now fails a test, or the ticket says in its note why it cannot and what is
      hand-verified instead
- [ ] the hook header names exactly what the node suite does not reach
- [ ] every case above is asserted, and the earlier rounds' pills above stay green
- [ ] pytest, vitest and tsc are green; no Playwright spec added and the e2e stack not run
      (AGENTS.md → Verification)
