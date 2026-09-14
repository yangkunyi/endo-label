# phase-class-triplet/01 — Sitting starts from YAML

**What to build:** An operator can start the desk from a YAML file (repo-root default or a `--config` path). Missing file: the process refuses to start. Sitting does not read environment variables for Frame Pool, allowlist, or store roots. Empty allowlist means no Clips. Browser CORS for the Vite origin is tight. HTTP tests still inject settings in memory and stay green.

- [x] Sitting with repo-root config file uses that Frame Pool, allowlist, and label roots
- [x] `--config` path overrides the default file
- [x] Missing config file: process exits with a clear error (does not start)
- [x] Environment variables are not sitting config
- [x] Empty allowlist → catalog has zero Clips
- [x] CORS allows only the Vite origin (`127.0.0.1` and `localhost` on 5173)
- [x] Existing compose HTTP tests that inject settings still pass (no YAML required)

## Answer

Sitting is `python -m endo_label` (optional `--config PATH`). `load_settings` reads YAML only: repo-root `config.yaml` or that path. Missing file: `ConfigError`, process exit 1. `FRAMES_ROOT` / `CLIP_ALLOWLIST` / `LABELS_ROOT` env ignored. Empty `clip_allowlist` → `GET /api/clips` is `{"clips": []}`. CORS origins: `http://127.0.0.1:5173` and `http://localhost:5173`. Compose tests still `create_app(Settings(...))` with no YAML.

Tests: `tests/test_sitting_config.py`. HTTP inject path: `tests/test_compose.py`. `--port` defaults to 7880 (Playwright e2e uses 7881). Repo-root `config.yaml` is local sitting (gitignored). Empty file still required at that path or `--config`.
