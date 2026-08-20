# endo_label

Endoscopic surgical-video labeling. **New repo** so this tree stays light: no `.scratch/`, no vendored `sam3/`, no kit.

Four **sibling backends** (run alone or together on the same Clip / Frame):

| Backend | GPU | Store |
|---------|-----|--------|
| `phase` | no | `data/labels/phase/` |
| `class` | no | `data/labels/class/` |
| `triplet` | no | `data/labels/triplet/` |
| `mask` | SAM 3.1 Session when Predict/Propagate runs | `data/mask/` |

Mask worker code was **ported** from `/data3/yky/sam3_1_label_tool/video_label_service`. SAM weights and `sam3/` stay there; set `SAM31_REPO` / `SAM31_CHECKPOINT` / `FRAMES_ROOT`.

Default predictor is **fake** (no GPU).

## Run

```bash
cd /data3/yky/endo_label
export PYTHONPATH=.
export FRAMES_ROOT=/data3/yky/sam3_1_label_tool/sam31_label_kit/frames
export CLIP_ALLOWLIST=CASE001_step06_clip002
# optional real SAM:
# export PREDICTOR_BACKEND=sam31
# export SAM31_REPO=/data3/yky/sam3_1_label_tool/sam3
# export SAM31_CHECKPOINT=/data3/yky/sam3_1_label_tool/sam31_label_kit/ckpt/sam3.1_multiplex.pt

python -m uvicorn endo_label.app:app --host 127.0.0.1 --port 7880
```

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
