# 16 — Vocab registry (expand)

**What to build:** the registry in the DB (stable id, display name, archived flag) + per-Project enablement/candidate tables; `/api/registry` (create / rename / archive / enable-disable / candidate create-edit / promote to global — writes admin-only, per ticket 02); the `/admin/vocab` screen with three areas: registry browse, per-Project enable matrix, candidate promotion queue. **This ticket touches neither label content nor the existing picker** — the legacy string vocab keeps working; pure expansion, zero breakage.

**Blocked by:** 10.

Status: MERGED

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: registry CRUD; non-admin writes 403; archive/restore reversible; promoting a candidate turns it into a global id
- [ ] compose seam: the enable matrix decides each Project's visible set
- [ ] existing vocab endpoints and `test_compose` fully green (zero-breakage proof)
