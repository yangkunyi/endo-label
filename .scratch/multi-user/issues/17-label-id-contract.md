# 17 — Label id migration (contract)

**What to build:** label file content switches from bare strings to registry id references (existing validation data is not migrated — see spec Out of Scope); a rename writes only the registry row and every read endpoint reflects it immediately; delete = archive (labels kept), hard delete refused for referenced names and allowed for zero-reference ones; typeahead semantics kept (drawn from existing triples); `test_compose` vocab assertions migrated to the new semantics; the multi-file rename/delete rewrite transactions in the labels store are deleted.

**Blocked by:** 16.

Status: BLOCKED

Do not run `npm run test:e2e`. Playwright for this drain is ticket 22.

- [ ] compose seam: after a rename, the old id reads back with the new name at every endpoint, with no label-file rewrites
- [ ] compose seam: after archiving, historical labels are kept and the picker set no longer offers the word; hard delete of a referenced name refused, zero-reference allowed
- [ ] spot assertions: no bare-string words remain in label files
- [ ] all existing behavior tests green under the new semantics (triple uniqueness, paint span, class stacking included)
