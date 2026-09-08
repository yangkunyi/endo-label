# Vocab: global registry with stable ids, per-Project enablement

ADR 0004 deferred multi-user; this decision comes from `.scratch/multi-user/map.md`. Multi-user breaks the one-desk vocab: different studies label different surgeries with unfixed label sets, and one labeler per desk no longer holds. We adopt the hybrid model from `.scratch/multi-user/research/vocab-taxonomy-approaches.md`: a global Vocab registry whose names are **stable ids** (the single identity source), each Project (one study, carrying a hospital field) enabling a subset, and project-local candidate words promoted into the registry by the admin. Label storage references ids, not strings, so a rename applies everywhere at once — the Label Studio string-residue behavior is the counterexample we are avoiding.

## Considered Options

- **Pure global vocab (status quo)** — rejected; unrelated words swamp the picker as studies accumulate, and every global rename/delete touches all studies.
- **Per-project vocab without a registry** — rejected; cross-study statistics lose the shared key and the same word drifts into per-project spellings.
- **Reviewers writing the registry** — rejected; global identity changes stay admin-only. Reviewers manage their project's word list (enable/disable, candidates).

## Consequences

- Supersedes ADR 0010 and ADR 0012 in authority and delete semantics: only the admin writes the registry; retiring a name means disabling it per Project or archiving it globally with labels kept; hard delete is only for zero-reference names. Rename-by-id keeps their rewrite-everywhere outcome.
- The durable key of labels changes from bare strings to ids — a data-format change that storage ticket 05 must carry; existing validation data will not be migrated (map Out of scope).
- Same source media registered under two Projects is two Clips; the Clip stays the labeling unit, the media is shared read-only.
