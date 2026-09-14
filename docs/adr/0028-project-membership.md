# Project membership is an explicit stored relation and it gates assignment; config only seeds it

The pilot's desk was one labeler at a time; multi-user (ADR 0026) makes Projects plural, and an
Account who does not work on a study must not show up in that study's assignment pickers, nor be
handed its work by mistake. So the relation is stored — **Project membership**: the Accounts who may
be given work in a Project. It gates assignment and nothing else: `assign_item`, `auto_assign_items`
and `reassign_item` refuse a non-member with a 409 and a sentence naming the Project (`alice is not a
member of Project Pilot — add them first.`), the account pickers group by it, and it does **not** gate
reading labels. It is not a role flag on the Account; the same person is a member of one study and a
stranger to the next.

Membership is owned by the admin, not by the workflow. Adding or removing a member is a membership
write — the Projects page, or `add-member` from the CLI — and never a side effect of assigning or
unassigning work. Removing a member stops new assignments; it does not unassign, move, or delete
existing work, because membership is not a workflow state.

Config seeds, then gets out of the way. A Project's `members:` list is read once, when the Project is
first registered; after that the database owns the list. The config file is re-read on every boot, so
if it stayed the source of truth a membership edit made in the UI would silently revert at the next
restart — a UI that undoes itself is worse than no UI. For the same reason the table is seeded on
creation from the Accounts already holding an Assignment in that Project: an existing install (the
pilot) must stay assignable across the change, without anyone re-typing its members.

## Considered Options

- **Derive membership from assignment history** — rejected. It makes a hidden state change ride on a
  visible act: assigning one Clip would silently grant the whole Project, a Project could not have a
  member before its first Clip, and "get this person off the study" would mean unassigning all their
  work — a workflow write with label consequences, not a membership one. Intent could never be
  stated ahead of the work ("these three will do this study"), which is exactly what the pickers need.
- **Membership as a gate on reads** — rejected; the decision leaves reads where they are. Membership
  is about who may be *given* work.
- **Config as the source of truth, re-read every boot** — rejected; a UI edit must not be reverted by
  a restart. Config is an import path for a new Project, not the ongoing owner.
- **Membership as a role flag on the Account** — rejected; membership is per (Account, Project) pair,
  while roles are desk-wide capabilities.
- **Per-Task-type or per-Clip membership** — rejected as finer than the question asked; one
  study-level relation is enough to group the pickers and to refuse a stray assignment.

## Consequences

- Every assignment path checks membership — single assign, reassign, and auto-assign — so a non-member
  cannot slip in through the balanced path.
- The refusal reuses the refused-write sentence style: a 409 whose `detail` names the Project and the
  Account, not a bare status.
- `GET /api/projects` carries `members` to admins; the Projects page and the batch-assign bar read
  membership from that one source.
- A fresh install has a path that needs no browser: `add-member <project> <username>` beside
  `create-admin` / `create-project`.
- The backfill is one derived-to-explicit migration; after it, an install's membership is whatever the
  database says.
