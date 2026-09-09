# Archon ticket drain

Pack lives in `~/.archon/workflows/matt/` (global). This repo does not keep workflow yaml.

Matt skills still own per-ticket coding. Archon owns the dispatcher. Do not run Archon drain and `/implement-tickets` together. `/implement-tickets` is removed.

Do not use bundled `archon-idea-to-pr`, `archon-piv-loop`, or `archon-interactive-prd` as a stand-in for `/wayfinder`.

## Command

From the checkout you want (this tree's `.scratch/`):

```bash
archon workflow run matt-implement-tickets
```

Optional `--input feature=multi-user`. Optional `--input verify='python -m pytest tests -q'`. Empty verify skips tests.

Provider is `pi`. Do not pass `--branch`. Working tree must have no **tracked** dirty files.

Empty emit skips drain. Seal still runs (`all_done`) so leftover `merged` is sealed.

Status names live in `ticket_meta.py`: `ready-for-agent` → `claimed` → `merged` → `resolved` | `failed`. Seal is feature-scoped: that feature’s `merged` tickets become `resolved` (or `failed` if verify fails). Only this emit’s still-`claimed` tickets become `failed`. Parent `ok` follows verify.

## Gitignore

```
.archon/workflows/matt/ticket-dag/
```

Runtime cache only. See `~/.archon/workflows/matt/README.md`.
