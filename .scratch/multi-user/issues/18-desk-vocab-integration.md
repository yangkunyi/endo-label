# 18 — Desk vocab integration

**What to build:** the picker offers only the current Project's enabled words (enabled global words + this Project's candidates); a "create candidate word" entry in the desk (annotator-usable, lands in the promotion queue); vocab editing controls hidden from annotators (the retraction UI; visible to admin/reviewer); typeahead wired to the new registry semantics.

**Blocked by:** 13, 17.

Status: MERGING

- [ ] e2e: annotator picker shows only enabled words; creating a candidate lands in the queue; vocab editing controls invisible
- [ ] e2e: reviewer/admin see the vocab editing controls and can operate them
- [ ] compose seam: permission matrix for candidate creation and vocab editing (role × action)
