# Clip desk is a full-viewport bench; forms collapse; Task-focus stays banned

The phase / class / triplet spec put three editors on one Frame with no mode switch, on a scrolling `max-w-7xl` page. Sitting chrome is too tall for a labeling bench, but exclusive Task-focus would contradict `CONTEXT.md` and those stories. This pass restyles `/clips/:clipId` as a desktop full-viewport bench (left filmstrip, JPEG center, right rail) and lets unused *forms* collapse. Always-on summaries stay writable: class chips, triplet list + Delete, phase name + Clear. Collapsing chrome is not Task-focus. Tailwind only; no shadcn; mask still omitted.

## Considered Options

- **Exclusive Task-focus** — rejected; glossary “Task focus: Do not use”; spec stories that all three stay editable on the same Frame, class chips next to the JPEG with no extra panel.
- **Always-open forms (today)** — rejected; the right column is a tall stack of span controls, pickers, and add-name fields.
- **Filmstrip under the JPEG** — rejected this pass; a left rail of thumbs buys JPEG height. One thumb per Frame, rail scrolls; no virtualize.
- **shadcn/ui** — rejected; ADR 0001.

## Consequences

- Playwright can still click a class chip and **Write span** with no expand (phase form starts open; chips live on the class header). **Add row** needs an expand of the triplet form first.
- A Clip with hundreds of Frames will jank in the left rail. Virtualize later; not this spec.
- Desktop sitting only. No mobile stack.
- `CONTEXT.md` is unchanged: collapse is chrome, not a new Task type.
