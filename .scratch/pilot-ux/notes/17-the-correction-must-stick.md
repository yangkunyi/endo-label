# pilot-ux/17 — The correction must stick: implementation notes

The issue body (`issues/17-the-correction-must-stick.md`) is frozen; this file is the working record of
what landed, the decisions the finding left open, and what is left for the owner's hand-verification.

The finding is the closeout review of `pilot-ux/13` (cross-file axis, finding 1; bugs axis, findings 1
and 3, in the drain run that reviewed `89d42ee…d886718`).

## The shape of the fix

One source of truth: the corrected selection is what the hook's state holds and what the browser's entry
gets, and every later interaction is a patch of that state.

- `web/src/clipFilters.ts`
  - `resolveClipFilters` now corrects **all three fields together or not at all**: `scopeDropped`,
    `projectDropped` and `tagDropped` are each gated on `known`, which is what the docstring had already
    promised ("a caller not yet known … corrects nothing"). Closure is unchanged — a value missing from a
    *loaded* list is dropped, an unloaded list (`undefined`) cannot call a value dead, `""` is no filter —
    so the request is still narrowed field by field for a caller not yet known, and only the *decision to
    write back and to name* waits for `/api/me`.
  - `chooseClipFilters(shown, patch)` is new and is the whole of a control's change: `{...shown, ...patch}`
    where `shown` is the corrected selection. It is one line on purpose — the point is the *base*, and it
    is the base the resurrection came from.
  - the docstring of `resolveClipFilters` states the contract field by field (scope; project and tag; what
    a caller not yet known does), and `ClipFilterResolution.corrected` says what the flag is for: the
    selection that should replace the entry, in state and in storage.
- `web/src/useClipFilters.ts` — `selection` is the state, and the correction goes into it as well as into
  `localStorage` (one effect, one commit). `choose` patches that state through `chooseClipFilters`, so it
  is a function of the corrected selection and of nothing else. The notice is the resolution's, so it is
  the read that finds the stored value stale that says something; the read after it has nothing to
  correct and so nothing to say.
- `web/src/ClipList.tsx`, `web/src/desk/ClipRail.tsx`, `web/src/clipFilterSurfaces.test.ts` — comments
  follow the contract: corrected *selection* rather than corrected entry, one telling per stale read.
- No Python, and no change to what the server refuses: `scope=all` from a non-admin is still 403.

## Decisions the finding left open

1. **The sentence is a one-read statement, not a banner.** 17's diagnosis is that `scopeDropped` stays
   true because the state keeps the uncorrected value, so the fix is to make the state corrected and let
   `scopeDropped` go false: the sentence is then gone on the next read of the corrected value. That is
   one commit in a browser (the correction is found during render and settled in the effect after it).
   Consequence, deliberately accepted: the sentence is **not** a persistent line above the list, and the
   owner may well not see it at all by eye. What pins "told once" is the render that finds the stored
   value stale — `clipFilterSurfaces.test.ts` (static markup, effects do not run) and the pure
   round-trip in `clipFilters.test.ts`. A visible, sticky "your stored filter was corrected" line would
   be a different affordance (and would carry the lifetime the review objected to), so it is not here.
2. **"A caller not yet known corrects nothing" is now true for every field, not only the scope.** That is
   also the bug on the bugs axis (finding 1): while `/api/me` was in flight, a dead `project`/`tag` made
   `corrected` true, and the hook's write-back then wrote `filters` — which carries the *narrowed*
   `scope: "mine"` — over an admin's stored `all`. With the three flags gated on `known`, no write-back
   can happen while the flag is unknown, so the entry is untouched until the caller is known; the
   narrowing for the request stays, because it is only ever read from.
3. **The correction is settled in an effect, not during render.** A render-phase state update is the
   pattern React prefers, but it discards the render that produced the sentence, so the reader could
   never be told. An effect commits (and paints) the stale read first, then replaces the state and the
   entry. oxlint's `react(set-state-in-effect` warning fires on it; the same warning class already exists
   at `web/src/desk/EditorCards.tsx:352`, `npm run lint` still exits 0, and here the effect is the mirror
   of an external system rather than a computation that could be derived during render (deriving it
   would make the state corrected and the sentence unreachable).
4. **The e2e spec is edited, not extended.** `web/e2e/clip-scope.spec.ts` asserted the status sentence on
   both surfaces after `page.goto`. Under decision 1 that assertion is false by the time Playwright can
   look (the entry is already right), so it now asserts the *settlement* — the entry becomes `mine` and
   no sentence hangs over the page or the rail — and points at the in-process render for the telling.
   Nothing was added to the browser stack; per `AGENTS.md` it was not run here (see Verification).

## Verification

- `web/`: `vitest run` **170 passed** in 17 files (baseline in this worktree: 168 in 17 — +1
  `clipFilters.test.ts` (the resurrection session), +1 `clipFilterSurfaces.test.ts` (the corrected entry
  read quietly); two existing tests were extended: the unknown-caller test now covers scope *and*
  project/tag against loaded lists, and "the corrected selection is the one a later read gets" now pins
  the notice on the stale read and its absence on the corrected one). `tsc -b --noEmit` clean. `oxlint`
  exit 0; warnings are the two `react(set-state-in-effect)` ones (decision 3) — no other file changed.
- This worktree has no `web/node_modules` of its own, so it was symlinked to the main checkout's
  (gitignored, left in place so the suite runs here).
- `pytest`: **257 passed, 1 skipped** — no Python changed.
- **Playwright was not run** (AGENTS.md: the browser stack is the owner's while draining). The rewritten
  assertions in `web/e2e/clip-scope.spec.ts` are unverified by me; the storage poll they follow is what
  makes them deterministic, and the sentence assertions they replace could not have survived this fix.

## What the owner should see by hand

1. As an admin, on `/clips`, check **Every Clip**; log out and log in as an annotator (the browser keeps
   `localStorage` across the two sessions).
2. `/clips` lists that annotator's own Clips, with no 403. The sentence about the stored scope belongs to
   the read that found it, so it is over by the time the page is painted — expect **no** persistent line
   (decision 1). If you want to see the telling, the render is pinned in
   `web/src/clipFilterSurfaces.test.ts`; there is no longer a surface that shows it for the session.
3. Change a Project or the tag: the list re-narrows, and `localStorage` holds
   `{"project":…,"tag":…,"scope":"mine"}` — `scope` stays `mine` after any number of picks (this is the
   resurrection that was fixed; before, each pick wrote `all` back for one commit).
4. Open a Clip: the rail lists the same Clips, offers no scope control, and shows no sentence.
5. Reload: the entry is already `mine`, so there is nothing to correct and nothing to say.

## Leftovers, deliberately out of this issue

- **The hook's wiring still has no runnable coverage.** The settle effect (state + entry in one commit)
  and `choose`'s write cannot be reached by vitest: this repo has no DOM environment
  (`web/vite.config.ts` also pins `include: ["src/**/*.test.ts"]`, so a `.test.tsx` would be skipped),
  and a server render runs no effects. What is pinned is the pure instruction (`chooseClipFilters` and
  the resolve → choose → re-read session in `clipFilters.test.ts`) and the surfaces' renderings; the
  wiring itself is asserted only by the e2e spec, which the owner runs. This is the missing-test finding
  2 of the same review, still open for that reason.
- **A flag revoked mid-session** (13's leftover) still lands as the server's sentence until `/api/me`
  revalidates; unrelated to the state fix here.
- **The rail still cannot clear a live Project/tag filter** (13's leftover), and the tag list is still
  global, so "dead" is still a property of the loaded list alone.
