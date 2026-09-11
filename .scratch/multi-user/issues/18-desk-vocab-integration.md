# 18 — Desk vocab integration

**What to build:** the picker offers only the current Project's enabled words (enabled global words + this Project's candidates); a "create candidate word" entry in the desk (annotator-usable, lands in the promotion queue); vocab editing controls hidden from annotators (the retraction UI; visible to admin/reviewer); typeahead wired to the new registry semantics.

**Blocked by:** 13, 17.

Status: MERGING

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: picker set is this Project's enabled words plus its candidates; candidate create lands in the promotion queue
- [ ] compose seam: permission matrix for candidate creation and vocab editing (role × action)
