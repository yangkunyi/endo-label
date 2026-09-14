# desk-workbench/01 — Single-page HeroUI workbench

**What to build:** The labeler uses one desktop workbench for Clip selection, Frame viewing, and phase, class, and triplet editing. The root route shows the workbench with an allowlisted Clip rail and an empty center; opening a Clip changes the URL without unloading the shell. The current JPEG is contained in the center, the right rail keeps all three editors available, and the bottom slider changes the current Frame without writing labels.

- [x] `/` and `/clips/:clipId` mount the same workbench shell, with a clear empty state before a Clip is selected
- [x] The left rail lists only allowlisted Clips with Frame counts, supports scrolling, and contains no Frame thumbnail strip or coverage percentage
- [x] Selecting a Clip updates the URL, preserves the shell, opens Frame 0 (or the remembered index for that Clip in the sitting), and shows its JPEG
- [x] The center JPEG uses contain behavior and is never cropped; the slider scrubs only valid indexes from `0` through `N-1`
- [x] Class, triplet, and phase editors remain visible together in that order, with existing chevrons, summaries, and current-Frame writes still working
- [x] The desk uses HeroUI and lucide visual components without adding shadcn, mask tools, Session controls, or Task-focus
- [x] Compose and browser tests verify Clip opening, URL change, slider scrubbing, contained JPEG display, editor presence, and absence of the Frame filmstrip

## Answer

The root route and `/clips/:clipId` now share one HeroUI workbench. The left rail lists allowlisted Clips, the center has an empty state or contained JPEG, and the bottom range input scrubs the current Frame without writing labels. The per-Clip index remains in Zustand for the sitting, while the URL identifies the open Clip. Editor cards retain class → triplet → phase order, folds, summaries, and current-Frame writes.

Verification: `npm test`, `npm run build`, and `npm run test:e2e` pass.
