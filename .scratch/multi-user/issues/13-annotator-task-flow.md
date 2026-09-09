# 13 — Annotator task flow

**What to build:** a `/me` endpoint returning identity + capability payload (derived from roles and item state — the server is the single source of truth); a "My Tasks" list as the annotator's default page, showing only their own (Clip, Task type) items with state badges; in-item buttons rendered from capabilities — submit (Labeling) / recall (Submitted); a banner showing the reviewer's note when rejected; 409 on save prompts a refresh-and-retry; SWR invalidation wired to mutations.

**Blocked by:** 12.

Status: MERGING

- [ ] e2e: an annotator sees only their own items; another account's items are invisible either way
- [ ] e2e: label → submit (list state flips to Submitted) → recall (back to Labeling), end to end
- [ ] e2e: after a reject the banner shows the note; a 409 scenario (stale version via two open tabs) prompts and recovers
- [ ] compose seam: /me capability matrix asserted parametrically (role × state → each action true/false)
