# pilot-ux/17 — The correction must stick

**What to build:** the surviving finding of the closeout review on `pilot-ux/13` — the correction of a
stored Clip filter is written to `localStorage` but never to the state the surface renders from.

`web/src/useClipFilters.ts:69-73` persists the corrected selection with `safeSet` only, so `stored`
keeps the uncorrected value. Two consequences, both visible to a non-admin whose browser holds
`scope=all`: `scopeDropped` stays true for the whole session, so the `role="status"` sentence never
clears; and `choose` (`web/src/useClipFilters.ts:75-81`) patches that uncorrected `stored`, so a value
the correction had just dropped is resurrected and written back to storage
(`web/src/clipFilters.ts:152-159`). Related contract point from the same review:
`resolveClipFilters`' docstring promises that an unknown caller corrects nothing, but only the scope is
gated on `known` (`web/src/clipFilters.ts:150-156`) — project and tag are corrected regardless.

One source of truth is the fix: the corrected selection is what state holds and what storage gets, and
every later interaction (`choose`, the scope toggle, the project/tag picks) is a pure function of that
corrected selection, so nothing can resurrect a dropped value. Keep the decision logic pure in
`clipFilters.ts` — the module already carries the tests — and let the module's contract say what the
code does for every field, with the surfaces' comments following it.

Acceptance:

- [ ] a non-admin whose browser holds `scope=all` is told once; the sentence clears and does not return on the next read of the corrected value
- [ ] after the correction, selecting anything again cannot write the dropped value back to storage
- [ ] vitest pins the resurrection case and the unknown-caller contract for scope, project and tag
- [ ] the `resolveClipFilters` docstring matches the code, field by field
