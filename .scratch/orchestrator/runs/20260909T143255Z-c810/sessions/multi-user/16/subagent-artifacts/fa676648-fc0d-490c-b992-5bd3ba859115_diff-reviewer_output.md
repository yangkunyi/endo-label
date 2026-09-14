**Standards (axis)** — HEAD `4ed6689b`; unstaged + untracked product files. No hard documented-standard breach.

Ticket 16: admin-only writes (create/rename/archive/enable/candidates/promote); no label rewrite; `/api/vocab` untouched. Matches AGENTS.md (sibling registry, not Session), CONTEXT Vocab name (stable id, Project subset, archive/disable not hard-delete), ADR 0026. CONTEXT “labeler adds candidates” / ADR reviewer enablement = later tickets; this slice follows ticket 16 “writes admin-only”.

### (a) Documented standards
None hard.

### (b) Baseline smells (judgement)

**Mysterious Name** — `endo_label/coordination.py` schema + `registry.py` `KINDS`:
```
kind TEXT … CHECK (kind IN ('phase', 'class', 'triple'))
```
Task type / `labels_store.KINDS` is `'triplet'`. CONTEXT: identity = “exact triple”, backend = triplet. Collision risk at ticket 18.

**Duplicated Code** — identity clump `(kind, name, instrument, verb, target)` in `vocab_registry` and `project_vocab_candidates`; twin dataclasses `RegistryItem`/`Candidate` + `as_dict`; `create_item`/`create_candidate` and `rename_item`/`edit_candidate` same connect-normalize-write shape.

**Repeated Switches** — `kind == "triple"` in `normalize_identity`, `_conflict_label`, `web/src/api.ts` `registryLabel`, `AdminVocab.tsx` create UI + rename body.

**Primitive Obsession** — `AdminVocab.tsx`:
```
const parts = draft.split("/").map((part) => part.trim());
return { instrument: parts[0] ?? …, verb: parts[1] ?? …, target: parts[2] ?? … };
```
Triple identity round-tripped as slash string. Breaks if a cell contains `/`.