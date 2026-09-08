# 14 — Review flow

**What to build:** reviewer view (the queue of items assigned to them for review); opening an item = the same desk, with pass / reject buttons rendered from capabilities; pass → Done with reviewed_by/at recorded; reject → one short note, back to Labeling; after Done the annotator is locked out (re-review goes through the admin). The reviewer's direct label edits during review take the same path as the annotator's.

**Blocked by:** 12, 13.

**Status:** ready-for-agent

- [ ] compose seam: pass ends in Done with reviewed_by/at stored; reject ends in Labeling with the note stored and the assignee writable again
- [ ] compose seam: after Done the annotator's writes are refused; reviewer ≠ annotator is enforced at the entry point
- [ ] e2e: reviewer opens a submitted item, edits one label in place, passes it; the annotator's item flips to Done
- [ ] e2e: reject path — reviewer leaves a note, the annotator flow (13's banner) shows it
