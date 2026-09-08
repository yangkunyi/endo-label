# FastAPI process: localhost, no auth, one worker, SPA + API together

This spec is a local one-labeler sitting. The compose app binds **127.0.0.1:7880** by default (`--port` overrides; Playwright e2e uses 7891), no login. One **uvicorn worker** (in-process Session later; JSON files have no flock). CORS allows only `http://127.0.0.1:5173` and `http://localhost:5173`. Empty `clip_allowlist` means no Clips. Sitting: FastAPI serves `web/dist` at `/`, `/api/*` is the API, unknown GET → `index.html`. Dev may run without `dist` (Vite owns `/`). Keep one compose app; fake predictor stays idle for labels-only.

## Considered Options

- **0.0.0.0 / token auth** — later, with logins (ADR 0004).
- **Labels-only entrypoint without Session** — rejected; two apps would drift catalog/settings.
- **CORS `*`** — rejected; current combo with credentials is wrong. Sitting is same-origin.
