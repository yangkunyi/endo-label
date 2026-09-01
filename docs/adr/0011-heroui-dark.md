# Sitting is always dark; no light toggle

Status: accepted; kit is now shadcn ([ADR 0013](./0013-shadcn.md)). Always-dark and no toggle still stand. HeroUI `dark` class and Table selected-vs-outline states are obsolete with the combobox rewrite.

The sitting is **always dark**: shadcn dark tokens on the root, no light switch, no `prefers-color-scheme` toggle.

## Considered Options

- **Keep light, only bump selected contrast** — rejected; the labeler asked to switch to dark.
- **Follow the OS / a light–dark toggle** — rejected; one local labeler, extra control.

## Consequences

- ADR 0009’s “do not restyle Table/Select/Button with `stone-*`” now covers the whole shell (rails, header, footer).
- Span HUD copy and the slider from→to fill must read on dark.
- Existing localStorage layout widths are unrelated; density is a separate spec.
