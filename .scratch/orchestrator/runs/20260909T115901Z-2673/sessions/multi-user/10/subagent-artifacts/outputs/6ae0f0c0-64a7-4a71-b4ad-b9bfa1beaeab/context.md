# Code Context

Scout of `/data3/yky/endo_label/worktrees/multi-user-10-project-and-clip-registration` (no file modifications).

## Files Retrieved
1. `web/` listing — Playwright tree exists (`e2e/login.spec.ts`, `playwright.config.ts`); **no `web/node_modules`**.
2. `docs/agents/domain.md` (start) — domain-docs process, not coding style.
3. Markdown inventory via glob — no `CODING_STANDARDS.md` / `CONTRIBUTING.md`.
4. Git porcelain + `git diff --stat HEAD` + `git log -5 --oneline`.

## Key Code
N/A for this hygiene scout. Lint tooling mentioned in `web/package.json`: `"lint": "oxlint"`; `web/.oxlintrc.json` present.

## Architecture
### Coding standards docs
- **None found:** no `CODING_STANDARDS.md`, no `CONTRIBUTING.md` anywhere under the worktree.
- No `docs/**` file whose name matches `*standard*`.
- Grep for “coding standard” in `*.md`: no matches.
- Closest process docs: `AGENTS.md`, `CONTEXT.md`, `docs/adr/*`, `docs/agents/{domain,issue-tracker,triage-labels,archon-matt}.md`. Frontend lint is oxlint, not a written style guide.

### Playwright e2e
- **Skipped.** `web/node_modules` is missing. Spec exists at `web/e2e/login.spec.ts`.
- `node`/`npx` available at `/data3/yky/.local/bin/{node,npx}`.
- Command not run: `npx playwright test e2e/login.spec.ts --reporter=line` (timeout 180000ms, `ENDO_LABEL_PYTHON` unused).

### git status --short
```
 M endo_label/__main__.py
 M endo_label/app.py
 M endo_label/catalog.py
 M endo_label/config.py
 M endo_label/coordination.py
 M tests/sitting_http.py
 M tests/test_compose.py
 M tests/test_mask_session.py
 M tests/test_sitting_config.py
 M web/e2e/config.yaml
?? endo_label/projects_router.py
?? tests/test_projects.py
```

### git diff --stat HEAD
```
 endo_label/__main__.py       |  90 +++++++++++++++++++-
 endo_label/app.py            |   4 +
 endo_label/catalog.py        |  16 +---
 endo_label/config.py         |  49 ++++++++++-
 endo_label/coordination.py   | 194 ++++++++++++++++++++++++++++++++++++++++++-
 tests/sitting_http.py        |  36 +++++++-
 tests/test_compose.py        |  26 ++----
 tests/test_mask_session.py   |   3 +-
 tests/test_sitting_config.py |  20 ++++-
 web/e2e/config.yaml          |  23 ++---
 10 files changed, 408 insertions(+), 53 deletions(-)
```
Untracked (`projects_router.py`, `test_projects.py`) are **not** in `--stat HEAD`.

### git log -5 --oneline
```
7247b96 orchestrator: multi-user/10 Status RUNNING
63cb5ef orchestrator: multi-user/10 Status READY
4447764 chore(orchestrator): httpProxy clash 127.0.0.1:23379
491a06e orchestrator: multi-user/10 Status FAILED
7d8ed58 orchestrator: multi-user/10 Status RUNNING
```

## Start Here
Install `web/node_modules` if e2e is required; otherwise inspect dirty backend files (`endo_label/coordination.py`, `endo_label/projects_router.py`).

## Supervisor coordination
None.
