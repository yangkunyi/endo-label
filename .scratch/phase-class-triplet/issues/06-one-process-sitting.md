# phase-class-triplet/06 — Sitting is one process

**What to build:** After a frontend build, the labeler runs only FastAPI (YAML config). The built desk is served from the same origin as `/api`. Refresh on `/clips/:clipId` still shows the desk (fallback to the SPA document). Vite is not required for a sitting. Missing build: API still runs (dev without dist is fine).

- [x] Built desk is served at `/`; `/api` still the compose HTTP
- [x] Refresh (or open) `/clips/:clipId` returns the desk, not a 404
- [x] Labeler can list Clips, scrub, and use phase / class / triplet without Vite
- [x] Process still binds localhost; one worker; no Session required for those three
- [x] Sitting without a built desk still serves `/api` (no crash)

## Answer

Sitting is still `python -m endo_label` (YAML config). After `cd web && npm run build`, FastAPI serves `web/dist` at `/` on `127.0.0.1:7880` (one uvicorn worker). `/api` stays compose HTTP. Unknown GET that is not `/api/*` returns `index.html`, so refresh on `/clips/:clipId` loads the desk. Phase / class / triplet and Frame JPEGs work on that origin with Session inactive. Missing `web/dist`: `/api` still runs (no crash). Vite is only for dev.

Tests: `tests/test_sitting_desk.py` (compose HTTP). Browser sitting is ticket 07 (Playwright uses Vite `:5174` + API `:7881`, not this process). After desk source changes, `cd web && npm run build` or `:7880` still serves the old `web/dist`.
