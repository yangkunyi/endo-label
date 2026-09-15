# pilot-ux/24 — A change does not decide a field the read has not answered for

**What to build:** the two medium survivors of the closeout review over `pilot-ux/23`, which are one
rule seen from two sides.

Today `chooseClipFilters` (`web/src/clipFilters.ts:250-259`) patches `entry ?? stored`, and `entry` is
null whenever the resolution has no correction — which includes every read still unanswered. So while
`/api/me` is in flight a change is patched onto the raw stored value: with a stored Project no loaded list
carries (the dead-value case `web/src/clipFilters.test.ts:110-122` pins as real), a reader who changes the
tag keeps that Project; the surface shows "All Projects", and when the read answers, `notice` names a
Project the reader never chose and never saw. The same basis is what lets a change write a narrowing the
read never proved — which is the admin's `scope: "all"` promise of `pilot-ux/23`
(`web/src/clipFilters.ts:236-241`), the other side of the same field-by-field question.

The rule, stated the way the resolution should state it:

- **A field the read has answered for is decided by the selection in force.** A change patches the value
  the surface shows, so a value the resolution proved dead cannot survive the change, and the notice and
  the surface cannot then disagree.
- **A field the read has not answered for stays the reader's.** While `/api/me` is unanswered only `scope`
  is narrowed without proof (`all` → `mine` for the request), so a change keeps the stored `scope`: the
  admin's `all` survives, and a non-admin's stale `all` is corrected by the read's own answer, never by the
  change. (`project`/`tag` narrowing is only ever proved against a loaded list, so it is always the
  answered case.)
- **Two changes in one event fold in order** over the value in force (`setStored((current) => …)` stays).

Then the write path tells the same story: the effect (`web/src/useClipFilters.ts:95-97`) must write a
*correction* and nothing else, so a browser whose reader never touched a filter gains no stored entry, and a
change persists what it produced (put `saveStoredClipFilters` back in `choose`, or make the effect's
condition exact — either way the effect is not the only writer).

**The pins are this ticket's point.** The last round's hole was not the bug but that nothing failed when the
fix was removed: `web/src/clipFilters.test.ts:243`'s comment claims to assert the hook while it asserts the
pure function, and reverting `choose` to a closed-over `filters` kept vitest green. So:

- keep `choose` one call into the pure module, so the seam a test pins is the seam the hook uses;
- pin in-process (node, no jsdom, no new dependency): a change by an unknown caller with a dead stored
  Project or tag must not leave it, and the `notice` after the read answers must name nothing;
- pin the admin's `all` surviving a Project pick while unknown, so a base of `filters` alone fails;
- pin the dead value not surviving a change, so a base of `stored` alone fails;
- pin two changes in one event folding, and no stored entry for a browser that never chose;
- where the hook itself cannot be reached (effects need a DOM this suite does not have), say so where a
  reader looks for the pin instead of writing a comment that claims coverage.

Keep the promises earlier rounds pinned green and unchanged: a non-admin's stored `all` is corrected when
the read answers (`pilot-ux/17`), the sentence survives the commit that corrects the selection and clears on
a change (`pilot-ux/19`), and an admin's `all` survives a pick during the window (`pilot-ux/23`). Fix
`web/src/useClipFilters.ts:49`'s "The selection in force" together with that hook's header, since this rule
is what those words have to describe.

Scope fence: no new React state, no new storage key, no new field in the handle's public type unless the
rule needs one (and then say what it means in `clipFilters.ts`'s header). Nothing in `web/src/desk/`,
`web/src/MaskOverlay.tsx` or the backend — `pilot-ux/25` owns the desk files, and the two must not overlap.

Acceptance:

- [ ] a change by a caller whose read is unanswered cannot keep a value the loaded option lists proved dead,
      and the notice after the answer names nothing the surface did not show
- [ ] the admin's stored `scope: "all"` survives a Project or tag pick during that window, and a base of
      `filters` alone fails a test
- [ ] a base of `stored` alone fails a test — the dead value must not survive a change
- [ ] two changes in one event both land
- [ ] a browser whose reader never chose gains no stored entry, and a change still persists itself
- [ ] `choose` is one call into the pure module, and every case above is pinned in-process; anything
      unreachable is marked hand-verified rather than claimed
- [ ] `useClipFilters.ts`'s header and `:49` describe the rule as implemented
- [ ] pytest, vitest and tsc are green; no Playwright spec added and the e2e stack not run
      (AGENTS.md → Verification)
