# pilot-ux/19 — The correction is read, and its sentence is readable: implementation notes

The issue body (`issues/19-the-correction-is-read.md`) is frozen; this file is the working record of
what landed, the decisions the two findings left open, and what is left for the owner's
hand-verification.

The findings are the two survivors the closeout review of `pilot-ux/17` left: the notice was painted
for the correction commit and nothing else (a flash), and `choose` patched the stored value rather
than the shown one, so a pick while `/api/me` was unanswered wrote the un-narrowed or dead value
straight back to `localStorage`.

## The shape of the fix

One design answers both: the value the hook **acts on** is the resolution's `filters`, and the
reader's stored value stays in hand as the subject of the sentence — so the sentence is derived
during render, is not consumed by being read, and goes only when a change replaces the value it is
about.

- `web/src/clipFilters.ts`
  - `clipFiltersView(stored, caller, options)` (new) is one render of the stored selection as the
    hook hands it out: `filters` (the selection in force — rendered and patched), `notice` (the
    sentence about the stored value) and `entry` (the selection the browser's entry must become, or
    `null` when it is already right). It is the pure function the hook is built from, so the
    lifetime is pinnable without a DOM.
  - `resolveClipFilters` is unchanged in behavior. Its `corrected` docstring and the module header
    now say what `corrected` is for: `filters` is the selection in force and what the **entry**
    should become — not a value written back over the reader's own.
  - `chooseClipFilters`' docstring now names its base as the resolution's `filters` (it always was
    `{...shown, ...patch}`; the comment was the part that had drifted).
- `web/src/useClipFilters.ts`
  - `stored` (was `selection`) is the reader's value from `localStorage`, and nothing but a change
    of theirs replaces it. The correction is written to the **entry** in an effect and never back
    into the state, so the sentence is still there on the render after it. No setState in the
    effect; oxlint's `react(set-state-in-effect)` warning that 17 accepted is gone.
  - `choose(patch)` patches `view.filters` — the selection the surface shows — writes it, and makes
    it the state. A pick while `/api/me` has not answered therefore patches the narrowed selection
    (`mine`, dead Project/tag already out) instead of the stored one.
- `web/src/ClipList.tsx`, `web/src/desk/ClipRail.tsx`, `web/src/clipFilterSurfaces.test.ts` —
  comments follow the contract: the sentence belongs to the stored value and stays until a change.
- `web/e2e/clip-scope.spec.ts` — the correction test now asserts the sentence is **readable** on
  both surfaces instead of asserting zero `role="status"` nodes.

## Decisions the findings left open

1. **The sentence is derived, not latched.** The render computes `notice` from the resolution, and
   the effect that writes the entry does not touch the state, so the sentence cannot flash. The
   alternative — latching the sentence in state and correcting the state in an effect — would put a
   state update back behind the render, which is exactly the shape the issue rejects. A consequence
   worth naming: the sentence lives on the surface that found the stale value, so a client-side
   navigation that unmounts that surface (page → desk) does not carry it; the desk shows it only if
   its own read finds the entry stale. The issue's lifetime is "until the reader changes a filter",
   and unmounting is not a filter change — the sentence the reader was looking at is not taken away
   from under them while they are on it.
2. **The entry is still corrected; the reader's value is not.** The e2e's `storedScope` poll stays
   true, and the sentence stays readable, because those are two different things now: the entry
   (the browser's) and the value in hand (the reader's). Deleting the notice was rejected in the
   issue, so the sentence stays and the entry write is kept.
3. **`clipFiltersView` is the test seam, not the hook.** This repo has no DOM environment
   (`web/vite.config.ts` pins `include: ["src/**/*.test.ts"]`), a server render runs no effects, and
   no new dependency is allowed. The hook's decision logic therefore lives in `clipFilters.ts` and
   is pinned there; what remains in the hook is `useState` + `useMemo` + one write effect, which is
   now small enough to read at a glance (`stored` is never set by an effect; `entry` is the only
   thing the effect writes; `choose`'s base is `filters`).

## Verification

- `web/`: `vitest run` **188 passed** in 20 files (baseline in this worktree: 186 in 20 — +1
  `clipFilters.test.ts` for the sentence's lifetime, +1 for the pick while `/api/me` is unanswered;
  one existing test's comments were reworded, one render test retitled). `tsc -b --noEmit` clean.
  `oxlint` exit 0 — the `react(set-state-in-effect)` warning this issue's design removes is gone
  (the remaining warnings are pre-existing: `EditorCards.tsx:352`, `maskPanel.test.ts:54`).
- This worktree has no `web/node_modules` of its own, so it was symlinked to the main checkout's
  (gitignored; left in place so the suite runs here).
- `pytest`: **272 passed, 1 skipped** — no Python changed.
- **Playwright was not run** (AGENTS.md: the browser stack is the owner's while draining). The
  rewritten assertions in `web/e2e/clip-scope.spec.ts` are unverified by me; the storage poll they
  follow is what makes them deterministic, and the sentence they now assert is what the render and
  the pure view are pinned to in-process.

## What the owner should see by hand

1. As an admin, on `/clips`, check **Every Clip**; log out and log in as an annotator (the browser
   keeps `localStorage` across the two sessions).
2. `/clips` lists that annotator's own Clips, with no 403, **and the sentence is on the page**:
   "Every Clip is the admin's scope; showing your own Clips." It is set in `text-muted-foreground`
   above the list and is not a flash.
3. Change the Project or the tag: the list re-narrows, the sentence goes, and `localStorage` holds
   `{"project":…,"tag":…,"scope":"mine"}` — `scope` stays `mine` however many picks follow.
4. Reload: the entry is already `mine`, so there is nothing to correct and nothing to say.
5. Open a Clip: the rail lists the same Clips, offers no scope control, and — on a browser whose
   entry is still stale — shows the same sentence above the list.

## Leftovers, deliberately out of this issue

- **The hook's React wiring is still not executed by vitest.** What is pinned is the pure view the
  hook is built from (`clipFiltersView`), the choice's base (`chooseClipFilters`), and the surfaces'
  renderings; the three lines of `useState`/`useEffect`/`useCallback` that call them are asserted
  only by the e2e spec, which the owner runs. There is no DOM environment and adding one is not this
  ticket's business (this is the same missing-test gap 17 recorded, now reduced to the glue).
- **A flag revoked mid-session** (13's leftover) still lands as the server's sentence until `/api/me`
  revalidates; unrelated to the state fix here.
- **The rail still cannot clear a live Project/tag filter** (13's leftover), and the tag list is still
  global, so "dead" is still a property of the loaded list alone.
