# pilot-ux/26 — A claim in the repo that nothing can falsify

**What to build:** the four survivors of the closeout review over `pilot-ux/25` and `pilot-ux/23` that
live outside `web/src/clipFilters.ts` — a note that describes code that was replaced, an e2e header that
claims coverage the file does not have, a pin that can only ever say "no", and a header whose claim nothing
checks. Every item is a *statement* the repo makes about itself; the theme is that each one should either
become true or stop being said. Do not change behaviour.

1. **`.scratch/pilot-ux/notes/23-choose-patches-the-selection-in-force.md:30` is stale.** It says `choose`
   is `setStored((current) => chooseClipFilters(current, caller, options, patch))`; `pilot-ux/24` replaced
   that call with `applyClipFilterChange` (which is what writes the entry), and the write is no longer a
   bare pure fold. `pilot-ux/24`'s own note records the replacement, so the two notes now disagree. Bring
   note 23 up to what landed — and where a later ticket supersedes an earlier note, say so in the earlier
   note rather than leaving a reader to reconcile them. (`pilot-ux/27` owns the same write path's code; it
   owns note 24. Do not edit `web/src/clipFilters.ts`, `web/src/useClipFilters.ts` or
   `web/src/clipFilters.test.ts` — they are 27's.)
2. **`web/e2e/clip-scope.spec.ts:19-27` claims coverage that is not in the file.** The header states the
   `pilot-ux/23`/`24` rule — a pick made while `/api/me` is in flight keeps the reader's `scope`, and a
   value a loaded list proved dead does not survive the pick — as if this spec pins it. It does not: `rg
   api/me e2e/` finds no route interception anywhere in `web/e2e/`, so no spec runs the in-flight window,
   and `pilot-ux/24`'s note itself says no spec was added and the stack was not run. A header that reads
   like coverage is worse than silence, because the next reader stops looking. Either add the missing case
   (`page.route` on `**/api/me` with a delay, pick a filter during the window, assert the stored `scope`
   and the absence of a notice) or say plainly in the header which parts are pinned in-process and which
   are the owner's hand verification. The word "only `scope` is unproved" is also wrong where it stands:
   with the option lists not yet loaded, `project`/`tag` are unproved too — they are untouched because
   `filters === stored`, not because a list proved them. `web/src/clipFilters.ts`'s module header has the
   accurate version; match it.
3. **`readFailureText` (`web/src/desk/maskPanel.test.ts:164-170`) only ever asserts `toBeNull()`.** Its
   three call sites can only catch the failure line appearing where it should not; the positive arm — the
   sentence `MASK_READ_FAILED` actually rendering, `web/src/desk/MaskPanel.tsx:773-786` — is unpinned, so
   the text could be wrong, or the `readFailure` payload could stop reaching that `<p>`, and stay green.
   The panel's node render cannot reach the `unreadable` arm (see that file's header), so make the
   positive arm reachable the same way the other arms are (build the `MaskPanel` with a write cell that is
   `unreadable`) or state at the helper that the positive arm is hand-verified — pick one and make the
   comment true either way. Adding the case is preferred; if it needs a seam, take the smallest one.
4. **`web/src/desk/keyboard.ts:1-11` claims the module reaches nothing that fetches, and nothing checks
   it.** The claim is true today (`import type` plus `verbatimModuleSyntax`) and `pilot-ux/25` moved
   `mayUndo` here on the strength of it, but the next edit that adds a value import of a data-fetching
   module silently drags SWR and React into `TimelinePanel`/`FrameControls`/`PlayerPanel`, which import
   `isEditableTarget` from here. Either pin the direction cheaply (a node test that imports the module's
   source and asserts no value import — or, if that is too fiddly, move the DOM-only predicate into its
   own module so the panel-facing import cannot reach the rules at all) or downgrade the header's claim to
   what is actually enforced.

Scope fence: `web/src/desk/`, `web/e2e/`, `.scratch/pilot-ux/notes/`. Nothing in `web/src/clipFilters.ts`,
`web/src/useClipFilters.ts`, `web/src/clipFilters.test.ts` (they are `pilot-ux/27`) and nothing in
`endo_label/` or `tests/` (they are `pilot-ux/28`). Change no behaviour; if an item cannot be made true
without changing behaviour, say so in a note and mark it hand-verified rather than inventing the change.

Acceptance:

- [ ] note 23 describes the write path that is actually in the tree, and where a later ticket superseded
      it the note says so rather than contradicting it
- [ ] the `clip-scope.spec.ts` header either matches a case that exists in the file or says which parts are
      hand-verified, and its `project`/`tag` claim matches `clipFilters.ts`'s module header
- [ ] the read-failure sentence is either asserted present on the arm that renders it, or explicitly marked
      hand-verified at the helper
- [ ] `keyboard.ts`'s "reaches nothing that fetches" is either pinned or no longer claimed
- [ ] pytest, vitest and tsc are green; no Playwright spec run and the e2e stack not started
      (AGENTS.md → Verification)
