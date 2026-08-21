# endo_label

Endoscopic surgical-video labeling. **New repo** so this tree stays light: no `.scratch/`, no vendored `sam3/`, no kit.

Four **sibling backends** (run alone or together on the same Clip / Frame):

| Backend | GPU | Store |
|---------|-----|--------|
| `phase` | no | `data/labels/phase/` |
| `class` | no | `data/labels/class/` |
| `triplet` | no | `data/labels/triplet/` |
| `mask` | SAM 3.1 Session when Predict/Propagate runs | `data/mask/` |

Mask worker code was **ported** from `/data3/yky/sam3_1_label_tool/video_label_service`. SAM weights and `sam3/` stay there. Default predictor is **fake** (no GPU).

Sitting reads **YAML only** (repo-root `config.yaml` or `--config`). No `FRAMES_ROOT` / `CLIP_ALLOWLIST` env. Missing file: process does not start. HTTP tests inject `Settings` in memory.

## Run

`config.yaml` at the repo root (or pass `--config`):

```yaml
frames_root: /data3/yky/sam3_1_label_tool/sam31_label_kit/frames
clip_allowlist:
  - CASE001_step06_clip002
labels_root: data/labels
```

Empty `clip_allowlist` means no Clips.

```bash
cd /data3/yky/endo_label
PYTHONPATH=. python -m endo_label
# PYTHONPATH=. python -m endo_label --config /path/to/config.yaml
```

Binds `127.0.0.1:7880`. CORS allows only `http://127.0.0.1:5173` and `http://localhost:5173`.

Desk (dev): Vite SPA in `web/`. Start the API first, then:

```bash
cd web
npm install
npm run dev
```

Vite is `http://127.0.0.1:5173` and proxies `/api` to `127.0.0.1:7880`. `/` lists allowlisted Clips; `/clips/:clipId` shows Frame 0, a filmstrip (each Frame’s phase or empty), and a phase editor (span paint, clear this Frame, add phase name). Scrub only changes the current Frame (no labels written, no Session).

Health: `GET http://127.0.0.1:7880/api/health`

Labels-only (no Session):

- `GET/PUT /api/phase/{clip}/frames/{i}` and `POST /api/phase/{clip}/span`
- `GET/PUT /api/class/{clip}/frames/{i}`
- `GET/POST /api/triplet/{clip}/frames/{i}`
- `GET/POST /api/vocab`

Mask (existing Session API): `/api/session`, `/api/session/predict`, `/api/session/propagate`

## Tests

```bash
PYTHONPATH=. python -m pytest tests -q
```
