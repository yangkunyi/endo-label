# multi-user/19 — Mask multi-user

**What to build:** SessionManager moves from "one per process" to keyed by (user, Clip): auto-opened on first mask action, kept across Clip switches, resumable on return; LRU caps of 2 per user / 8 global (config-driven, evicting the least recently used — same cost as a manual close today); a global inference lock around the inference entry point (hard constraint from predictor instance state); Predict waits synchronously on the lock with an "inferring…" hint and a 30-second timeout message; the mask write ownership check (same mechanism as 11); Propagate keeps its single-active-job + polling unchanged.

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam (fake backend): two users each open Sessions without conflict; the same user switching Clips keeps the old Session and resumes on return
- [ ] compose seam: after LRU eviction, the old Session responds as closed; caps are config-driven
- [ ] compose seam: concurrent Predicts serialize through the inference lock; the 30-second timeout path returns the agreed error under slow fake inference
- [ ] compose seam: mask writes by a non-assignee are refused
