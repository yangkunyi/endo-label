# Code Context — ticket 10 Project and Clip registration

Worktree: `/data3/yky/endo_label/worktrees/multi-user-10-project-and-clip-registration`
Branch: `ticket/multi-user/10-project-and-clip-registration` (clean)
Ticket 09 **is on this branch** (`28ab11e` / merge `c0b15a8` are ancestors of HEAD).

No Project/Clip DB tables, no `/api/projects`, no registration CLI yet. Catalog still YAML `clips` / `clip_allowlist`.

---

## 1. Directory layout

Top-level:
```
.git/ .gitignore .scratch/ AGENTS.md CONTEXT.md docs/ endo_label/ pyproject.toml README.md tests/ web/
```

`endo_label/`:
```
__init__.py __main__.py app.py auth.py catalog.py config.py coordination.py
frame_class/ labels_store.py mask/ phase/ triplet/ vocab_router.py
```

`tests/`:
```
fixtures/tiny.mp4
sitting_http.py
test_auth.py test_compose.py test_mask_session.py
test_sitting_config.py test_sitting_desk.py test_transcode.py
```

`.scratch/multi-user/issues/` — 21 markdown files `01`–`21` (list below).

`docs/adr/` — `0001`–`0027`. `docs/agents/` also present.

`web/` — Vite desk, Playwright `web/e2e/`.

---

## 2. Issue files (full / compressed)

### 09 — Coordination DB and login — **MERGED** (full)

**What to build:** SQLite (WAL); Account (username + password argon2id, stackable admin/reviewer/annotator); session cookie httponly + samesite=lax, `secure` config flag off localhost; CLI bootstrap admin + temp password; frontend `/login` + app-shell identity/logout; unauth pages → `/login`.

Blocked by: none.

Checkboxes all `[x]`: 401 without session; login cookie; wrong password 401; disabled refused + next request 401; role flags R/W; e2e login/desk/logout; WAL + busy_timeout two clients.

**Answer:** SQLite WAL + `busy_timeout=5000` at `labels_root.parent / coordination.sqlite` (override `coordination_db`). Users table: username, argon2id (`pwdlib`), flags, disabled. Login sessions; cookie `session_id`. Public: `/api/health`, `/api/auth/login`, `/api/auth/logout`. CLI: `python -m endo_label create-admin NAME [--password] [--config]`.

### 10 — Project and Clip registration — **RUNNING** (full)

**What to build:** projects table (name + hospital); Clips registered in DB, each exactly one Project; CLI/config batch registration (no UI — screen in 15); same source media in two Projects = two independent Clip ids (labels/assignments/states separate; media shared read-only); catalog serves Clip directory from DB, **retire clips list in config.yaml**; **GET /api/projects**.

Blocked by: 09.

- [ ] compose: create project + register media → `/api/projects` + Clip directory
- [ ] compose: same media two Projects → two Clip ids, independently openable
- [ ] compose: unregistered media not in directory (registration replaces allowlist)
- [ ] e2e: registered Clips open and label in existing desk

### 15 — Admin console completion — **BLOCKED** (09, 11)

`/admin/users` (create/disable/roles, admin-gated); `/admin/projects` (create, edit hospital); delivered marker on board/lists; filter by Project/Clip tags.

### Remaining issues (verbatim What-to-build)

| # | Status | Blocked | What |
|---|--------|---------|------|
| 01 | resolved research | — | vocab taxonomy research |
| 02 | resolved grilling | 01 | hybrid registry + per-Project enablement |
| 03 | resolved | — | assign unit = (Clip, Task type); annotator sees own items |
| 04 | resolved | 03 | Unassigned→Labeling→Submitted→Reviewing→Done |
| 05 | resolved | — | SQLite coordination, files payloads, optimistic version |
| 06 | resolved | 05 | session cookie + argon2 + Depends; CLI create-admin |
| 07 | resolved | — | SAM GPU contention (later 19) |
| 08 | resolved | 03,04 | admin/reviewer/annotator UI scope |
| 11 | BLOCKED | **10** | assignments table, write gates, board v1 |
| 12 | BLOCKED | 11 | full state machine + auto-assign |
| 13 | BLOCKED | 12 | annotator My Tasks /me capabilities |
| 14 | BLOCKED | 12,13 | review flow |
| 16 | BLOCKED | **10** | vocab registry in DB + `/api/registry` |
| 17 | BLOCKED | 16 | label id contract |
| 18 | BLOCKED | 13,17 | desk vocab picker |
| 19 | BLOCKED | 11 | mask multi-user sessions |
| 20 | BLOCKED | 14 | SSE/WS workflow push |
| 21 | BLOCKED | 14,17–19 | ClipDesk decomposition |

Related: 11/16 blocked on 10. Spec `.scratch/multi-user/spec.md` lists tables: users, sessions, **projects (name + hospital)**, **clips (one Project; replaces config clips)**.

---

## 3. How clips work now

### Config (`endo_label/config.py`)

- `ClipEntry`: `id`, `kind` (`jpeg`|`video`), `path`
- `Settings.clips: tuple[ClipEntry, ...]` plus legacy `clip_allowlist` + `frames_root`
- `load_settings()` YAML: if `clips:` list present, ids become allowlist; else `clip_allowlist` + `frames_root/<id>`
- `coordination_db`, `session_cookie_secure` already parsed

### Catalog (`endo_label/catalog.py`)

Public:
- `clip_entries(settings)` — YAML clips or allowlist dirs (lines 38–44)
- `list_clips` / `clip_meta` / `list_frames` / `frame_path` / `media_path` / `ensure_transcoded` / `video_path` / `video_clock`
- JPEG 25 fps; video from mp4 boxes

`clip_entries`:
```python
def clip_entries(settings: Settings) -> tuple[ClipEntry, ...]:
    if settings.clips:
        return settings.clips
    return tuple(
        ClipEntry(id=clip_id, kind="jpeg", path=settings.frames_root / clip_id)
        for clip_id in settings.clip_allowlist
    )
```

HTTP in `endo_label/mask/http.py` 140–175:
- `GET /api/clips` → `{"clips": catalog.list_clips(cfg)}`
- `GET /api/clips/{clip_id}` meta
- `GET /api/clips/{clip_id}/frames/{frame_index}` JPEG
- `GET /api/clips/{clip_id}/media` mp4

Compose tests `tests/test_compose.py`: `_sitting()` builds dirs + allowlist; `HIDDENCLIP` proves allowlist; YAML `clips:` skip missing/unknown kind.

E2E `web/e2e/config.yaml` still YAML clips CLIP_E2E / CLIP_E2E_B / CLIP_VID.

**Ticket 10 change:** `list_clips` should read DB-registered Clips, not YAML. Same media two projects → two ids.

---

## 4. Ticket 09 DB / auth (present)

**No Alembic.** Schema in `coordination._init_schema` (`endo_label/coordination.py` 52–70):

```sql
users (id PK, username UNIQUE NOCASE, password_hash, admin/reviewer/annotator/disabled 0|1)
login_sessions (id TEXT PK, user_id FK users, created_at)
```

WAL + `busy_timeout=5000` + `foreign_keys=ON` in `connect()`.

`db_path(settings)` → `coordination_db` or `labels_root.parent / "coordination.sqlite"`.

Public funcs: `create_account`, `set_roles`, `set_disabled`, `authenticate`, `create_session`, `delete_session`, `account_for_session`, `hash_password`. Types: `Account`, `AccountExists`.

HTTP `endo_label/auth.py`: middleware 401 all `/api/*` except public three; `POST /api/auth/login|logout`, `GET /api/me`. Cookie `session_id`.

Compose tests: `tests/test_auth.py` (401, cookie flags, disabled, roles, WAL threads, create-admin CLI). Helper `tests/sitting_http.py`: `seed_admin` / `login` / `authed_client`.

---

## 5. Compose-seam test patterns

Live under `tests/` pytest + `TestClient(create_app(Settings(...)))`.

- Inject `Settings` in memory; optional YAML `load_settings(tmp yaml)`.
- Auth: `authed_client(settings)` seeds admin `admin`/`secret`.
- Naming: `test_compose.py` catalog+labels; `test_auth.py` 09 seams; `test_mask_session.py`; `test_sitting_config.py`; `test_transcode.py`; `test_sitting_desk.py`.
- App start: no real uvicorn except CLI test `main(["create-admin", ...])`.
- Fixtures: tmp_path JPEG dirs; `tests/fixtures/tiny.mp4`.

Ticket 10 wants new compose cases in same style (project create + register → `/api/projects` + `/api/clips`).

---

## 6. E2E desk patterns

**Playwright** (`web/package.json` `test:e2e`), not Cypress. Not in pytest CI.

- `web/playwright.config.ts`: Chrome channel, `web/e2e/*.spec.ts`
- Servers: FastAPI `python -m endo_label --config web/e2e/config.yaml --port 7881`; Vite 5174; mask worker-down 7893
- Specs: `desk.spec.ts`, `login.spec.ts`, `mask-desk.spec.ts`
- `global-setup.ts` wipes `web/e2e/.work/`
- Auth: `web/e2e/auth.ts` E2E_USER/PASS
- Ticket 10 e2e: registered Clips open + label on existing desk (likely extend desk.spec after registration CLI/config)

---

## 7. CLI + config load

Entry: `python -m endo_label` → `endo_label/__main__.py` `main()`.

- Default: `load_settings(--config or repo-root config.yaml)` then `uvicorn.run(create_app(settings), 127.0.0.1, --port default 7880, workers=1)`
- Subcommand `create-admin USERNAME [--password] [--config]` → `coordination.create_account(..., admin=True)`
- **No** `register-clip` / `create-project` yet (ticket 10 should add CLI/config batch)
- Config: YAML only, no env (`ADR 0003`). Pytest builds `Settings(...)`.
- pyproject: no `[project.scripts]`; module entry only. Deps: fastapi uvicorn pyyaml pwdlib[argon2]

---

## 8. GET /api/ routes (no /api/projects)

| Route | File |
|-------|------|
| GET /api/health | mask/http.py |
| GET /api/clips, /api/clips/{id}, frames, media, annotations | mask/http.py |
| GET/POST /api/session*, /api/jobs/{id} | mask/http.py |
| POST /api/auth/login logout; GET /api/me | auth.py |
| GET /api/phase/{clip_id} + writes | phase/router.py |
| GET /api/class/{clip_id} + writes | frame_class/router.py |
| GET /api/triplet/{clip_id} + writes | triplet/router.py |
| GET /api/vocab + mutate | vocab_router.py |
| SPA `/` `/{path}` | app.py |

**Missing:** `/api/projects`, clip registration APIs.

Compose: `create_app` = mask app + `install_auth` + auth/phase/class/triplet/vocab routers.

---

## 9. ADRs (Project / Clip / catalog / registration)

- **0027** `docs/adr/0027-sqlite-coordination-files-payloads.md`: Projects, clip registration in SQLite WAL; **clips list in config.yaml replaced by DB registration per Project**; labels stay files; optimistic version on Clip row.
- **0026** vocab registry + per-Project enablement; hospital field; **same media two Projects = two Clips**; media shared read-only.
- **0016** YAML catalog `kind: jpeg|video` + path (current, to retire for directory).
- **0003** YAML sitting config.
- **0004** multi-user later (superseded by 0026/0027).
- **0002** compose 127.0.0.1:7880; empty allowlist = no Clips.
- **0007** Clip rail from allowlisted Clips.

---

## 10. Git

```
branch: ticket/multi-user/10-project-and-clip-registration
status: clean
HEAD: 7247b96 orchestrator: multi-user/10 Status RUNNING
```

Last 20: orchestrator status commits (10 RUNNING/READY/FAILED, 21/20/18/14 MERGED, reset after empty merge). Product 09 merge **not** in last-20 subject list but **is ancestor**:

- `c0b15a8 Merge multi-user ticket 09: coordination SQLite and login.`
- `28ab11e Implement 09: coordination SQLite, Account login, and /login shell.`

`git merge-base --is-ancestor 28ab11e HEAD` → yes.

---

## 11. Existing project/clip registration code / TODOs

**None in Python.** `CREATE TABLE` only users + login_sessions. Grep `/api/projects`, `register.*clip`, projects table: only issues/spec/ADR.

TODOs for implementer:
1. Extend `_init_schema` with `projects` (name, hospital) and `clips` (id, project_id FK, media path/kind, version later for 11).
2. CLI/config batch register (low-freq; UI in 15).
3. `catalog.clip_entries` / `list_clips` from DB; unregistered hidden.
4. `GET /api/projects`.
5. Two Project registrations of one media → two Clip ids, shared read-only files.
6. Compose 3 seams + Playwright desk open/label.

Constraint: labels still files keyed by clip_id (`labels_store`, mask `data/mask/<clip>`). Independent Clip ids = independent label trees.

---

## Files Retrieved

1. `endo_label/catalog.py` (1–end, esp 38–44, 318–360) — directory source
2. `endo_label/config.py` — ClipEntry, load_settings
3. `endo_label/coordination.py` (1–220) — schema 09
4. `endo_label/auth.py` — /api/auth /api/me
5. `endo_label/app.py` — compose
6. `endo_label/__main__.py` — CLI
7. `endo_label/mask/http.py` (130–175) — /api/clips
8. `tests/sitting_http.py`, `tests/test_auth.py`, `tests/test_compose.py` (1–150)
9. `web/playwright.config.ts`, `web/e2e/login.spec.ts`, `web/e2e/config.yaml`
10. `docs/adr/0026-*.md`, `0027-*.md`
11. `.scratch/multi-user/issues/09,10,15` + 01–21 headers

## Key Code

See catalog `clip_entries`, coordination `_init_schema`, auth `_PUBLIC_API`, `__main__` create-admin only.

## Architecture

YAML sitting → Settings → Catalog allowlist → GET /api/clips. Coordination SQLite is accounts-only. Ticket 10 inserts Project/Clip rows between Settings and Catalog.

## Start Here

`endo_label/coordination.py` (`_init_schema`) then `endo_label/catalog.py` (`clip_entries` / `list_clips`) then `endo_label/mask/http.py` GET clips. Tests: copy `tests/test_auth.py` + `_sitting` in `test_compose.py`. CLI next to `create-admin` in `__main__.py`.
