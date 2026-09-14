# 08 — Clips: scope and filters

**What to build:** the Clips page must answer "what is mine", and an Account must not be shown
work that is not theirs. Trial feedback: "给 CLIPS 那里加个过滤，project 和 tag，然后管理员再额外多
一个看 assign 给自己的和所有的…确保普通用户只能看到自己被 assign 的部分".

Decided: non-admin Accounts see only Clips where they hold an Assignment, **enforced server-side**
(no client-side hiding, no switch); admins default to "assigned to me" with a toggle for all.
"mine" = the Account is the item's assignee **or** its reviewer, in any state.

Code:
- `endo_label/catalog.py` — `list_clips(settings, project=, tag=, account_id=, scope=)`; the
  account filter joins `assignments` on `clip_id` and matches `assignee_id` or `reviewer_id`.
- `endo_label/mask/http.py` `GET /api/clips` — gains `scope` and needs the request's Account
  (`install_auth` already sets `request.state.account`): `scope=all` is refused for a non-admin
  (403), and any other value or an omitted one means `mine`. Keep `project=` / `tag=` as they are
  (both already implemented, `catalog.list_clips`).
- `web/src/api.ts` — `clipsPath({project, tag, scope})` (the function exists but is unused today);
  `web/src/ClipList.tsx` — project select (from `/api/projects`) + tag select (from `/api/tags`) +
  the admin-only scope toggle, the choice kept in `localStorage`.
- Empty states: `No Clips assigned to you.` for `mine`; the existing allowlist sentence for `all`.
- The desk's Clip rail reads `/api/clips` too: it must go through the same scope so the rail and
  the page agree.

**Blocked by:** —

Status: ready-for-agent

- [ ] a non-admin's `/api/clips` returns only Clips they hold an Assignment on
- [ ] a non-admin asking for `scope=all` is refused (403), not silently filtered
- [ ] an admin sees `assigned to me` by default and can switch to all; the choice survives a reload
- [ ] project and tag filters narrow the list and combine
- [ ] the Clip rail matches the filtered list
- [ ] a 403 in the rail or page shows the sentence, not a bare status
