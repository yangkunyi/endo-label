# Frontend: Vite SPA, React, TypeScript, SWR, Zustand, Tailwind; Python FastAPI is the only public API

The desk is a local one-labeler tool. We ship a **new** Vite SPA under `web/` (**React + TypeScript**, **Tailwind only**, **SWR** for server data, **Zustand** for UI state, **React Router** `/` and `/clips/:clipId` with Frame index in Zustand). npm. Dev: Vite `:5173` proxies `/api` to FastAPI `:7880`. Sitting: `vite build`, FastAPI serves `web/dist`. Browser talks only to this Python compose — no Go, no Next.js, no Node API, no copy of `sam3_1_label_tool` `web/src`. Canvas library waits for the mask spec. No shadcn/ui on this desk.

## Considered Options

- **Next.js** — rejected; local tool, no SSR of labels, extra Node server beside FastAPI.
- **Go as the public API, Python as SAM worker** — rejected; phase / class / triplet and the Frame Pool catalog already live in FastAPI. SAM stays Python later without splitting the label HTTP.
- **TanStack Query** — rejected in favor of SWR.
- **shadcn/ui (Radix)** — rejected for this spec; chips and pickers are Tailwind + native controls.
- **Copy the old Vite desk** — rejected; ticket 09 / this spec. New `web/`, same *kind* of SPA, not those pages.
