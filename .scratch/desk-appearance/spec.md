Status: specified — ticket 01 resolved; ticket 02 not started

# Spec: desk appearance (phase / class / triplet bench)

Parent spec: `.scratch/phase-class-triplet/spec.md` (resolved). This spec does not change writes, stores, vocab, or HTTP. It restyles the existing desk.

## Problem Statement

The labeler already paints phase, toggles class, and adds triplet rows on the same Frame, with no Task-focus and no Session. The page is a scrolling document (`max-w-7xl`, JPEG + stacked editors + a horizontal filmstrip). Unused controls (span from/to, three triplet pickers, add-name on every editor) sit at full size all the time.

The job is appearance only: same gestures and same persist, denser chrome. Not a new Task type. Not mask. Not keyboard. Not Clip coverage.

## Solution

`/clips/:clipId` becomes a **desktop full-viewport bench** (stone / emerald Tailwind, no shadcn):

- Thin top bar: link **Clips**, Clip id, `Frame {i} of {N}`.
- **Left rail:** one thumb per Frame (JPEG, index, phase name or empty). Click scrubs. Current Frame highlighted. Rail scrolls vertically. No virtualize.
- **Center:** current JPEG, `object-contain`, never cropped.
- **Right rail,** order **class**, **triplet**, **phase**. Each editor is a card with a chevron.

**Always-on summary** (no expand): class chips still toggle; triplet rows still list with **Delete**; phase shows this Frame’s name (or unlabeled) and **Clear this Frame's phase**.

**Forms fold independently** (any subset open). That is density, not Task-focus: all three Task types stay writable on the same Frame. Class fold body is only the add-name disclosure — no second chip row. Phase form: name picker, from/to, **Write span**. Triplet form: instrument / verb / target, **Add row**. Add-name in each editor sits behind a **closed** disclosure.

Defaults on first open, reload, or another Clip: phase form **open**; class body **closed**; triplet form **closed**; all add-name disclosures **closed**. Zustand remembers folds for this Clip until reload or a different Clip. Scrub does not reset folds.

`/` stays a list of Clip id + Frame count. Match stone / emerald and type scale; no workbench, no progress %.

Parent ADR 0001–0004 stay: Tailwind only, Frame index in Zustand, immediate persist, one local labeler, no login. Mask stays omitted. Canvas library still waits for the mask spec.

## User Stories

### Bench chrome

1. As a labeler, I want `/clips/:clipId` to fill the window under a thin top bar, so that the desk is not a scrolling article.
2. As a labeler, I want the top bar to show a Clips link, this Clip’s id, and `Frame {i}` plus `of {N}` when `N > 0`, so that I know where I am without reading the filmstrip.
3. As a labeler, I want a vertical filmstrip on the left with one thumb per Frame, so that the JPEG can use the remaining height.
4. As a labeler, I want each filmstrip cell to show that Frame’s JPEG, its index, and its phase name or empty, so that the exclusive phase strip is still visible (parent story 29).
5. As a labeler, I want the current Frame highlighted on the filmstrip, and a click to scrub only (no label write, no Session).
6. As a labeler, I want the current JPEG in the center pane, contained (not cropped), so that no surgical pixels are clipped by layout.
7. As a labeler, I want the three editors in a right rail in order class, then triplet, then phase, so that class chips stay nearest the JPEG (parent story 41).
8. As a labeler, I want the left rail and the right rail to scroll inside themselves when the window is short, and the JPEG not to scroll away, so that thumbs and cards do not drag the Frame off-screen.
9. As a labeler sitting at ~1280×800, I want this layout; I do not need a phone/tablet stack this pass.

### Always-on summary (not a mode)

10. As a labeler, I want class chips on the class card header at all times, and a click to toggle a flag, so that I can mark `grasper` while the phase span form is open (parent story 41).
11. As a labeler, I want this Frame’s triplet rows listed with **Delete** without opening the triplet form, so that a bad row is still one click.
12. As a labeler, I want this Frame’s phase name (or unlabeled) and **Clear this Frame's phase** without opening the phase form, so that a single-Frame clear stays on the summary.
13. As a labeler, I want folding a form to hide controls only, never to lock the other Task types, so that this is not Task-focus.

### Folds and add-name

14. As a labeler, I want a chevron on class, triplet, and phase, so that the three cards share the same chrome.
15. As a labeler, I want any subset of forms open at once, so that I can paint a span and add a triplet row without a mode switch.
16. As a labeler, I want the class body (when open) to be only the add-name disclosure, with no second chip row, so that chips live in one place.
17. As a labeler, I want the phase form (when open) to keep name picker, from/to, and **Write span**, so that span paint is the same gesture as today.
18. As a labeler, I want the triplet form (when open) to keep the three pickers and **Add row**, so that adding a row is the same gesture as today, after one expand if the form was closed.
19. As a labeler, I want “new … name” + Add in each editor behind a closed disclosure, so that vocab growth does not occupy sitting chrome.
20. As a labeler, I want first open of a Clip (and reload, and switching Clip) to open the phase form and close the class body, the triplet form, and every add-name disclosure, so that **Write span** and class chips are ready and the right rail starts short.
21. As a labeler, I want fold state remembered while I stay on this Clip, including across scrub, so that walking Frames does not slam forms shut.
22. As a labeler, I want that memory gone after reload or after I open a different Clip, so that defaults come back.

### Clip list

23. As a labeler, I want `/` to stay a list of allowlisted Clip id + Frame count, with the same stone / emerald type as the desk top bar, so that the list is not a second product.
24. As a labeler, I do not want coverage % or other label progress on `/` this pass.

### Unchanged parent contracts

25. As a labeler, I want each successful write persisted immediately, with no draft and no Save.
26. As a labeler, I want scrub to change only the Zustand Frame index (not the URL, not disk).
27. As a labeler, I want the copy to say phase, class, and triplet — not Annotation.
28. As a labeler, I want no mask tools, no Session chrome, and no Task-focus switch on this page.

## Implementation Decisions

- **Seam:** still the compose HTTP. This spec does not add routes. Fold state is UI-only (Zustand), never a file.
- **Where:** `web/src/ClipDesk.tsx` (bench). `ClipList.tsx` only if type / spacing is cheap. `deskStore.ts` may hold per-Clip fold flags next to Frame index. No new npm dependency. No shadcn. No canvas library.
- **Stack (ADR 0001, 0005):** Vite SPA, React, TypeScript, Tailwind only, SWR, Zustand, React Router `/` and `/clips/:clipId`.
- **Bench layout:** CSS grid/flex filling `100vh` (minus nothing but the top bar). Left rail `overflow-y-auto`; right rail `overflow-y-auto`; JPEG `object-contain` in the center pane (keep a dark well on the img if it already has `bg-black`). Do not introduce a page scroll under the top bar.
- **Filmstrip:** `data.frames.map` still loads every thumb URL. Known ceiling: long Clips jank. Do not virtualize, do not replace thumbs with dots.
- **Cards:** heading `class` / `triplet` / `phase` stay those words. Chevron toggles the form body. Independent booleans. Class header includes the chip row. Class body is the add-name disclosure only.
- **Add-name:** closed `<details>` or equivalent; default closed; still `POST` `/api/vocab/{list}`.
- **Defaults:** `{ phaseForm: true, classBody: false, tripletForm: false }`. Reset when `clipId` changes and on full reload (in-memory store).
- **Clip list:** keep current list structure; optional type-scale / color match only.
- **Desktop only:** no stacking breakpoint work, no hamburger. Playwright viewport 1280×800 remains the sitting class.
- **Parent spec still owns:** span overwrite rules, class toggle math, triplet ids, vocab membership, independence of the three stores.

## Testing Decisions

- **Good test:** Playwright on the isolated desk (`npm run test:e2e`). Assert sitting, not CSS grid pixel positions.
- **Must still work with no extra click:** class chip toggle (`aria-pressed`); **Write span** (phase form starts open); three headings `class`, `triplet`, `phase` in the viewport (card headers).
- **Must grow:** **Add row** after expanding the triplet card (form starts closed). Fold independence: open triplet, scrub, triplet form still open. Switching Clip resets to Q20 defaults.
- **Vitest:** fold defaults and “same Clip keeps folds / other Clip resets” in `deskStore` (or wherever the flags live). Toggle math and paths stay as today.
- **Do not test:** mask, keyboard, virtualized filmstrip, mobile widths, URL Frame index, Clip-list progress.
- **Keep:** Write-span is not an unstyled transparent button (parent ticket 07).

## Out of Scope

- mask, Track, Session, Predict, Propagate, canvas library (parent spec + ADR 0001).
- Task-focus / exclusive mode.
- Keyboard shortcuts, prev/next, range slider.
- Syncing phase from/to or the phase picker to the current Frame.
- Filmstrip virtualize; dots-instead-of-thumbs; class/triplet marks on thumbs.
- Frame index in the URL; fold state on disk.
- Draft / undo / Save; vocab delete/rename.
- Clip-list coverage; logins; per-labeler vocab (ADR 0004).
- shadcn/ui, copying `sam3_1_label_tool` pages, Next.js.
- Phone/tablet layout.
- Changing HTTP or JSON stores.

## Further Notes

- UI stack: [ADR 0001](../../docs/adr/0001-frontend-stack.md). This chrome: [ADR 0005](../../docs/adr/0005-desk-bench-chrome.md).
- Glossary: `CONTEXT.md` is **not** edited. “Task focus: Do not use” still means all Task types stay editable on the same Frame. Collapsible forms are not a glossary term.
- Tickets: `issues/01-full-viewport-bench.md`, `issues/02-collapsible-forms.md` (`ready-for-agent`). Frontier is 01. Do not implement unless asked.
- Next product slice for capability is still **mask** on the same Frame, beside these panels, not behind a mode. This spec must not invent a focus switch that mask would then inherit.
