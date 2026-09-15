# pilot-ux/24 — A change does not decide a field the read has not answered for: implementation notes

The issue body (`issues/24-a-change-does-not-decide-an-unanswered-field.md`) is frozen; this file is the
working record of what landed, the decisions the body left open, and what is left for the owner's
hand-verification. It is the whole of the closeout review's two medium findings — one rule seen from
its two sides — and it changes no backend.

## What landed

- `web/src/clipFilters.ts`
  - `chooseClipFilters` no longer patches `entry ?? stored`. Its basis is field by field: `project`
    and `tag` from `resolveClipFilters`'s `filters`, `scope` from the reader's stored value until
    `/api/me` answers and from `filters` once it has.
  - New `applyClipFilterChange(stored, caller, options, patch, storage?)`: `chooseClipFilters` and
    then `saveStoredClipFilters` — the one call the hook's `choose` makes, so a change writes what it
    produced and the render effect is not the writer of a change.
  - The module header, `chooseClipFilters`'s docstring and `ClipFiltersView`'s `filters` sentence
    state the rule as implemented.
- `web/src/useClipFilters.ts`
  - The entry effect writes `entry` — the read's correction — and nothing else; it no longer writes
    `entry ?? stored`, so a browser whose reader never touches a filter gains no stored entry.
  - `choose` is one call: `setStored((current) => applyClipFilterChange(current, caller, options, patch))`.
  - The hook header and the handle's `filters` comment describe the field-by-field rule and mark the
    hook's own wiring hand-verified.
- `web/src/clipFilters.test.ts`
  - A file header saying the suite is node-only, that the hook cannot be rendered here, and which
    behaviour is therefore hand-verified.
  - New pins: a change while the read is unanswered cannot keep a value a loaded list proved dead
    (Project and tag); the notice after the answer names nothing; a browser whose reader never chose
    gains no entry while a change writes what it produced; the two-changes-in-one-event fold now runs
    through `applyClipFilterChange` and the fake storage, which is the seam the hook uses.
  - The pick-while-unknown pin (ticket 23's promise) now also asserts that the change wrote itself.
- `web/e2e/clip-scope.spec.ts` — the spec header's one sentence about a change was written for ticket
  23's whole-value rule; it now says the field-by-field one. No spec was added and the stack was not run.

## Decisions

1. **The basis is per field, and the asymmetry is what the read has proved.** `resolveClipFilters`
   calls a `project`/`tag` dead only against a *loaded* option list, so whenever the resolution can
   differ from the stored value the read has answered for the field, and patching the resolution
   loses nothing when no list is loaded (the two values are equal then). `scope` is different: while
   `/api/me` is unanswered the request narrows `all` to `mine` without proof, and ticket 23 pinned that
   an admin's stored `all` must survive a pick in that window. So the change takes `filters.scope` only
   once the flag is known, and the reader's stored `scope` before that — which is also what makes the
   two acceptance directions fail on their own: a base of `stored` keeps the dead value, a base of
   `filters` throws the admin's `all` away.
2. **The change writes itself; the effect writes the correction.** The body offered "put
   `saveStoredClipFilters` back in `choose`, or make the effect's condition exact". The first was
   taken. "Exact" would need a ref (or a second piece of state) to tell "the reader changed this" from
   "this is what was read", and the scope fence allows no new React state; and the effect would still
   have to fire for a state change it cannot tell apart from the initial read. The write goes inside
   the `setStored` updater, which is also what lets two changes of one event fold; React may invoke
   that updater twice under StrictMode, and `saveStoredClipFilters` is idempotent.
3. **The writer is a function of the pure module, not of the hook.** `applyClipFilterChange` lives
   beside `readStoredClipFilters`/`saveStoredClipFilters` and takes an injectable storage, the same
   shape the rest of the module already uses. That is what makes "a change persists what it produced"
   and "a reader who never chose gains no entry" pinnable in-process at the seam the hook actually
   calls, instead of only in the browser. It is a module export, not a field on `ClipFiltersHandle`;
   the handle's public type is unchanged.
4. **The sentence is unchanged in lifetime.** The hook's state still holds the reader's stored value,
   so the notice is still on the render after the correction and still ends when the reader changes a
   filter (ticket 19). A change made while the read is unanswered now replaces the stored value with
   one that has the dead field already left out, so the answer that follows has nothing to name — the
   second half of the first acceptance item, and the case the old basis got wrong.
5. **The new tests were checked against the unfixed code.** Reverting `chooseClipFilters` to
   `(entry ?? stored)` fails the two dead-value pins; reverting it to `filters` alone fails ticket
   23's pick-while-unknown pin. Ticket 23's hole was that reverting the fix kept vitest green; this
   round's three pins each name the base they reject.

## Verification

- `web/`: `tsc -b --noEmit` clean; `vitest run` **206 passed** in 21 files (baseline at this ticket's
  HEAD: 203 — this ticket replaces one test and adds three); `oxlint src` still reports only the two
  pre-existing warnings (`maskPanel.test.ts` children-prop, `desk/EditorCards.tsx` set-state-in-effect).
- `pytest`: **272 passed, 1 skipped** — the same count as ticket 22's record; the backend is untouched.
- **Playwright was not run and no e2e spec was added** (AGENTS.md → Verification: the browser stack is
  the owner's while draining). The one comment edited in `web/e2e/clip-scope.spec.ts` is text.

## What the owner should see by hand

1. **A browser whose reader never chose a filter gains no entry.** In a fresh profile, open `/clips`
   and wait for `/api/me` and both option lists to answer; do not touch a filter. Then
   `localStorage.getItem("endo_label:clip-filters-v1")` is `null` — no entry appeared from a read
   alone. Pick a tag, reload: the entry exists and holds the pick. The "a change writes what it
   produced" half is pinned in-process through `applyClipFilterChange`; the entry *effect* cannot run
   in the node suite (no jsdom), so the "never chose ⇒ no entry" half is hand-verified.
2. **A pick made while `/api/me` is in flight.** Seed a stored selection, throttle or pause the API,
   reload `/clips`, and pick a tag before the answer lands. An admin's `scope: "all"` is still there
   after the answer (no "showing your own Clips" sentence), and a Project the loaded list no longer
   carries does not come back as a sentence about a Project the surface never showed. The pure
   decisions are pinned; that `choose` folds them through the functional `setStored` is hand-verified.
3. **The whole flow still reads the same.** The existing specs cover the ordinary paths (the
   correction reaching the entry, the project/tag filters surviving a reload, the rail agreeing with
   the page); this ticket adds no new hand-visible surface.

## Leftovers, deliberately out of this issue

- **The hook still has no DOM test.** The decision layer is pinned and the wiring is marked
  hand-verified in the hook header, the hook's comments, `clipFilters.test.ts`'s header and items 1–2
  above. The body allows no new dependency and the fence no new suite; a DOM environment is both, so
  whether to add one is a separate decision. The existing `clipFilterSurfaces.test.ts` is
  server-rendered for the same reason.
- **A list that reloads between a pick and an answer is not pinned.** No test covers a `projects` or
  `tags` response arriving between a control's change and the next render. Nothing in the rule depends
  on that ordering: the change reads the caller and the option lists it is handed, and both paths are
  pinned. Ticket 22's behaviour — `resolveClipFilters` narrowing `project`/`tag` for a caller not yet
  known — is unchanged and still pinned at `clipFilters.test.ts`; this ticket changes only what a
  *change* patches, not what a read asks with.
