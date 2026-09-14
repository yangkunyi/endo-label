# pilot-ux/09 — Project membership: implementation notes

The issue body (`issues/09-project-membership.md`) is frozen; this file is the working record it
asks for ("state this in the ticket's implementation notes and the ADR"). The ADR itself is
`docs/adr/0028-project-membership.md`, which `issues/11-domain-docs.md` owns — it was not written
here so two tickets in flight never write one file. The paragraph that ADR has to carry is below.

## What landed

- `endo_label/coordination.py`
  - New table `project_members(project_id, account_id, PRIMARY KEY (project_id, account_id))`,
    in the same `_create_schema` script that creates `projects`/`clips`. The DDL is one constant
    (`_PROJECT_MEMBERS_DDL`) used by both the bootstrap and the migration, so the two paths cannot
    drift.
  - `_ensure_project_members` is a connect-time migration in the `_ensure_clip_version_column`
    style. An install that predates the table gets it created there and **backfilled** from the
    Accounts already holding an Assignment in each Project (`assignments.assignee_id` joined to
    `clips.project_id`); a fresh database seeds nothing. `project_members` is deliberately *not* in
    `_SCHEMA_TABLES`, so an existing install never re-runs the full bootstrap on every request.
  - Membership CRUD (`list_project_members`, `set_project_members`, `add_project_member`,
    `remove_project_member`), all transactional; a replace validates every username before it
    writes, so one unknown Account refuses the whole list rather than half-applying it.
  - Gating: `NotAProjectMember`, raised by `assign_item`, `reassign_item` and `auto_assign_items`
    (`_refuse_non_members` — every assignee must be a member of every Project in the selection,
    and auto-assign writes nothing when it refuses). Reviewer assignment is not gated (the issue
    names assignment of work only), and reading labels stays open to every Account.
  - `projects_payload(..., include_members=False)`.
- `endo_label/admin_router.py` — `GET`/`PUT /api/admin/projects/{id}/members`,
  `DELETE /api/admin/projects/{id}/members/{username}`, admin-only (`PUT` replaces the list).
  Deleting an Account that is not a member is a no-op, not a 404; an unknown Project is a 404.
- `endo_label/projects_router.py` — `GET /api/projects` carries `members` for admins and omits the
  key for everyone else: one source for the pickers (ticket 10's batch assign bar).
- `endo_label/items_router.py` — a membership refusal is the one 409 that keeps its sentence
  (`{"detail": "alice is not a member of Project Pilot — add them first."}`); other 409s stay
  `"Conflict"`.
- `endo_label/__main__.py` — `python -m endo_label add-member <project> <username> [--config PATH]`,
  next to `create-admin` / `create-project` / `register-clip`; exit 1 with `Project not found: …` /
  `Account not found: …`.
- `endo_label/config.py` — `ProjectSpec.members` parses `members:` (list, or one comma-separated
  string); `apply_config_registrations` passes it to `get_or_create_project`.
- `web/src/api.ts`, `web/src/AdminProjects.tsx` — `ProjectRow.members`, the two admin member paths,
  and a member list with an add form and a Remove per member on the Projects page.

## The decision the ADR has to state (config seeds once, the database owns it afterwards)

> A Project's `members:` list seeds the table **when the Project is first registered** and never
> again. Membership after that is the database's: the Projects page and `add-member` are the only
> ways to change it. This is what keeps a UI edit from being silently reverted by a restart —
> re-reading `members:` on every boot would resurrect anyone the admin removed, and disable anyone
> the admin added.

Two mechanics that follow from it:

1. **Seeding cannot create an Account**, and at first start the config's Projects are registered
   before the admin has any Account to name, so a username that does not exist yet is *skipped*
   (the server still starts — otherwise a config typo would make the console unreachable, and the
   console is how the Account gets created). `add-member` and the Projects page are how such an
   Account joins later. `tests/test_project_members.py::test_config_members_naming_an_account_that_does_not_exist_yet_starts_anyway`
   pins that.
2. **Membership is not backfilled from `members:` for an existing Project.** The one backfill there
   is runs on the table's *first* creation, from Assignment history, and only for the Accounts that
   were already holding work.

## Verification

- `pytest tests` — 211 passed, 1 skipped (baseline before this issue: 200 passed, 1 skipped).
  New: `tests/test_project_members.py` (11 tests: the refusal sentence for assign/reassign/
  auto-assign, admin-only member surfaces, membership does not gate reading, the upgrade backfill,
  config seeds-once, `add-member` CLI). Existing suites needed membership seeded in their fixtures
  (`tests/sitting_http.py::ensure_members`, called from seven fixture functions) and `members: []`
  in two `/api/projects` payload assertions in `tests/test_projects.py`.
- Upgrade on the real pilot store: a copy of `/data3/yky/endo_label/data/coordination.sqlite`
  comes back from `connect()` with `project_members` created, `Project Pilot → ['boss']` seeded from
  the one Assignment `boss` was holding, and `CASE001_step06_clip002` still assignable and
  reassignable to `boss`.
- Live sitting smoke (`uvicorn` on `:7899`, throwaway config, fake backends):
  `GET /api/projects` (admin) → `members: []`; `PUT …/members {"members": ["alice"]}` → 200;
  `POST /api/items/CLIPA/phase/assign {"assignee": "alice"}` → 200; the same for a non-member →
  409 `"bob is not a member of Project Pilot — add them first."`; `PUT` with an unknown Account →
  404 and the list unchanged; `DELETE …/members/alice` → 200 (twice, idempotent); non-admin sees
  `/api/projects` without the key, `403` on the admin route, and still reads `/api/phase/CLIPA`.
- `web/`: `tsc -b --noEmit` clean, `vitest run` 104 passed, `vite build` clean, and the served
  SPA bundle carries the new member UI.
- e2e: `web/e2e/harness.ts` gains `ensureMember` (called by `ensureAccount`, `assign` and
  `ensureLabelingFor`), because every e2e Account is created *after* the server registered Project
  `E2E` and nothing seeds it. **Playwright was not run** — no browsers are installed on this
  machine (`~/.cache/ms-playwright` is empty).
- `web/dist` was built for the smoke test and deleted again: with a build present,
  `tests/test_mask_session.py::test_empty_undo_is_200_noop_and_there_is_no_redo` fails (405, not
  404, for `POST /api/session/redo` — the SPA catch-all route matches the path). That happens on
  the pre-change tree too (verified by stashing this work), so it is pre-existing and untouched
  here; the built desk just has to be absent for the pytest suite to be green.

## Leftovers, deliberately out of this issue

- `coordination._account_name` (ticket 04) queries a table called `accounts`, which this schema
  never creates — its table is `users` — so the `except sqlite3.OperationalError` fallback always
  fires and `_write_refusal` never names the holder. Found while in this file; not touched here.
- The pickers are ticket 10's (batch assign bar, D12) — this issue only supplies `members` in
  `GET /api/projects`. Until then the board's free-text assign input reaches the 409 sentence.
- The Projects page member list has no automated test: there is no Playwright spec for
  `/admin/projects` yet, and the machine cannot run one (see above).
