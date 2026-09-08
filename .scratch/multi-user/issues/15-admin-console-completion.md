# 15 — Admin console completion

**What to build:** `/admin/users` (create account + temporary password, disable, edit role flags — admin-gated); `/admin/projects` screen (create project, edit hospital field); a "delivered" marker entry on board and lists (settable by admin/reviewer, with timestamp — consumption record-keeping); task list and board filtering by Project / Clip tags.

**Blocked by:** 09, 11.

**Status:** ready-for-agent

- [ ] compose seam: create/disable/role-edit API behavior (non-admin 403)
- [ ] compose seam: delivered flag and timestamp; project / tag filtered list queries correct
- [ ] e2e: admin creates an account → new user logs in and changes password → logs out; setting the delivered marker shows it on the row
