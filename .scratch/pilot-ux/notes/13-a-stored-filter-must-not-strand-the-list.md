# pilot-ux/13 — A stored filter must not strand the list: implementation notes

The issue body (`issues/13-a-stored-filter-must-not-strand-the-list.md`) is frozen; this file is
the working record of what landed, the decisions the two findings left open, and what is left for
the owner's hand-verification.

## The shape of the fix

One place reads the browser's selection for the Account that is asking, and both surfaces go
through it. That is the fix, not a convention: the page and the rail cannot disagree about the list
if there is only one read of it.

- `web/src/clipFilters.ts` — `resolveClipFilters(stored, caller, options)` (pure) answers the
  selection to *ask with*, the sentence the reader must see, and whether the stored entry is stale.
  It is the whole of both findings:
  - `scopeForCaller(scope, isAdmin)` reads `all` as `mine` for anyone the server would refuse, so a
    non-admin gets its own Clips instead of the refusal sentence over an empty list.
  - a `project`/`tag` the loaded option list does not carry is **dropped and named**: the request
    leaves the dead name out, and the reader is told which value went.
- `web/src/useClipFilters.ts` — the hook both surfaces use. It feeds `resolveClipFilters` `/api/me`,
  `/api/projects` and `/api/tags`, shows the notice, and writes the corrected selection back to
  `localStorage` (an effect: `localStorage` is an external system). The write-back is what makes
  "corrected" stick — for the other surface and for the next reload.
- `web/src/ClipList.tsx` / `web/src/desk/ClipRail.tsx` — both now take `{filters, notice,
  canChooseScope, choose}` from the hook; the page's admin checkbox and the rail's are the same
  stored scope.
- The server is untouched. `GET /api/clips` still refuses `scope=all` from a non-admin with 403 and
  the same sentence (`endo_label/mask/http.py:170`); what changed is which selection the browser
  asks with. A refusal the server does send still renders as its own sentence.

## Decisions the findings left open

1. **The caller is three-valued, not two.** `isAdmin` is `boolean | null`, and `null` is a caller
   whose `/api/me` has not answered. That state narrows the request to `mine` (never ask for what
   cannot be proved) but corrects nothing: writing `mine` back while the flag is unknown would let a
   cold load take an admin's stored `all` away. In the running app `AppShell` gates its children on
   `/api/me`, so both surfaces see a known caller on their first render; the unknown state is real
   for a server render and for the tests.
2. **The rail clears the scope, and the admin can change it there.** Acceptance asks the rail to
   "clear or change" the stored scope without leaving the desk. Clearing is the correction itself —
   the rail is the surface that reads the entry and puts it right, and it says so in its own line,
   so a stranded labeler never has to find the Clips directory. Changing is a mirror of the page's
   admin checkbox, rendered only for a caller who may hold `all` (a control a non-admin could click
   into a 403 would be a second way to strand them).
3. **It is a checkbox, not a button.** The rail's own spec pins "no buttons in the rail"
   (`web/e2e/desk.spec.ts:213`), which is the guard against per-Clip controls creeping in. It also
   means `releaseFocus` (decision D1) had to learn about `input[type=checkbox]`: a pointer click on
   the rail's scope control must not leave focus on it, or Space toggles the scope instead of
   starting playback. Keyboard users still keep Space/Enter on a control they Tab to.
4. **A dead value is dropped *and* named.** The ticket allowed either. Dropping alone would hide
   that a filter was ever set (and would re-apply it silently if the name came back); naming alone
   would leave the list empty behind a `<select>` that shows nothing. So the request leaves the dead
   value out, the empty-list sentence is never a lie about "no Clips", and the notice says which
   stored value was left behind — `The stored Project "West Study" is not registered; showing every
   Project.`
5. **Only a value that is missing from a *loaded* list is dead.** `projects`/`tags` are `undefined`
   until that list answers (`/api/projects` and `/api/tags` are global reads — no membership scoping
   — see `projects_router.get_projects` and `admin_router.list_tags`), and an empty-but-loaded list
   is a real answer. A value that *is* in the list but matches none of this Account's Clips is a live
   filter over an empty list: the select shows it, so nothing is silent, and nothing is dropped.
6. **The sentence for the corrected scope is not the server's.** "Only an admin can see every Clip."
   is the server's refusal; the notice here reads `Every Clip is the admin's scope; showing your own
   Clips.` so a reader can tell a correction from a refusal.

## Verification

- `web/`: `vitest run` **168 passed** in 17 files (baseline 158: 6 new in `clipFilters.test.ts`, 4 in
  the new `clipFilterSurfaces.test.ts`), `tsc -b --noEmit` clean, `oxlint` clean apart from the
  pre-existing `desk/EditorCards.tsx:352` warning. This worktree has no `web/node_modules` of its
  own, so `web/node_modules` was symlinked to the main checkout's for the run (gitignored; left in
  place so the suite runs here).
- `clipFilters.test.ts` pins the pure fallbacks: `all` read as `mine` for a non-admin and kept for
  an admin; a caller not yet known narrowed but never written back; a dead Project/tag dropped and
  named; an unloaded list never calling a value dead; an empty loaded list calling any value dead;
  and the corrected entry round-tripping so a later read has nothing left to say.
- `clipFilterSurfaces.test.ts` renders the two surfaces to static markup with a stored `all` and
  answers the Clips request from the SWR fallback **keyed by the selection a surface asks with** — a
  surface that asked with the uncorrected selection draws no Clips, so the test pins the corrected
  request, not only the pure function. It covers the non-admin page, the non-admin rail, the admin's
  rail control, and a page emptied by a dead Project.
- `pytest`: **254 passed, 1 skipped** — no Python changed. `tests/test_clip_scope.py` still pins the
  server rule this ticket leaves alone (`scope=all` from a non-admin is 403 with the sentence, never
  a quiet narrowing).
- **Playwright was not run** (AGENTS.md: the browser stack is the owner's while draining).
  `web/e2e/clip-scope.spec.ts`'s last test pinned the old, stranded behaviour — a non-admin with a
  stored `all` seeing the refusal — and now pins the correction on both surfaces, plus a second test
  for the rail's own control. Those assertions are written but unverified by me, including the
  pointer-click-then-blur path on the rail checkbox (decision 3).

## What the owner should see by hand

1. As an admin, on `/clips`, check **Every Clip**. Log out, log in as an annotator (the browser keeps
   `localStorage` across the two sessions).
2. `/clips` lists that annotator's own Clips, with one sentence above the list and no `403`.
3. Open a Clip: the desk rail lists the same Clips, carries the same sentence, and offers no scope
   control.
4. Reload: the sentence is gone, because the stored entry was corrected rather than ignored.
5. On the desk, click the rail's **Every Clip (admin)** as an admin, then press Space: the transport
   still plays (the click released focus).

## Leftovers, deliberately out of this issue

- **A flag revoked mid-session** (the SPA holds a cached `/api/me` saying admin while the server no
  longer agrees) still lands as the server's sentence until `/api/me` revalidates. Every load reads a
  fresh flag and the desk revalidates on focus, so this is a window, not a stranding; a
  `mutate(mePath())` when a Clips request comes back 403 would close it.
- **The rail cannot clear a *live* Project/tag filter** — a value that exists but matches none of
  its Clips. The ticket named the scope, and a dead value is dropped automatically; a rail-wide
  "clear filters" gesture is a different affordance and was not asked for.
- The tag option list is global (`/api/tags`), so a tag that exists on other Projects' Clips is not
  "dead" for an annotator who holds none of them; the select shows it, and the list is empty for a
  reason the reader can see. If tags ever become per-caller, `resolveClipFilters` is the one place
  that reads the list, so the meaning of "dead" moves with it.
