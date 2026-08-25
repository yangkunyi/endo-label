# 02 — Clip list and Frame scrub

**What to build:** A new Vite desk (React, TypeScript, Tailwind only, SWR, Zustand, React Router, npm). The labeler sees allowlisted Clips at `/`, opens `/clips/:clipId`, sees that Clip’s JPEG and a filmstrip, and scrubs Frames. Scrub only changes the current Frame in Zustand — it does not write phase, class, or triplet, and it does not open a Session. Vite proxies `/api` to FastAPI. Do not copy the old mask desk sources.

**Blocked by:** 01 — Sitting starts from YAML

**Status:** resolved

- [x] `/` lists allowlisted Clips and Frame counts from the catalog
- [x] Non-allowlisted / missing Clip fails clearly
- [x] `/clips/:clipId` shows Frame `0` JPEG, then other Frames on scrub
- [x] Filmstrip highlights the current Frame
- [x] Scrub does not persist labels and does not start a Session
- [x] Dev: Vite on 5173, `/api` proxied to FastAPI on 7880
- [x] No Task-focus switch, no mask tools, no shadcn

## Answer

New Vite SPA at `web/` (React, TypeScript, Tailwind, SWR, Zustand, React Router, npm). Not a copy of the old mask desk.

- `/` loads `GET /api/clips` and lists allowlisted Clip id + Frame count.
- `/clips/:clipId` loads catalog meta, shows Frame 0 JPEG, filmstrip highlights the Zustand Frame index. Scrub only calls `scrub()` in `deskStore` — no phase/class/triplet writes, no Session fetch.
- Missing / non-allowlisted Clip: catalog 404; desk shows the FastAPI `detail` string.
- Dev: Vite `127.0.0.1:5173`, `strictPort`, proxy `/api` → `127.0.0.1:7880` (Playwright sets `ENDO_LABEL_API` and Vite `:5174`).

Phase / class / triplet editors are tickets 03–05. Sitting `web/dist` is ticket 06.

Tests: `tests/test_compose.py` (catalog + GET frames leave Session off and labels empty); `web` Vitest (`deskStore`, clip/JPEG paths, error detail).
