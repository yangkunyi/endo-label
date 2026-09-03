# 03 — Double-click a Vocab triple cell rewrites desk-wide; collision refuses

**What to build:** Double-click one cell of a Vocab triple to change that word. Every matching triplet row on every Clip rewrites to the new exact triple. If any Frame would then hold two identical triples, the request is refused and Frames are unchanged. Empty or duplicate names rejected. Playwright: happy rename and a collision that stays put.

**Blocked by:** 02 — Triplet Vocab is the table of exact triples

**Status:** ready-for-agent

- [ ] Double-click a cell rewrites that Vocab triple on every Clip
- [ ] A rename that would duplicate an exact triple on a Frame is refused
- [ ] Refused rename leaves Frames unchanged
- [ ] Playwright and compose cover success and collision
