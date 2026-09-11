# 22 — Playwright closeout

**What to build:** the remaining multi-user Playwright run after product tickets 11–21 are on Main. Isolated e2e sitting (`7881` / Vite `5174` / worker-down `7893`). This is the only remaining Ticket that runs `npm run test:e2e`. Add or adapt `web/e2e` specs for the scenarios below. Existing desk specs stay green.

**Blocked by:** 15, 20, 21.

Status: READY

- [ ] e2e: admin assigns on the board → annotator's desk becomes writable; board row states match the lists
- [ ] e2e: a full round on the board — assign → submit → assign reviewer → pass / reject
- [ ] e2e: an annotator sees only their own items; label → submit → recall; reject banner shows the note; 409 two-tab recover
- [ ] e2e: reviewer opens a submitted item, edits one label in place, passes it; annotator item flips to Done; reject path shows the note
- [ ] e2e: admin creates an account → new user logs in and changes password → logs out; delivered marker shows on the row
- [ ] e2e: all three `/admin/vocab` areas operable end to end
- [ ] e2e: annotator picker shows only enabled words; creating a candidate lands in the queue; vocab editing hidden from annotator, visible to reviewer/admin
- [ ] e2e: Session auto-open/resume/"inferring" hint smoke (fake instant inference)
- [ ] e2e: two browser contexts — A rejects, B's task list updates without a refresh
- [ ] e2e: full desk suite green after ClipDesk panel extraction
