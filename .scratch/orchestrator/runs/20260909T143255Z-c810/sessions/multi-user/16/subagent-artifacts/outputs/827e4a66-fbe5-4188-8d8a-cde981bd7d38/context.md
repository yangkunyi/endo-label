# Code Context — ticket 16 vocab registry expansion

CWD: `/data3/yky/endo_label/worktrees/multi-user-16-vocab-registry-expand`

## 1. Git

- Status: clean (`nothing to commit, working tree clean`)
- Branch: `ticket/multi-user/16-vocab-registry-expand`
- HEAD: `4ed6689b1fa75d7bd7f9cf54425a44482e4aeae4` `orchestrator: multi-user/16 Status RUNNING`
- Recent 15 (oneline):
  - `4ed6689` orchestrator: multi-user/16 Status RUNNING
  - `56c73d5` orchestrator: multi-user/11 Status RUNNING
  - `238fd80` orchestrator: multi-user/16 Status READY
  - `01134e7` orchestrator: multi-user/11 Status READY
  - `79c7857` tickets: Playwright closeout is multi-user/22 after 15/20/21
  - `3f901d3` build: uv lock, all Python deps required
  - `3c1f2a1` orchestrator: multi-user/10 Status MERGED
  - `200029a` orchestrator: merge ticket/multi-user/10-project-and-clip-registration
  - `f42f707` feat: register Projects and Clips in the coordination DB
  - `293b2d9` pytest: pythonpath = ["."] so worktrees import this tree
  - `7247b96` orchestrator: multi-user/10 Status RUNNING
  - `63cb5ef` orchestrator: multi-user/10 Status READY
  - `4447764` chore(orchestrator): httpProxy clash 127.0.0.1:23379
  - `491a06e` orchestrator: multi-user/10 Status FAILED
  - `7d8ed58` orchestrator: multi-user/10 Status RUNNING

## 2. `.scratch/multi-user/issues/` (exact names)

01-vocab-taxonomy-research.md through 22-playwright-closeout.md:

`01-vocab-taxonomy-research.md`, `02-vocab-model-decision.md`, `03-assignment-model.md`, `04-review-workflow.md`, `05-storage-concurrency.md`, `06-auth-implementation.md`, `07-sam-gpu-contention.md`, `08-admin-reviewer-ui.md`, `09-coordination-db-and-login.md`, `10-project-and-clip-registration.md`, `11-assignment-ownership-and-board.md`, `12-state-machine-and-auto-assign.md`, `13-annotator-task-flow.md`, `14-review-flow.md`, `15-admin-console-completion.md`, `16-vocab-registry-expand.md`, `17-label-id-contract.md`, `18-desk-vocab-integration.md`, `19-mask-multi-user.md`, `20-workflow-push.md`, `21-clipdesk-incremental-decomposition.md`, `22-playwright-closeout.md`

## 3. `docs/adr/`

0001–0027 including `0026-vocab-registry-project-enablement.md`, `0027-sqlite-coordination-files-payloads.md`. Full list in scout listing (27 files).

## 4. DB schema / sqlite

No checked-in `.sqlite`/`.sql` files. Coordination DB path: `settings.coordination_db` or `settings.labels_root.parent / "coordination.sqlite"` (`endo_label/coordination.py` `db_path`).

Tables in `_init_schema` (`coordination.py` ~82–109):

- `users` (id, username UNIQUE NOCASE, password_hash, admin, reviewer, annotator, disabled) — 0/1 CHECKs
- `login_sessions` (id TEXT PK, user_id FK users, created_at)
- `projects` (id, name UNIQUE, hospital DEFAULT '')
- `clips` (id TEXT PK, project_id FK projects, kind, path)

WAL + `foreign_keys=ON` + `busy_timeout=5000`. **No vocab/registry/enablement/candidate tables.**

Types:

```python
@dataclass(frozen=True)
class Account: id, username, admin, reviewer, annotator, disabled
@dataclass(frozen=True)
class Project: id, name, hospital
@dataclass(frozen=True)
class RegisteredClip: id, project_id, kind, path: Path
```

## 5. Existing vocab API (`endo_label/vocab_router.py`)

`make_router(settings: Settings) -> APIRouter`

| method | URL | function |
|---|---|---|
| GET | `/api/vocab` | `get_vocab` |
| POST | `/api/vocab/triples` | `add_triple` |
| DELETE | `/api/vocab/triples` | `delete_triple` |
| POST | `/api/vocab/triples/rename` | `rename_triple` |
| POST | `/api/vocab/{list_name}` | `add_name` (`list_name` in `phases`, `class_tags`) |
| POST | `/api/vocab/{list_name}/rename` | `rename_name` |
| DELETE | `/api/vocab/{list_name}/{name}` | `delete_name` |

Bodies: `VocabAddBody`, `VocabRenameBody` (`from`/`to`), `VocabTripleBody`, `VocabTripleRenameBody`. Persistence: `labels_store.load_vocab` / `save_vocab` / rename-delete rewrite JSON files. **No admin gate.**

Frontend helpers: `web/src/api.ts` `vocabPath`, `vocabListPath`, `vocabRenamePath`, `vocabDeletePath`, `vocabTriplesPath`, `vocabTripleRenamePath`, `vocabTripleDeletePath`.

## 6. Auth / admin-only write / 403

**No FastAPI `Depends` role gate and no 403 in Python today.** Auth is middleware-only:

- `install_auth`: cookie `session_id`; unauthenticated `/api/*` (except health/login/logout) → **401**
- `/api/me` returns `{username, roles: {admin, reviewer, annotator}}`
- Ticket **02** policy (spec, not code): registry writes **admin-only**; reviewers enable/candidates; annotators use enabled + create candidates
- Ticket **15** (BLOCKED) is the first ticket that explicitly wants compose `non-admin 403` for user/project admin APIs — those routes do not exist yet
- Ticket **16** must introduce 403 on `/api/registry` writes for non-admin

## 7. Project API / tables

- Router: `endo_label/projects_router.py` — `get_projects(request) -> {"projects": projects_payload(...)}` **GET `/api/projects` only** (no POST)
- Helpers: `create_project`, `get_project_by_name`, `get_or_create_project`, `list_projects`, `list_registered_clips`, `projects_payload`, `register_clip`, `apply_config_registrations`
- Payload item: `{id, name, hospital, clips: [{id, kind}, ...]}`
- Tests: `tests/test_projects.py`

## 8. Frontend routes

`web/src/App.tsx`: `/login`, `/`, `/clips/:clipId` inside `AppShell`. **No `/admin/*`.** Vocab UI is inline in `ClipDesk.tsx` (desk-wide lists, not registry).

`web/src/`: App, AppShell, ClipDesk, ClipList, Login, MaskOverlay, deskStore, api, tests; `components/ui/` button, combobox, input, video-player; `lib/utils.ts`.

## 9. `tests/test_compose.py` vocab-related `def test_` names

`test_vocab_add`, `test_fresh_vocab_lists_are_empty`, `test_missing_vocab_list_keys_are_empty_not_old_seeds`, `test_existing_vocab_json_is_not_wiped_on_startup`, `test_class_tag_grasper_is_not_triplet_instrument_grasper`, `test_unknown_phase_name_is_rejected`, `test_added_phase_name_can_be_painted`, `test_add_phase_name_rejects_blank_and_duplicate`, `test_unknown_class_name_is_rejected`, `test_class_span_rejects_bad_range_or_vocab_without_partial_change`, `test_added_class_name_can_be_toggled`, `test_add_class_name_rejects_blank_and_duplicate`, `test_unknown_triplet_names_are_rejected`, `test_added_triplet_names_can_be_used_in_a_row`, `test_add_triplet_name_rejects_blank_and_duplicate`, `test_phase_rename_*`, `test_class_tag_rename_*`, `test_triplet_list_rename_is_rejected_and_leaves_rows`, `test_triplet_cell_rename_*`, `test_phase_delete_*`, `test_class_tag_delete_*`, `test_vocab_triple_delete_*`, `test_vocab_delete_unknown_name_is_rejected`, `test_existing_vocab_json_seed_is_removed_only_by_delete`, `test_vocab_triple_migrate_*`, `test_cartesian_combo_not_in_table_is_rejected`, `test_plus_triple_does_not_write_this_frame`, `test_vocab_triple_rename_restores_clips_on_half_failure`.

Ticket 16: **existing vocab endpoints and `test_compose` must stay green** (legacy string vocab).

## 10. Registry tables / stubs

- Schema: none
- HTTP: **no `/api/registry` implementation** — only mentioned in `.scratch/multi-user/spec.md` and issue 16
- Mask `annotations.py` “Track registry” is unrelated
- ADR 0026 + CONTEXT.md describe intended model: stable id, display name, archived; per-Project enablement + candidates

## 11. Package layout

`endo_label/`: `__init__.py`, `__main__.py`, `app.py`, `auth.py`, `catalog.py`, `config.py`, `coordination.py`, `labels_store.py`, `projects_router.py`, `vocab_router.py`, `frame_class/`, `mask/`, `phase/`, `triplet/`

`web/src/`: as above; `components/ui/` one extra level.

## 12. How tests run

`pyproject.toml`:

```
[tool.pytest.ini_options]
pythonpath = ["."]
```

No `pytest.ini`. Run from worktree: `pytest` (deps include pytest, httpx). Do **not** run Playwright e2e (ticket 22).

## 13. Ticket 10 (blocker) — MERGED

File: `.scratch/multi-user/issues/10-project-and-clip-registration.md`

Built: projects table, clip registration, CLI/config batch, GET `/api/projects`, catalog from DB. Compose seams checked; e2e “open desk” still unchecked. Git: `3c1f2a1` MERGED, `f42f707` feat.

## 14. Sibling tickets 15 / 17 / 18

- **15** Admin console — BLOCKED (09, 11). `/admin/users`, `/admin/projects`; non-admin 403. Not vocab.
- **16** Vocab registry expand — RUNNING. Blocked by 10 (now merged). DB registry + `/api/registry` + `/admin/vocab` three panes. **Does not change label content or picker.**
- **17** Label id contract — BLOCKED by **16**. Strings → registry ids; rewrite transactions deleted.
- **18** Desk vocab integration — BLOCKED by 13, 17. Picker = enabled + candidates.

## 15. `tests/sitting_http.py`

- `ADMIN_USERNAME="admin"`, `ADMIN_PASSWORD="secret"`
- `seed_admin(settings)` → `create_account(..., admin=True, password_hash=...)`
- `ensure_registered` → default Project `"Test"` + `register_clip` for yaml clips/allowlist
- `login(client)` POST `/api/auth/login` assert 200 (sets cookie)
- `authed_client(settings, web_dist=None)` seed + register + `TestClient(create_app)` + login

`test_compose` `client` fixture uses `authed_client`. No non-admin helper yet — 403 tests need a second `create_account(admin=False)` + login.

## 16. `/api/registry`

**Does not exist** in Python or TS. Spec contract: CRUD, enablement, candidates, promote, archive; writes admin-only.

## Architecture (how pieces connect)

`create_app` (`app.py`): mask app → `install_auth` → routers: auth, projects, phase, class, triplet, vocab. Vocab is desk-wide JSON via `labels_store`, not SQLite. Coordination SQLite owns users/sessions/projects/clips only. Frontend is SPA ClipDesk; admin vocab screen is net-new.

## Start Here

1. `.scratch/multi-user/issues/16-vocab-registry-expand.md` + ADR `docs/adr/0026-vocab-registry-project-enablement.md`
2. Extend `endo_label/coordination.py` `_init_schema` (new tables)
3. New router analogous to `projects_router.py`, include in `app.py`
4. Gate writes with `request.state.account.admin` → 403
5. New React route `/admin/vocab` (App.tsx currently has no admin)
6. Keep `vocab_router.py` + `test_compose.py` untouched in behavior

## Constraints / risks / open questions

- Ticket 02: reviewers manage project enable/candidates; ticket 16 text says writes admin-only “per ticket 02” — implementers should split: global registry + promote = admin 403; enable/candidate may be reviewer+ (spec line 70). Ambiguous vs ticket 16 bullet “non-admin writes 403” (all writes?). Product decision if needed.
- Zero-breakage: do not migrate label files (ticket 17).
- No existing 403 pattern to copy; invent `require_admin` from `request.state.account`.
- `apply_config_registrations` / `get_or_create_project` already exist for seeding.

## Files Retrieved

1. `endo_label/vocab_router.py` (1–154) — current vocab HTTP
2. `endo_label/auth.py` (1–90) — session middleware, 401 not 403
3. `endo_label/coordination.py` (1–410) — schema + Project/Clip APIs
4. `endo_label/projects_router.py` (1–14) — GET /api/projects
5. `endo_label/app.py` (1–75) — router mount
6. `tests/sitting_http.py` (1–85) — authed_client
7. `web/src/App.tsx` (1–20) — no admin routes
8. `pyproject.toml` pytest pythonpath
9. issues 10, 15, 16, 17, 18; ADR 0026
