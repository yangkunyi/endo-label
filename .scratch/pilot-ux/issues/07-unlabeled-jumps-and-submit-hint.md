# pilot-ux/07 — Unlabeled jumps and the Submit hint

**What to build:** the two workflow touches that make coverage useful on a 120-Frame Clip.

- **Next unlabeled Frame** — the `n` key and a button next to the coverage strip move the Playhead
  to the next Frame with no label of the **focused Task type** (mask uses its own row, 06). Wraps
  once through the Clip; when everything is covered, `n` seeks nothing and the desk says
  `Every Frame has a class label` (a notice reusing the existing notice line).
- **Submit hint** — submitting an item whose coverage is incomplete still submits (coverage is not
  completion), but the desk says how much is missing first: a non-blocking notice such as
  `Submitting with 32 of 120 frames unlabeled for class` next to the item action. The admin's
  board-side Submit shows the same sentence. Never a modal, never a refusal.

Code:
- `web/src/desk/FrameControls.tsx` / `ClipDesk.tsx` — the `n` handler belongs with the other desk
  shortcuts (`desk/keyboard.ts` holds the shared predicate); guard inputs exactly as 02 does.
- `web/src/desk/DeskItemActions.tsx` — the Submit path; `web/src/AssignmentsBoard.tsx` mirrors it.
- Counts come from 05's strip data; do not recompute from a second source.

**Found by:** 05

- [ ] `n` jumps to the next Frame missing a label of the focused Task type
- [ ] `n` reports when there is nothing left instead of doing nothing silently
- [ ] `n` never fires while typing in a Vocab field
- [ ] Submit still succeeds with gaps, and names the gap count first
- [ ] the same sentence appears from the board's Submit
