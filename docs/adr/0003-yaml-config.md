# Sitting config is YAML only: repo-root `config.yaml` or `--config`

A sitting does not read `FRAMES_ROOT` / `CLIP_ALLOWLIST` / other env. Settings come from **`config.yaml` at the repo root**, or **`--config path`**. Missing file: process refuses to start. Pytest builds `Settings(...)` in memory and does not need a file. `ENDO_LABEL_CONFIG` env is not used.

## Considered Options

- **Env only** — rejected; sitting should have one file, not a shell recipe.
- **YAML then env overrides** — rejected; two sources drift.
