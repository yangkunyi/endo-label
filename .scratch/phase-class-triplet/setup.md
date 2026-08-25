# Sitting and checks (this machine)

Phase / class / triplet spec is **resolved** (tickets 01–07). Mask is a later spec.

## Sitting (human)

Repo-root `config.yaml` is required and gitignored. Missing file: process does not start. Current file:

```yaml
frames_root: /data3/yky/sam3_1_label_tool/sam31_label_kit/frames
clip_allowlist:
  - CASE001_step06_clip002
  - CASE002_step17_clip003
  - CASE047_step08_clip003
  - CASE001_step02_clip004_split002
labels_root: data/labels
```

```bash
cd /data3/yky/endo_label
PYTHONPATH=. .venv/bin/python -m endo_label
# http://127.0.0.1:7880/
```

`.venv` needs FastAPI / uvicorn / pyyaml. After `web/src` edits: `cd web && npm run build`, then hard-refresh the sitting tab. Old `web/dist` has no editors.

Dev (source, not dist): API on 7880, then `cd web && npm run dev` → `http://127.0.0.1:5173/`.

## Playwright (local, not CI)

Uses system Google Chrome. If Chrome is missing: `cd web && npx playwright install chromium`.

```bash
cd web
npm run test:e2e       # isolated API :7881 + Vite :5174, fixture CLIP_E2E
npm run test:e2e:ui    # runner (needs a display)
```

Does not touch sitting `:7880` or `data/labels/`. HTTP checks stay `PYTHONPATH=. python -m pytest tests -q`.
