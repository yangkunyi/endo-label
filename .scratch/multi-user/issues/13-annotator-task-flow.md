# 13 — Annotator task flow

**What to build:** a `/me` endpoint returning identity + capability payload (derived from roles and item state — the server is the single source of truth); a "My Tasks" list as the annotator's default page, showing only their own (Clip, Task type) items with state badges; in-item buttons rendered from capabilities — submit (Labeling) / recall (Submitted); a banner showing the reviewer's note when rejected; 409 on save prompts a refresh-and-retry; SWR invalidation wired to mutations.

**Blocked by:** 12.

Status: BLOCKED

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: /me capability matrix asserted parametrically (role × state → each action true/false)
- [ ] compose seam: annotator list is own items only; submit Labeling → Submitted; recall Submitted → Labeling; reject stores the note for the assignee; 409 on stale version then succeeds with the fresh version
