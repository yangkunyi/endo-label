Implemented JS dep install + requested test runs. No product source edits.

Changed files: none (product). `web/node_modules` created by `npm ci` (was missing).

**How JS deps are installed**
- Install location: `web/` (`package.json` + `package-lock.json`).
- `web/node_modules`: missing before install.
- Repo root / parent: no `node_modules`, no root `package-lock.json`.
- README (`README.md`, `web/README.md`) documents `cd web && npm install`.
- Because `web/package-lock.json` exists, used `npm ci` (not a new package manager).

**Commands / exit codes**

1. `cd web && npm ci` → **exit 0**
```
added 88 packages, and audited 89 packages in 13s
24 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities
```
   (First `npm ci` from repo root failed with EUSAGE / exit 1 — no lockfile at root.)

2. `cd web && npm test && npm run typecheck` → **exit 0**
```
> web@0.0.0 test
> vitest run

 RUN  v4.1.11 /data3/yky/endo_label/worktrees/multi-user-16-vocab-registry-expand/web

 Test Files  9 passed (9)
      Tests  82 passed (82)
   Start at  22:45:20
   Duration  987ms (transform 486ms, setup 0ms, import 1.44s, tests 128ms, environment 1ms)

> web@0.0.0 typecheck
> tsc -b --noEmit
```

3. `.venv/bin/pytest -q` (repo root) → **exit 0**
```
167 passed, 1 skipped, 2 warnings in 65.33s (0:01:05)
```
Warnings: Starlette/`httpx` TestClient deprecation; `anyio.abc.BlockingPortal` alias deprecation.

Skipped `npm run test:e2e` / Playwright as requested.

Validation: web 82/82 + typecheck clean; pytest 167 passed, 1 skipped.
Open risks/questions: none for this task.
Recommended next step: none; test gate is green.