# 04 — Full desk e2e closeout

**What to build:** Walk the desk with selected Library, row trash, no List, exact-triple Vocab, and cell rename. Adapt or retire assertions that assumed a folded List, three column vocabs, or delete-only-via-Remove-from. Confirm span paint (chip + Mark from / Apply / Remove, i/o/[ ] keys) still only paints an interval. Full suite (pytest, vitest, tsc, playwright) green.

**Blocked by:** 01 — Library is this-Frame toggle, Vocab trash, and rename; List is gone; 02 — Triplet Vocab is the table of exact triples; 03 — Double-click a Vocab triple cell rewrites desk-wide; collision refuses

**Status:** ready-for-agent

- [ ] List / three-column-vocab / cycling-delete assertions are gone or updated
- [ ] Span paint still works and does not delete a Vocab name
- [ ] Now stays read-only; Library selected and trash still work after span
- [ ] pytest, vitest, tsc, and playwright are green
