# Desk UI kit is shadcn, not HeroUI

The workbench rewrite keeps the three stores and span HTTP, and replaces sitting chrome plus gestures. The kit is **shadcn/ui** copied into `web/` (Tailwind + Radix primitives). Lucide may stay for icons. [ADR 0006](./0006-heroui-lucide.md) is superseded. ADR 0001’s “no shadcn” clause is superseded again. This does not decide layout, interval gesture, or light vs dark.

## Considered Options

- **Keep HeroUI parts, drop the three Tables** — rejected; the labeler asked to switch kit.
- **Hand-rolled chrome** — rejected; we already bounced off native stone controls once.

## Consequences

- shadcn components live in the repo. That extra review surface is why 0001/0006 rejected it; we are accepting it.
- HeroUI dark (`dark` class, ADR 0011) must be re-expressed in shadcn tokens if dark stays. Theme is a separate sitting choice.
- ADR 0009’s HeroUI Table rail is not implied by this kit choice; the gesture rewrite can still drop tables.
