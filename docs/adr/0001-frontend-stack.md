# Frontend: Vite SPA, React, TypeScript, SWR, Zustand, Tailwind; Python FastAPI is the only public API

Status: accepted; “Tailwind-only controls / no shadcn” superseded by [ADR 0006](./0006-heroui-lucide.md), then by [ADR 0013](./0013-shadcn.md) (shadcn in `web/`). Routes `/` vs `/clips/:clipId` as separate pages superseded by [ADR 0007](./0007-single-page-workbench.md).

The desk is a local one-labeler tool. We ship a **new** Vite SPA under `web/` (**React + TypeScript**, **Tailwind**, **SWR** for server data, **Zustand** for UI state, **React Router**). npm. Dev: Vite `:5173` proxies `/api` to FastAPI `:7880`. Sitting: `vite build`, FastAPI serves `web/dist`. Browser talks only to this Python compose — no Go, no Next.js, no Node API, no copy of `sam3_1_label_tool` `web/src`. Canvas library waits for the mask spec.

Local Playwright (`cd web && npm run test:e2e`) drives the desk in Chromium against an isolated API on `127.0.0.1:7881` and Vite on `5174`. It is not CI. Sitting on `7880` / Vite `5173` stays for the human. `npm run test:e2e:ui` opens Playwright’s runner.

## Considered Options

- **Next.js** — rejected; local tool, no SSR of labels, extra Node server beside FastAPI.
- **Go as the public API, Python as SAM worker** — rejected; phase / class / triplet and the Frame Pool catalog already live in FastAPI. SAM stays Python later without splitting the label HTTP.
- **TanStack Query** — rejected in favor of SWR.
- **shadcn/ui (Radix)** — rejected then; ADR 0006 picks HeroUI instead of copying shadcn into the repo.
- **Copy the old Vite desk** — rejected; ticket 09 / this spec. New `web/`, same *kind* of SPA, not those pages.
