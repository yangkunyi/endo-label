# Project membership is an explicit stored relation and it gates assignment for the annotator and the reviewer alike; config only seeds what it states

The pilot's desk was one labeler at a time; multi-user (ADR 0026) makes Projects plural, and an
Account who does not work on a study must not show up in that study's assignment pickers, nor be
handed its work by mistake. So the relation is stored — **Project membership**: the Accounts who may
be given work in a Project, as its annotator or as its reviewer. It gates assignment and nothing else:
`assign_item`, `auto_assign_items`, `reassign_item` and `assign_reviewer` refuse a non-member with a
409 and a sentence naming the Project (`alice is not a member of Project Pilot — add them first.`),
the account pickers group by it, and it does **not** gate reading labels. Reviewing is work on the
Project, so the reviewer is gated the same way as the annotator: an Account who may not be given this
Project's work may not be given its review either. It is not a role flag on the Account; the same
person is a member of one study and a stranger to the next.

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

A Clip's tags follow the same rule one table over: **a registration states a Clip's tags only when it
was given some.** A registration *is* given tags by a config Clip entry whose `tags:` holds a list —
an explicitly empty `tags: []` included — or by one or more `--tag` on `register-clip`; that list is
then the Clip's tags in full, rewritten on every boot, so a tag dropped from it leaves the store and
its filters. A registration given no tag list at all — `tags:` absent (or left bare, which is the same
null value), a `tags:` naming no tag (an empty string), no `--tag` — says nothing about tags and leaves
`clip_tags` as it stands, so the next `create_app` does not undo `PUT /api/clips/{clip_id}/tags`. The
list is what states a Clip's tags in itself; the comma-separated string form is a convenience that
states the tags it names, so a blank one states nothing rather than stating an empty list. Empty
*entries* inside a stated list name no tag either, which is why the CLI clears a Clip with
`--tag ''`. Two writers over one table is fine as long as the weaker one only speaks when spoken to.

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
- **Config as the ongoing owner of a Clip's tags** — rejected; it is the same loss one table over,
  and a Clip entry that names tags only for its first registration would have to say so. A stated
  `tags:` is therefore a full statement, re-applied every boot, while a registration that states none
  has no say at all.
- **Membership as a role flag on the Account** — rejected; membership is per (Account, Project) pair,
  while roles are desk-wide capabilities.
- **Per-Task-type or per-Clip membership** — rejected as finer than the question asked; one
  study-level relation is enough to group the pickers and to refuse a stray assignment.

## Consequences

- Every path that hands work to an Account checks membership — assign, reassign, auto-assign, and
  reviewer assignment, single or batch — so a non-member cannot slip in through the balanced path or
  the review route.
- The refusal reuses the refused-write sentence style: a 409 whose `detail` names the Project and the
  Account, not a bare status.
- `GET /api/projects` carries `members` to admins; the Projects page and the batch-assign bar read
  membership from that one source.
- A fresh install has a path that needs no browser: `add-member <project> <username>` beside
  `create-admin` / `create-project`.
- The backfill is one derived-to-explicit migration; after it, an install's membership is whatever the
  database says.
- `clip_tags` has two writers — the config/CLI registration and `PUT /api/clips/{clip_id}/tags` — and
  the registration one keeps its hands off a Clip whose entry states no `tags:`.
