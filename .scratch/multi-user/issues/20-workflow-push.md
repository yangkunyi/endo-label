# 20 — Workflow push

**What to build:** an SSE/WS event channel: state changes (reject, pass, reassign, assign, review completed) publish events; the frontend task lists and boards subscribe and invalidate-refetch; automatic reconnect on drop; no list ever needs a manual refresh.

**Blocked by:** 14.

Status: BLOCKED

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: each transition class publishes its event, payload carrying the item identity and new state
- [ ] compose seam: a dropped subscriber reconnects with a full invalidation-refetch fallback
