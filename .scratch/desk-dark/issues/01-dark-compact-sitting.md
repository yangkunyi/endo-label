# 01 — Dark compact sitting

**What to build:** The workbench is always HeroUI dark, with no light toggle and no `stone-*` chrome. The right rail defaults to 280px (min 220, max 420) under a new layout storage key so an old 416px width does not stick. Tables are compact. Labels already on this Frame use a strong filled selected state; the span payload snapshotted at `[` uses a different outline/check. Triplet cells are three short native inputs with a native datalist (not ComboBox), so adding a row does not require sideways scrolling. The HUD shows `Select labels → [ → scrub → ]` plus Write/Remove and the payload. While from is set, the Frame slider fills from that index through the current Frame. `[` / `I` and `]` / `O` stay.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The sitting is dark from the root; rails, header, footer, tables, selects, buttons, and the slider do not use `stone-*`; there is no light switch
- [x] A new sitting (or a new layout key) opens the editor rail at 280px, clamp 220–420; Clip rail, play, fps, skip-N, and drag-reorder stay
- [x] Phase/class rows on this Frame read as a strong fill; after `[`, the frozen span payload reads as outline/check even on an unlabeled Frame; the two looks are not the same color
- [x] Triplet plus + typing instrument/verb/target in short inputs with datalist persists a complete row without horizontal scroll on the table; incomplete rows are still not written
- [x] HUD copy includes `Select labels → [ → scrub → ]`, Write to span / Remove from span, and the payload names; `I`/`O` still alias `[`/`]`
- [x] While from is set, the slider fill covers the inclusive from→current range (order-insensitive); `]` without `[` is still this Frame only; keys stay ignored in inputs; a successful span write still pauses play
- [x] Mask, Task-focus, vocab delete, empty seed, and wiping `vocab.json` are out of this ticket
- [x] Playwright covers dark sitting, rail width, triplet add without sideways scroll, HUD recipe, slider fill after `[`, no Arm, and no filmstrip
