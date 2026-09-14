# multi-user/25 — Closeout minors and test gaps

**What to build:** the smaller findings the 22 closeout review left behind.

Code:
- `endo_label/coordination.py` — the config tag sync is additive-only (`if tags:` before the delete/rewrite), so a tag dropped from `config.yaml` stays in `clip_tags` and keeps matching `/api/clips?tag=` and the board filter.
- `web/src/AppShell.tsx` — the nav "Desk" link points at `/`, which `App.tsx` renders as My Tasks for exactly the accounts (annotator/reviewer) that see the link.

Tests:
- `web/src/desk/vocabControls.ts` has no test at all and it is the only testable seam for the scoped picker (`vocabControlsOf`, `pickerItemFor`, `ensureVocabName`'s revalidate-not-inject contract — the sibling rename path in `VocabLibrary.tsx` had the same bug and it went unnoticed).
- `nowFillStyle` (`web/src/editorCards.ts`) is untested while its neighbours are covered.
- `Home()`'s annotate/review → My Tasks routing is new behaviour with no test, and cannot be one while it lives in a `.tsx`; a pure predicate in a `.ts` module would make it pinnable.
- `EventBroker` fan-out to several subscribers at once is unverified (`tests/test_workflow_push.py` only ever opens one stream).
- Uncovered branches: `/api/me`'s 404 for an unknown Clip+Task type, `registry_router.get_visible`'s `400 "project_id is required"`.

- [ ] dropping a tag from `config.yaml` removes it from `clip_tags`
- [ ] the Desk nav link lands on the desk, not My Tasks
- [ ] `vocabControls.ts` and `nowFillStyle` have unit tests
- [ ] the Home routing predicate is testable and tested
- [ ] a transition reaches two concurrent SSE subscribers
- [ ] the two 404/400 branches are exercised
