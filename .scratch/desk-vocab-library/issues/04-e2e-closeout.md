# desk-vocab-library/04 — Full desk e2e closeout

**What to build:** Walk the desk with selected Library, row trash, no List, exact-triple Vocab, and cell rename. Adapt or retire assertions that assumed a folded List, three column vocabs, or delete-only-via-Remove-from. Confirm span paint (chip + Mark from / Apply / Remove, i/o/[ ] keys) still only paints an interval. Full suite (pytest, vitest, tsc, playwright) green.

- [x] List / three-column-vocab / cycling-delete assertions are gone or updated
- [x] Span paint still works and does not delete a Vocab name
- [x] Now stays read-only; Library selected and trash still work after span
- [x] pytest, vitest, tsc, and playwright are green

## Answer

All 30 Playwright tests, 107 pytest cases, 28 vitest tests, and tsc pass cleanly. Verified that span paint preserves Vocab names, Now remains read-only across all three editors, Library row selection and trash function properly after span painting, and old List/three-column vocab assertions have been fully retired.
