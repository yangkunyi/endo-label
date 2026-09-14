## Agent skills

### Issue tracker

Issues live in this repo's beads store (`.beads/`), driven with `bd`; the prose stays as a frozen body under `.scratch/<feature>/issues/`, and identity, status, edges and comments are the store's. Never write state into a body. See `docs/agents/issue-tracker.md`.

### The drain

```bash
archon workflow run beads-dag-drain --detach
```

The pack is global (`~/.archon/workflows/beads-dag`), not in this repo; `beads-dag-execute` is the per-issue executor, not an entry point. See `docs/agents/beads-dag.md`.

### Triage labels

Default five roles: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

This tree is the endoscopic labeling product. Mask SAM code lives under `endo_label/mask/`. Phase, class, and triplet are sibling backends. Do not fold them into Session.
