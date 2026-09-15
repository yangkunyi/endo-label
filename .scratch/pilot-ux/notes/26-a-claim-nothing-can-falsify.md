# pilot-ux/26 — A claim in the repo that nothing can falsify: implementation notes

The issue body (`issues/26-a-claim-nothing-can-falsify.md`) is frozen; this file is the working record
of what landed, the choices the body left open, and what is left for the owner's hand-verification. It
is the four survivors of the closeout review over `pilot-ux/25` and `pilot-ux/23` that live outside
`web/src/clipFilters.ts` — a note describing code that was replaced, an e2e header claiming coverage
the file does not have, a pin that could only say "no", and a header whose claim nothing checked — and
it changes no behaviour.

## What landed

> **Superseded in part, three times.** `pilot-ux/24` replaced the *basis* the bullets below quote
> (`entry ?? stored` became field by field), and `pilot-ux/27` replaced the *writer*: the
> `applyClipFilterChange` they name no longer exists, and the write left the `setStored` updater for
> an effect keyed on `clipFiltersEntryToWrite`. Where a bullet below names either of those as the code
> in the tree, it is history; the rule is not. See `27-the-write-path-says-one-thing.md`.

- `.scratch/pilot-ux/notes/23-choose-patches-the-selection-in-force.md` — the "What landed" bullets
  then stated the write path in the tree and named `pilot-ux/24` where it superseded them: `choose`
  calls `applyClipFilterChange` (which writes the browser's entry), `chooseClipFilters`'s basis is
  field by field rather than `entry ?? stored`, the entry effect writes `entry` alone, and the
  two-changes pin folds through `applyClipFilterChange` and the fake storage. Ticket 23's record is
  kept; each reversed line says which ticket reversed it rather than contradicting `notes/24`.
  **`pilot-ux/27` then deleted `applyClipFilterChange`, so those bullets named a symbol that no longer
  existed** — the same defect this bullet was written to fix, one merge later. `notes/23` now carries
  its own supersession banner, and each bullet names the ticket that reversed it a second time.
- `web/e2e/clip-scope.spec.ts` — the header no longer reads as coverage the file does not have. It
  states the rule as `clipFilters.ts`'s module header does, says plainly that the rule is pinned
  in-process and where, says that this file never intercepts `/api/me` (so it does not run the
  in-flight window and does not pin either direction of the rule), and points at the two notes whose
  owner lists carry that hand verification. No assertion changed, no spec was added, and the stack
  was not run.
- `web/src/desk/maskPanel.test.ts` — the `unreadable` arm's positive pin. `deskHtml(item,
  failedRead = true)` seeds the failure into the cache the SWR config's `provider` returns (its
  `fallback` carries data and not an error), `readFailureText` unescapes the apostrophe like
  `refusalText` already did, and the new test asserts the paragraph's exact sentence as a literal,
  denies the refusal there, and checks the controls and the `unreadable` gate. The helper's comment
  and the file header now say the render reaches the arm; what remains hand-verified is the real
  request failing, not the paragraph.
- `web/src/desk/keyboard.ts` + `web/src/desk/keyboard.test.ts` — the import direction is pinned from
  the source. The new test walks `keyboard.ts`'s value-import closure and fails on any value import
  that reaches a module with imports of its own, and on any bare package specifier; the header says
  the pin exists and what it watches.
- `.scratch/pilot-ux/notes/22-a-read-that-never-answers.md` and
  `.scratch/pilot-ux/notes/25-the-comments-say-the-opposite.md` — the two earlier records of the same
  claims are brought forward: 22's leftover "the `unreadable` arm has no render test" and 25's
  "nothing pins the import direction" would have been the same kind of contradiction this ticket is
  about, so both now say what ticket 26 pinned and what is still by hand.

## Decisions

1. **The e2e header tells the truth instead of growing a case.** The body offered `page.route` on
   `**/api/me` with a delay plus an assertion on the stored `scope`. The browser stack is the owner's
   while draining (AGENTS.md → Verification), so an unrun spec would be a *new* unverified claim in
   the very file the item is about, and `notes/24` already records that no spec was added. The header
   now says which parts the spec runs, which parts are pinned in-process, and which are the owner's
   hand verification, and its `project`/`tag` sentence is the one `clipFilters.ts`'s module header
   makes: with no option list loaded the resolution equals the stored value, so those fields are
   untouched because the two values agree, not because a list proved them.
2. **The failed read is reached through SWR's cache, not a new seam in the panel.** `fallback` seeds
   data and not an error; the cache the config's `provider` returns is where the hook reads `error`
   from, so `deskHtml(undefined, true)` renders the `unreadable` arm with no production change and no
   new prop on `MaskPanel`. It is the smallest seam the body asked for, and it is test-only.
3. **The positive pin asserts the sentence as a literal.** Comparing to the imported `MASK_READ_FAILED`
   would let a reworded constant keep the suite green on both sides of the comparison, which is the
   "text could be wrong" half of the finding. The literal copies the wording deliberately, the way the
   file's `REFUSED` literal already does for the server's refusal sentence; a reworded line now fails
   the render test and has to be updated on purpose.
4. **The direction pin parses the source rather than adding a lint rule.** `no-restricted-imports` or
   `import/no-cycle` would live in `web/.oxlintrc.json`, outside this ticket's fence, and the pin
   wanted is narrower: no value edge out of `keyboard.ts` into a module that imports. The test walks
   the value-import closure and fails on any module in it with imports of its own. It is deliberately
   conservative — it fails on any value import in the closure, whether or not that module fetches —
   because "fetches nothing" is not readable from a body the test does not parse; that limit is stated
   in the test's header comment.
5. **The two earlier notes are brought forward, not rewritten as history.** Like `notes/25`'s own
   handling of `notes/21`, the record of what each ticket landed is kept and the superseded line says
   what superseded it.

## Verification

- `web/`: `vitest run` **208 passed** in 21 files (baseline at this ticket's HEAD: 206 — one test
  added to `maskPanel.test.ts` and one to `keyboard.test.ts`); `tsc -b --noEmit` clean; `oxlint src`
  at its two pre-existing warnings (`maskPanel.test.ts` children-prop, `desk/EditorCards.tsx`
  set-state-in-effect).
- Both new pins were checked against the bug they name. Rewording `MASK_READ_FAILED` in
  `maskControls.ts` fails the read-failure test on the assertion (and only on it); changing
  `keyboard.ts`'s type import of `./maskControls` to a value import fails the direction test with
  `maskControls.ts value-imports react`.
- `pytest`: **272 passed, 1 skipped** — the backend is untouched, the same count the last four tickets
  recorded.
- This worktree has no `web/node_modules` of its own, so `web/node_modules` was symlinked to the main
  checkout's for the run (gitignored; left in place), as the earlier tickets in this range did.
- **Playwright was not run and no e2e spec was added** (AGENTS.md → Verification: the browser stack is
  the owner's while draining). The one e2e change is the file's header comment.

## What the owner should see by hand

1. **The in-flight pick** (unchanged behaviour; tickets 23 and 24 own the rule). Pick a Project or a
   tag while `/api/me` is still out, and check that an admin's stored `scope: "all"` survives; once
   the answer lands, pick a value a loaded list no longer carries and check that no sentence names
   what the surface never showed. `clip-scope.spec.ts` does not run this window; the pure decision is
   pinned in `clipFilters.test.ts`.
2. **The failed read.** Make `/api/me?clip_id=…&task_type=mask` fail (stop the API, or delete the
   item's Assignment row): the panel's own sentence, the shut canvas and the retries are unchanged.
   What the render test cannot exercise is the request actually failing and the effects around it.

## Leftovers, deliberately out of this issue

- **`isEditableTarget` still has no in-process pin** (tickets 21, 22 and 25's leftover, unchanged).
  The new direction test pins what `keyboard.ts` imports, not the DOM predicate's behaviour.
- **The value-edge pin is a source parse, not a lint boundary.** It walks imports; a module in the
  closure that fetched from its own body with no imports would slip past, and a lint rule in
  `web/.oxlintrc.json` would still be the stronger boundary.
- **`clip-scope.spec.ts` still has no in-flight case.** If the owner wants the window pinned in the
  browser, the case is `page.route` on `**/api/me` with a delay, a pick during it, and an assertion on
  the stored `scope`; ticket 26 chose the honest header over an unrun spec.
- **`maskControls.test.ts`'s `MASK_READ_FAILED` pin is still constant-to-constant**
  (`maskReadFailure(UNREADABLE)` against the constant). The wording is now pinned at the render in
  `maskPanel.test.ts`; `maskControls.test.ts` continues to pin the decision, not the copy.
