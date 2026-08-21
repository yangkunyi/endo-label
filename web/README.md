# Desk

Vite SPA for listing allowlisted Clips, scrubbing Frames, painting phase, toggling class flags, and adding triplet rows on the current Frame.

```bash
npm install
npm run dev
```

Vite listens on `http://127.0.0.1:5173` and proxies `/api` to FastAPI `127.0.0.1:7880`. Start `python -m endo_label` first.

Sitting: `npm run build`, then only FastAPI. The process serves `web/dist` at `http://127.0.0.1:7880/`.
