# pilot-ux/23 — choose patches the selection in force, not a snapshot

**What to build:** the middle finding of the closeout review over `pilot-ux/19` — `choose` writes the value
some render happened to hold, so one pick during the `/api/me` window can permanently lose an admin's stored
`scope:"all"`.

`web/src/useClipFilters.ts:90-107`: `choose` closes over `filters` (the selection in force) and writes
`chooseClipFilters(filters, patch)` both to storage and to `stored`, with `filters` in its dependency list.
While `/api/me` is unanswered the resolution corrects nothing but asks with `mine` for `all`
(`web/src/clipFilters.ts:161-168`), so an admin who picks a Project in that window saves `scope: "mine"` over
the stored `all` and `notice` is `null` by then — no sentence, and the stored value is gone. That is the loss
the module promises not to commit: "An admin's own stored `all` is not the browser's to lose while `/api/me`
is in flight". The promise covers the read path only; `choose` walks around it. The same snapshot basis makes
two `choose` calls in one event lose the first patch, because the second still patches the selection its
closure was created with.

A change must be a function of the value in force at the moment it is applied: patch the raw stored selection
functionally, so only the field the reader touched is written while the Account is unknown and no later render
can lose or resurrect a value the reader did not choose. Keep the decision logic pure in
`web/src/clipFilters.ts` and pin it there.

Acceptance:

- [ ] an admin's stored `scope:"all"` survives a Project or tag pick made while `/api/me` is unanswered
- [ ] two `choose` calls in one event both land; the second does not patch a stale snapshot
- [ ] the docstring promise in `web/src/clipFilters.ts` holds for the write path, or the docstring says what
      the write path actually does
- [ ] vitest pins both cases in-process (no jsdom; `web/vite.config.ts` includes `src/**/*.test.ts`)
- [ ] no Playwright spec is added and the e2e stack is not run (AGENTS.md → Verification)
