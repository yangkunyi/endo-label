# 09 — Project membership

**What to build:** an explicit, admin-owned answer to "who works on this Project". Decided
(round 2, Q9=b): membership is a stored relation, **not** derived from assignment history, and it
gates assignment — the account pickers group by it and assigning a non-member is refused.

This introduces a domain term (**Project membership**) and therefore an ADR (11).

Code:
- `endo_label/coordination.py` — new table
  `project_members(project_id INTEGER REFERENCES projects(id), account_id INTEGER REFERENCES users(id), PRIMARY KEY (project_id, account_id))`
  in the same schema init that creates `projects`/`clips`. **Backfill on creation**: seed it from
  the Accounts that already hold an Assignment in that Project, so an existing install (the pilot)
  keeps working.
- Membership write surface, admin-only: `GET /api/admin/projects/{project_id}/members`,
  `PUT` (replace the list), `DELETE /api/admin/projects/{id}/members/{username}`; `GET
  /api/projects` carries `members` for admins so the pickers have one source. UI: the Projects page
  (`web/src/AdminProjects.tsx`) gains a member list with add/remove.
- Bootstrap without the UI: `python -m endo_label add-member <project> <username>` next to
  `create-admin` / `create-project` (see `endo_label/__main__.py`).
- Config: a Project's `members:` list **seeds** the table when the Project is first registered;
  after that the database owns membership (the admin UI/CLI is the only way to change it), so a UI
  edit is never silently reverted by a restart. State this in the ticket's implementation notes and
  the ADR.
- Gating: `assign_item` and `auto_assign_items` refuse a non-member with 409 and a sentence
  (`alice is not a member of Project Pilot — add them first.`); `reassign_item` too. Membership does
  not gate reading labels.

**Blocked by:** —

Status: ready-for-agent

- [ ] `project_members` exists, with a backfill that keeps an existing install assignable
- [ ] an admin can add and remove members from the Projects page
- [ ] `add-member` works from the CLI
- [ ] assigning a non-member is refused with a sentence naming the Project
- [ ] config `members:` seeds a new Project and never rewrites an existing one
- [ ] `GET /api/projects` exposes members to admins only
