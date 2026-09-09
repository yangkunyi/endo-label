# 01 — Trash clears the Brush

**What to build:** Trashing a Vocab name (phase, class tag, or exact triple) drops that identity from its kind's Brush in the sitting store. The bottom-bar chip disappears immediately; only the matching kind and identity are removed; other kinds' Brushes stay. A failed trash request (HTTP error) leaves the Brush unchanged. An emptied Brush behaves like any empty Brush: Mark from / Apply / Remove and `i` `[` `o` `]` disabled. Trash does not touch the machine-local Lane-visibility store. Copy, ordering (Vocab order), ×-drop, and colors of surviving chips unchanged.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] Trash on a Vocab name that is in the Brush removes exactly that identity from the focused kind's Brush; the footer chip disappears without reload
- [x] Class, phase, and exact-triple trash each clear only their own kind's membership
- [x] Trash on a name not in the Brush leaves every Brush untouched
- [x] A failed trash request leaves the Brush exactly as it was
- [x] Brush emptied by trash disables Mark from / Apply / Remove / `i` `[` `o` `]` per the existing empty-Brush rule
- [x] Lane-visibility localStorage entries are not pruned or rewritten by trash
- [x] vitest: trash-drops-Brush-membership per kind; failed request keeps state; other kinds untouched
- [x] `tsc` green; full Playwright suite stays green (this ticket adds no browser assertions beyond the existing trash flows)

## Answer

The sitting store gained `trashBrush(identity, request)` (`web/src/deskStore.ts`): it awaits the trash request, then drops the identity from its kind's Brush via the existing `dropBrushIdentity` (membership by identity, surviving order untouched); a rejected request returns before any `set`, so the Brush is untouched. All three Vocab trash confirm handlers now go through it before refreshing Library data: `LibraryList` (phase and class paths) takes a `brushIdentity` prop so each editor supplies its own identity, and `TripletEditor.trashRow` builds the exact-triple identity. No HTTP, backend, footer, or empty-Brush changes — the footer chips read the store, so the dropped chip disappears on the next render without reload, and the existing `hasBrush` rule disables Mark from / Apply / Remove / `i` `[` `o` `]` on an emptied Brush. Lane-visibility state is never written by trash.

Validation: vitest 49 passed (6 new sitting-store cases: drop per kind with other kinds untouched, absent name no-op, failed request keeps state, Lane-visibility store untouched); `tsc -b --noEmit` exit 0; oxlint exit 0 (1 pre-existing warning, not in these hunks); Playwright desk suite 46 passed / 0 failed (exit 0, ~2.0m) on the isolated servers API `127.0.0.1:7891` + Vite `5191`; pytest 106 passed, 1 skipped (backend untouched).
