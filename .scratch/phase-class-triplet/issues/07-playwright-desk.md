# 07 — Local Playwright drives the desk

**What to build:** A labeler-shaped Chromium check that opens the Clip list, opens a Clip, sees phase / class / triplet on one Frame (Tailwind chrome actually applied), and writes one of each kind. Isolated process — not sitting `:7880`, not the operator Frame Pool, not CI.

**Blocked by:** 06 — Sitting is one process

Status: MERGED

- [x] `cd web && npm run test:e2e` starts isolated FastAPI `:7881` and Vite `:5174`
- [x] Fixture Clip `CLIP_E2E` (tiny JPEGs) and `web/e2e/config.yaml`; labels under `web/e2e/.work/`
- [x] Sitting on `:7880` can stay up; e2e does not write `data/labels/`
- [x] Clip list → desk shows class, triplet, and phase together
- [x] Write-span button is not unstyled (Tailwind background present)
- [x] One class toggle, one phase span, one triplet row on this Frame
- [x] `npm run test:e2e:ui` exists; not wired to pytest / GitHub Actions
- [x] `--port` on `python -m endo_label`; Vite proxy target `ENDO_LABEL_API`

## Answer

Playwright lives in `web/` (`@playwright/test`, `playwright.config.ts`, `web/e2e/desk.spec.ts`). It is a **local** desk check, not CI.

- API: `python -m endo_label --config web/e2e/config.yaml --port 7881` using repo `.venv` (or `ENDO_LABEL_PYTHON`).
- Vite: port `5174`, `ENDO_LABEL_API=http://127.0.0.1:7881`. Browser talks only to Vite; `/api` is proxied (CORS 5173 list unchanged).
- Fixture Frame Pool: `web/e2e/fixtures/frames/CLIP_E2E/`. `global-setup.ts` deletes `web/e2e/.work/` so writes do not leak across runs.
- Sitting default stays `127.0.0.1:7880`. Invalid `--port` exits 2.

Tests: `web/e2e/desk.spec.ts`. CLI: `tests/test_sitting_config.py` (`--port 0`). Uses system Google Chrome (`channel: "chrome"`). Optional: `npx playwright install chromium` if Chrome is missing.
