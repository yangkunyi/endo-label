# 20 — Workflow push

**What to build:** an SSE/WS event channel: state changes (reject, pass, reassign, assign, review completed) publish events; the frontend task lists and boards subscribe and invalidate-refetch; automatic reconnect on drop; no list ever needs a manual refresh.

**Blocked by:** 14.

Status: BLOCKED

- [ ] compose seam: each transition class publishes its event, payload carrying the item identity and new state
- [ ] e2e: two browser contexts — A rejects, B's task list updates without a refresh
- [ ] state survives a dropped connection (on reconnect, a full invalidation-refetch as the fallback)
