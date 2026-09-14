Implemented ticket 16 Vocab registry (DB + `/api/registry` + `/admin/vocab`) and committed.

Changed files: `endo_label/app.py`, `endo_label/auth.py`, `endo_label/coordination.py`, `endo_label/registry.py`, `endo_label/registry_router.py`, `tests/test_registry.py`, `web/src/AdminVocab.tsx`, `web/src/App.tsx`, `web/src/AppShell.tsx`, `web/src/api.ts`, `web/src/api.test.ts`.

Validation: `.venv/bin/pytest -q` — 167 passed, 1 skipped, 2 warnings in 71.20s.

Open risks/questions: none for this commit step.

Recommended next step: parent can treat the branch as committed and continue review/drain.

**pytest:** 167 passed, 1 skipped (71.20s). Green, then committed.

**commit:** `6c0678bdb2487ef1927a3be967315604d104e609`  
`feat: add Vocab registry, per-Project enablement, and /admin/vocab`

**status:** working tree clean, branch `ticket/multi-user/16-vocab-registry-expand`

**files in commit:**
```
endo_label/app.py             |   2 +
endo_label/auth.py            |   7 +
endo_label/coordination.py    |  31 ++-
endo_label/registry.py        | 446 ++++++++++++++++++++++++++++++++++++++++++
endo_label/registry_router.py | 221 +++++++++++++++++++++
tests/test_registry.py        | 222 +++++++++++++++++++++
web/src/AdminVocab.tsx        | 446 ++++++++++++++++++++++++++++++++++++++++++
web/src/App.tsx               |   2 +
web/src/AppShell.tsx          |  18 +-
web/src/api.test.ts           |  42 ++++
web/src/api.ts                |  89 +++++++++
11 files changed, 1519 insertions(+), 7 deletions(-)
```

Ticket Status line was not touched. No extra files staged.