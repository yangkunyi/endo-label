# 21 — ClipDesk incremental decomposition

**What to build:** the 54K single-file ClipDesk decomposed panel by panel — player, timeline/Ruler, editor cards (Now/Library), mask panel, vocab library — into a composition shell plus panel components, behavior and pixels unchanged (a file restructure, not a redesign). Each extraction step is gated by compose / vitest / tsc, not Playwright. Starts after all desk-touching tickets (13/14/17/18/19) have landed, so nothing gets rebuilt mid-refactor.

**Blocked by:** 14, 17, 18, 19.

Status: BLOCKED

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] one sub-step per panel, each revertible (compose / vitest / tsc green before the next step)
- [ ] ClipDesk reduced to a composition shell, no longer holding panel-internal state
- [ ] all compose tests green; vitest and tsc green
