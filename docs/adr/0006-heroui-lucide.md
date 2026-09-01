# Desk UI kit is HeroUI + lucide, not shadcn, not hand-rolled chrome

Status: superseded by [ADR 0013](./0013-shadcn.md).

This sitting needs a denser, more current look than stone/emerald native controls. We install **HeroUI** (`@heroui/react`, Tailwind v4 + React Aria) and **lucide-react** for play/pause/grip icons. We still do **not** copy shadcn/ui into `web/src`. Splitters, span arming, and playback stay hand-written. Framer Motion comes along as HeroUI’s motion peer.

## Considered Options

- **Keep Tailwind-only native controls (ADR 0001)** — rejected; the labeler asked for a modern look, and the bench still read as a form.
- **shadcn/ui** — rejected again; copy-paste Radix files into the repo, extra review surface, no ready-made look. Grok can edit HeroUI usage at the call site.
- **No kit, lucide only** — rejected for this pass; icons alone do not change the visual language.

## Consequences

- ADR 0001’s “Tailwind only / no shadcn” clause is superseded; Vite + React + SWR + Zustand + FastAPI stand.
- HeroUI is an npm package; we do not patch its internals.
- Panel resize and editor reorder are not HeroUI features.
