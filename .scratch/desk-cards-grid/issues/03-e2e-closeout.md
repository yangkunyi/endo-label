# 03 — Full desk e2e closeout

**What to build:** Update and extend the Playwright browser test suite (`web/e2e/desk.spec.ts`) to cover the Editor Cards architecture, micro-headers with count badge pills, calm empty states, soft semantic selection with right checkmark indicators, Triplet vertical hairline grid, in-cell double-click editing, and Add Vocab card footers across Phase, Class, and Triplet task focus. Verify all existing workflows (span painting, keyboard shortcuts `i`/`o`/`[`/`]`, Clip switching, and desk-wide rename/delete) remain fully green.

**Blocked by:** 01 — Dual Editor Cards and soft Library selection, 02 — Triplet hairline grid, in-cell edit, and Now capsule.

**Status:** resolved

- [x] Playwright tests verify Now and Library Editor Cards with micro-headers and count badges on Phase, Class, and Triplet
- [x] Playwright tests verify calm empty state messages (`No labels on frame N`) on unannotated frames
- [x] Playwright tests verify selected Library rows show checkmark icons and correct selection attributes
- [x] Playwright tests verify Triplet hairline grid structure and in-cell double-click rename without column shifts
- [x] Playwright tests verify Add Vocab inputs inside Library Card footers add items and update count badges
- [x] Full Playwright test suite (`web/e2e/desk.spec.ts`) passes with 0 failures
- [x] Vitest test suite (`pnpm test`) passes with 0 failures
- [x] TypeScript compiler (`tsc`) passes with 0 errors
- [x] Backend test suite (`pytest`) passes with 0 failures
