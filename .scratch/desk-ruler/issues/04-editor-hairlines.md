# 04 — Hairlines between Now, Library, and List

**What to build:** The focused editor shows a hairline between Now and Library, and between Library and the vocab List. Existing uppercase headings stay. No cards, no extra shadow. Same treatment for phase, class, and triplet. Playwright: sections are divided without a Card.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] Hairline between Now and Library
- [x] Hairline between Library and List
- [x] No Card wrapper around those sections
- [x] Headings Now / Library stay
- [x] Playwright does not require a Card

## Answer

Native `<hr>` hairlines in class, phase, and triplet editors: one between Now and Library, one between Library (+ add) and List. Uppercase Now / Library headings unchanged. No Card, no extra shadow. Playwright checks two separators sit between those labels without requiring a Card.
