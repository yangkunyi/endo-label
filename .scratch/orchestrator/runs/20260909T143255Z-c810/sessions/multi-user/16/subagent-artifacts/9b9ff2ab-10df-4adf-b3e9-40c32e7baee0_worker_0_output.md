## Test/typecheck report

No files edited.

### 1. `pytest tests/test_registry.py -q`
**PASS** — exit code `0`

Command: `.venv/bin/pytest tests/test_registry.py -q`

```
......                                                                   [100%]
6 passed, 2 warnings in 3.66s
```

Warnings only: Starlette/httpx `TestClient` deprecation and `anyio.abc.BlockingPortal` alias deprecation.

### 2. `pytest tests/test_compose.py tests/test_projects.py tests/test_registry.py -q`
**PASS** — exit code `0`

Command: `.venv/bin/pytest tests/test_compose.py tests/test_projects.py tests/test_registry.py -q`

```
........................................................................ [ 74%]
.........................                                                [100%]
97 passed, 2 warnings in 39.43s
```

Same two deprecation warnings; no assertion failures.

### 3. `npm test` in `web/`
**FAIL** — exit code `127`

Command: `cd web && npm test` (`vitest run`)

```
> web@0.0.0 test
> vitest run

sh: 1: vitest: not found
```

`web/node_modules` is missing; no install was run (do-not-edit).

### 4. `npm run typecheck` in `web/`
**FAIL** — exit code `127`

Command: `cd web && npm run typecheck` (`tsc -b --noEmit`)

```
> web@0.0.0 typecheck
> tsc -b --noEmit

sh: 1: tsc: not found
```

Same cause: `web/node_modules` missing; `tsc` not on PATH.

---

**Summary:** Python tests all passed (6/6 then 97/97). Frontend vitest/typecheck did not run because dependencies are not installed. Next step: `npm ci` (or `npm install`) in `web/`, then re-run `npm test` and `npm run typecheck`.