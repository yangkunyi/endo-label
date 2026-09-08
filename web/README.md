# Desk

Vite SPA for listing allowlisted Clips, scrubbing Frames, painting phase, toggling class flags, and adding triplet rows on the current Frame.

```bash
npm install
npm run dev
```

Vite listens on `http://127.0.0.1:5173` and proxies `/api` to FastAPI `127.0.0.1:7880`. Start `python -m endo_label` first.

Sitting: `npm run build`, then only FastAPI. The process serves `web/dist` at `http://127.0.0.1:7880/`. Rebuild `web/dist` after desk source changes, or sitting still serves the old JS/CSS.

```bash
npm test
npm run test:e2e                  # headless, isolated API :7891 + Vite :5191 (system Chrome)
npm run test:e2e:ui               # Playwright runner (needs a display)
```

Playwright is local, not CI. It does not use sitting `:7880`. Repo-root `.venv` must be able to `python -m endo_label`.
