# pilot-ux/27 — The write path says one thing and does another: implementation notes

The issue body (`issues/27-the-write-path-says-one-thing.md`) is frozen; this file is the working record of
what landed, the decisions the body left open, and what is left for the owner's hand-verification. It
changed no backend and no behaviour the earlier rounds pinned.

## What landed

- `web/src/clipFilters.ts`
  - One per-field rule, worded the same way in the module header, `resolveClipFilters`'s docstring,
    `ClipFiltersView`'s `filters` sentence and `chooseClipFilters`'s docstring: *a field the read has
    answered for is the resolution's, and a field it has not is the reader's*. `project`/`tag` are always
    the read's (a loaded list's verdict holds for any caller; with no list loaded the two values are
    equal); `scope` is the one field a read can answer differently by caller, so it is the reader's until
    `/api/me` answers.
  - The false sentence at the end of `resolveClipFilters`'s docstring — "A pick made in that window is a
    patch of the stored value and not of this read" — is gone. It was true before `pilot-ux/24` and
    describes only `scope` ever since; the docstring now says what the change patches in each field.
  - `applyClipFilterChange` (which decided and wrote in one call) is replaced by `clipFiltersChange`, a
    pure step over `ClipFiltersState = { stored, entry }` whose answer is the next state *and* the entry
    to write.
- `web/src/useClipFilters.ts`
  - The hook holds `{ stored, entry }`. `choose` is
    `setState((current) => clipFiltersChange(current, caller, options, patch))` — a pure updater, no write.
  - The entry write happens in the effect, after the commit: `const target = correction ?? state.entry` —
    the read's correction when there is one (it is what a later read must find), otherwise the entry the
    last change committed. The state is not touched in the effect, so there is no cascading render and
    `oxlint` stays at its two pre-existing warnings.
  - The hook header states the rule and names exactly what the node suite does not reach: no render and no
    effect run there, so `choose` and the entry effect are this file's wiring and are hand-verified; the
    suite pins the pure decisions and reads this file's source to pin the call.
- `web/src/clipFilters.test.ts`
  - The tests that modelled a change now run through `clipFiltersChange` and write its `entry` through the
    stand-in storage (`writeEntry`), which is the half the hook's effect performs.
  - New/extended pins: the step's `entry` for a change by an unknown caller with a dead Project or tag
    carries neither value; the admin's `all` survives a Project pick during the window and is the entry; a
    change persists itself; the two-changes-in-one-event fold ends at the last change's entry.
  - One source-reading pin (`the hook applies a change with the step that carries the write, not a
    write-free fold`) asserts the hook's exact `setState((current) => clipFiltersChange(...))` call, that
    the hook never calls `chooseClipFilters(`, and that the effect consumes `correction ?? state.entry`.
    It was checked against the reverted fold and fails on it.
- `.scratch/pilot-ux/notes/24-a-change-does-not-decide-an-unanswered-field.md` — marked superseded where
  it describes `applyClipFilterChange` and the write inside the `setStored` updater; note 24's decisions
  about the *rule* still stand.

## Decisions

1. **The step carries the write.** `clipFiltersChange(state, …)` returns `{ stored, entry }` — the same
   selection twice — so "a change persists itself" is a pin on the step rather than on the hook, and the
   hook has nothing left to decide. The state's `entry` is the last change's own answer and stays after
   the write; the effect depends on the state object, so it is written once per change, not once per
   render.
2. **The write is in an effect, not in the updater.** A state updater must be pure, and React may run it
   more than once or never commit its result; `saveStoredClipFilters` is idempotent, but the invariant
   that made that safe was nowhere stated. The effect runs after the commit, so the browser's entry can
   only ever hold a value that was committed and shown. The read's correction wins over a change's owed
   write, which is what "the corrected selection is the one a later read gets" requires; a change made
   while the read is unanswered already patches the resolution's `project`/`tag`, so no correction
   follows it.
3. **The seam is pinned by reading the hook's source.** This suite has no DOM, so no render and no effect
   runs and the call between the hook and the step cannot be exercised. That is the one regression the
   body names — reverting `choose` to `chooseClipFilters` — and a source assertion is the only in-process
   pin available. The hook header and this file say plainly that the effect itself is hand-verified, so
   the pin does not read like coverage of the write.
4. **No clearing state in the effect.** The first shape spent the owed write with a `setState` inside the
   effect; that trips `react(set-state-in-effect)` and adds a render per change for a field the effect
   only reads. Keeping the entry as the last change's answer is the same guarantee — the effect writes it
   only on the commit that produced it — without the extra pass.

## Verification

- `web/`: `tsc -b --noEmit` clean; `vitest run` **207 passed** in 21 files (baseline at this ticket's
  HEAD: 206; this ticket adds the one seam pin and rewrites the change-path assertions); `oxlint src`
  reports only the two pre-existing warnings (`maskPanel.test.ts` children-prop,
  `desk/EditorCards.tsx` set-state-in-effect).
- The source pin was run against the reverted fold
  (`setState((current) => ({ ...current, stored: chooseClipFilters(…), entry: null }))`) and failed, as
  intended; the file was restored before committing.
- `pytest`: **272 passed, 1 skipped** — the backend is untouched.
- **Playwright was not run and no e2e spec was added or edited** (AGENTS.md → Verification: the browser
  stack is the owner's while draining).

## What the owner should see by hand

1. **A change still reaches the browser.** In a fresh profile, open `/clips`, wait for `/api/me`, and pick
   a tag: `localStorage.getItem("endo_label:clip-filters-v1")` holds the pick, and it survives a reload.
   The fold is pinned in-process; that the *effect* runs after the commit is not.
2. **A pick made while `/api/me` is in flight.** Seed a stored selection, throttle `/api/me`, reload
   `/clips`, and pick a tag before the answer lands. An admin's `scope: "all"` is still there after the
   answer (no "showing your own Clips" sentence) and is what the entry holds.
3. **Two changes in one event both land.** Two controls changed in one handler (or one fast pair of picks)
   end at the second change, not at a snapshot of the first.
4. **A browser whose reader never chose a filter gains no entry.** Untouched profile, `/clips` loaded: the
   key stays `null`.
5. **The ordinary corrections are unchanged.** A non-admin's stored `all` is corrected and named; the
   sentence survives the commit that writes the selection and clears on a change.

## Leftovers, deliberately out of this issue

- **The hook still has no DOM test.** The body allows no new dependency and the fence no new suite; a DOM
  environment is both. Everything the effect does beyond the pure step is hand-verified, named in the hook
  header and item 1 above.
- **`ClipList.tsx` and `desk/ClipRail.tsx` comments are not mine to touch** (they belong to other
  tickets). Both describe a change as patching the corrected selection, which is exact for every control
  they own: their scope control only exists once `canChooseScope` is true, i.e. once the caller is known.
  The one field where the rule is reader's-until-answered is the pick in the `/api/me` window, and no
  surface but the hook decides it.
