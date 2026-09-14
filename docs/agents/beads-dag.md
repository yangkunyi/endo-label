# The beads-dag drain

Issues live in this repo's beads store, and the drain is how they get built. The tracker's own contract
is `docs/agents/issue-tracker.md`; this file is the operator's half — what to run, what it reads, and
what it leaves behind. It replaces the retired `matt-implement-tickets` pack.

The pack is global, not in this repo: `~/.archon/workflows/beads-dag`, a symlink into the
`beads-matt-dag` checkout, which `archon workflow list` shows as `beads-dag-drain` and
`beads-dag-execute`. Updating it is `git pull` in that checkout; the working tree there is what runs.

## Running one

From this checkout:

```bash
archon workflow run beads-dag-drain --detach
```

The run's nodes are bun scripts, so `bun` must be on the PATH of whatever launches it (`~/.bun/bin`,
exported by an interactive shell) — and the store path is pinned in `.scratch/beads-dag.yaml` for the
same reason. A run that cannot find `bd` fails at `open`, naming what it looked for and where.

`beads-dag-execute` is the per-issue executor, not an entry point — by hand it is
`--input issue=<feature>/<NN>`. **One drain at a time**: `open` takes a run lock
(`.git/beads-dag-run.lock`) and refuses a second run against this Target rather than waiting.

The Target's config is `.scratch/beads-dag.yaml`, and every key is optional:

```yaml
model:           # unset: the runner's own default
thinkingLevel: high
concurrency: 4
runner: pi       # or dsh
store: /data3/yky/.local/bin/bd   # unset: bd on PATH
```

`open` prints the effective configuration on stderr, one line per value and whether the config file or
the built-in default supplied it.

## What a run leaves behind

- `worktrees/<feature>-<NN>-<slug>` — one per issue, on branch `beads/<feature>/<NN>-<slug>`, removed
  once the merge into Main lands. Both names are derived from the issue's `handle` and `slug` metadata.
- `.beads/` — the store, committed to git, with `/.beads/interactions.jsonl` and `/worktrees/`
  gitignored.
- `refs/beads-dag/reviewed` — a local ref: the position the drain-end report measures from.
- In the Archon workspace, `artifacts/runs/<run-id>/`: `pick-exclusions.json`, `attempted-ids.json`,
  `run-lock.json`, `main-commits.json`, `repairs.json`, `review.md`, `summary.md`. **Read
  `summary.md` first**; it is the report, with the range section and the failures block.

An issue's state is never written to a document: the store holds status, edges and comments, and a body
under `.scratch/<feature>/issues/` is frozen at publication.

## Driving the store

```bash
bd ready --json --limit 0     # the frontier: open, unblocked, carrying the gate label
bd show <id>                  # the issue, its edges, its comments
bd list --all --json --limit 0
```

The gate is the `ready-for-agent` label — pulling it back is the brake, and `needs-info` is the label
that means a human answer is owed. `wontfix` is a label, never a closure. Once a Dolt remote is
configured (this repo's origin is), the one-command backup from the Target is:

```bash
bun ~/.archon/workflows/beads-dag/beads-dag-drain/backup.ts
```

The store is not committed to git — `.beads/embeddeddolt/` is ignored — so this push, to
`refs/dolt/data` on the origin, is the only copy off this machine. It is known to work from here.

## State of this repo's tracker

The store was initialised on 2026-09-14 (`bd init --prefix endo`) when the repo left the
`matt-implement-tickets` pack, and every body under `.scratch/<feature>/issues/` was published with it
(116 beads, 103 of them closed). A handle therefore names exactly one issue, and nothing under
`.scratch/` looks like a ticket without being one.

- Work that is in Main is a closed bead. The hand-delivered `pilot-ux` issues name their commit
  (`merged 8d55638`); a ticket from before the store existed names the commit that recorded its status
  — `merged (pre-store; status recorded at 5663405)` — because no merge commit names it.
- The live work is `pilot-ux/05`–`pilot-ux/12` and `multi-user/25`: gated, so they are the frontier.
  `multi-user/23` and `multi-user/24` are `needs-triage`, waiting on a product answer.
- The two wayfinder maps are open decision beads labelled `wayfinder:map`, with their documents at
  `.scratch/multi-user/map.md` and `.scratch/endo-label-product/map.md`; their children are decision
  beads too (`wayfinder:research|grilling|prototype`), all closed.
- Pre-store blocking edges were not migrated — those issues are closed, and an edge only ever gates
  work. The store's only edges are `pilot-ux/07` blocked by `pilot-ux/05`, and `pilot-ux/10` blocked by
  `pilot-ux/09`.

The old pack's Target configs (`.scratch/ticket-dag.yaml`, `.scratch/orchestrator.yaml`) are gone;
`.scratch/beads-dag.yaml` replaces them.
