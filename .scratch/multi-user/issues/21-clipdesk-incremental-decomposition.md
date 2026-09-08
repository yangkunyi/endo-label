# 21 — ClipDesk incremental decomposition

**What to build:** the 54K single-file ClipDesk decomposed panel by panel — player, timeline/Ruler, editor cards (Now/Library), mask panel, vocab library — into a composition shell plus panel components, behavior and pixels unchanged (a file restructure, not a redesign). **Each extraction step runs the full Playwright e2e suite; only a green run opens the next step.** Starts after all desk-touching tickets (13/14/17/18/19) have landed, so nothing gets rebuilt mid-refactor.

**Blocked by:** 14, 17, 18, 19.

**Status:** ready-for-agent

- [ ] one sub-step per panel, each with a green e2e record (every step individually revertible)
- [ ] ClipDesk reduced to a composition shell, no longer holding panel-internal state
- [ ] all compose and e2e tests green; UI appearance identical to before (proven by the e2e assertions)
