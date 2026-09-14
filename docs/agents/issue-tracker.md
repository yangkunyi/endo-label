# Issue tracker: Beads

Issues for this repo live in a beads store — the repo's own `.beads/` database, driven by the `bd` CLI.
The issue's prose is a markdown file under `.scratch/`, frozen once published; its identity, status,
edges, labels and comments are the store's. One fact, one home: no state is ever written into a
document.

## Finding the store

- The store is the repo's own — the Target the drain runs against: `.beads/` beside that repository,
  never inherited from a parent directory. A repo with no store is initialised in it (`bd init --prefix
  <name>`) before a drain will open; the drain's preflight refuses one that is missing.
- The binary is resolved in one order, by the drain and by any skill that drives the store: the repo's
  `store:` key in `.scratch/beads-dag.yaml` first, then `bd` on `PATH`.

```yaml
store: /home/me/.local/node-v24.19.0-linux-x64/bin/bd   # optional; unset, bd is looked for on PATH
```

A `store:` that names something that is not an executable file fails the run rather than falling back
to `PATH` — an operator who set it meant it to be used.

## Conventions

- One feature per directory: `.scratch/<feature>/`
- The spec is a git document at `docs/specs/<date>-<slug>.md`, and a map is a git document too.
  Documents never live in the store, and are never issues.
- Implementation issues are one **body file** per issue at `.scratch/<feature>/issues/<NN>-<slug>.md`,
  numbered from `01` — never a single combined tickets file. The issue itself is a bead in the store.
- The body carries the handle and the prose, and nothing about state: **no `Status:` line, no blocker
  list, no comment thread**. State moves in the store, not in the file.
- Comments and conversation history append to the issue in the store (`bd comment`), never to the body.

## Identity: the two metadata keys

A bead's hash id is its identity in the store; its human-readable identity is metadata:

| Key | Value |
| --- | --- |
| `handle` | `<feature>/<NN>`, e.g. `auth/02` |
| `slug` | the one path segment the names end with |

Every git name is derived from those two keys, by the drain and by a hand-run alike:

```
branch    beads/<feature>/<NN>-<slug>
worktree  worktrees/<feature>-<NN>-<slug>
body      .scratch/<feature>/issues/<NN>-<slug>.md
```

A name is computed, never discovered: nothing scans `worktrees/` for a candidate, and the bead's id
never appears in git. An issue missing either key cannot be named in git, and the drain fails that issue
rather than starting work somewhere unnamable.

## Statuses

Three, all the store's own — one value at a time:

| Status | Who writes it | Meaning |
| --- | --- | --- |
| `open` | `/to-tickets` at publication, or the orchestrator recording a failed attempt | waiting; blocked-ness is a separate, derived fact |
| `in_progress` | the claim | running; out of every frontier until it is released or closed |
| `closed` | the orchestrator, only as `merged <branch>` | the work is in Main |

`BLOCKED` and `READY` are **derived** by the store (blocked is "a blocker is not closed"; ready is
`open` and not blocked) — nothing writes them. `MERGING`, `CONFLICT`, `RESOLVING` and `FAILED` do not
exist: merging and conflict resolution are steps inside a running issue, and a failure is an event, not
a status (below).

## When a skill says "publish to the issue tracker"

Write the body and create the bead:

1. Write the body file at `.scratch/<feature>/issues/<NN>-<slug>.md` — the handle and the prose, no
   state of any kind.
2. Create the bead with both metadata keys and the gate label:

```bash
bd create "<title>" --type task --silent \
  --metadata '{"handle":"<feature>/<NN>","slug":"<slug>"}' \
  --labels ready-for-agent
```

3. One store edge per `Blocked by` entry, with the blocker blocking the dependent:

```bash
bd dep add <blocked-id> <blocker-id>        # default type: blocks
```

Publication writes no initial status: `bd create` opens the issue, and a blocker is an edge rather than
a value, so the store derives readiness by itself. Metadata is written here, at publication, and read
back with `bd show <id> --json` or `bd list --metadata-field handle=<handle> --all --json --limit 0`.

## The frontier and the claim

A drain asks the store what can start **once per `pick` cycle** and takes each cycle's answer whole; the
run loops `pick` until a cycle comes back empty (`[]`):

```bash
bd ready --json --limit 0      # --limit 0 is everything; the store's default cap is 100
```

`bd ready` is the store's own answer — `open`, unblocked, not deferred, not pinned, not hooked — and the
store re-derives it on every read. A `blocks` edge withholds its dependent only while a blocker is not
`closed`, so a blocker closed inside the run releases the dependent into that run's next `pick` cycle,
where the same run can claim it. Holding a dependent back for a later drain takes the brake — the gate
label off the issue ("Labels: the gate and the brake") — because the edge withholds nothing once the
blocker is closed.

On top of that answer a drain applies the three rules the store cannot hold — and applies them itself,
so its exclusion report can name the rule per issue:

- **the decision type**: an issue of type `decision` (alias `adr`) is a question, never work, and never
  enters a drain;
- **the gate**: an issue without `ready-for-agent` is not the drain's work;
- **this run's attempts**: an issue this run already tried is kept out by the run's own
  `attempted-ids.json`, bookkeeping that lives beside the run and never in the store.

What is left is truncated to the run's `concurrency` and claimed in a single transaction:

```bash
printf 'update <id> status=in_progress\n' | bd batch
```

`bd batch` is all-or-nothing: a claim that fails part-way leaves nothing claimed. The claim is the
status — `in_progress` is what takes an issue out of every other drain's ready answer — and a hand-run
implementer writes the same thing first:

```bash
bd update <id> -s in_progress
```

A drain-launched worker runs with the store in its read-only mode (`BD_READONLY=1`): the store refuses
every write for its whole process tree, a claim included, while reads keep working. Issue state is the
orchestrator's to write.

## Labels: the gate and the brake

The five triage roles are label strings, one role at a time. `ready-for-agent` is the gate: only a
gated issue enters a drain's frontier, and publication applies it. Moving an issue to another role
replaces the gate label:

```bash
bd update <id> --add-label needs-info --remove-label ready-for-agent
```

That move — the **brake** — pulls the issue out of the frontier from every side: fresh work, a retry,
an issue that was eligible before. It is store state, so no drain has to remember it, and `needs-info`
means exactly "waiting on a human answer". `wontfix` is a label, never a closure: the issue stays
`open`, and whatever waits on it stays blocked.

## Closing, and failure

Only the orchestrator closes an implementation issue, and only to mean the work is in Main:

```bash
bd close <id> --reason "merged <branch>"    # only after that branch's merge landed
```

The merge into Main happens first and the `closed` second (**merge before stamp**), so a closure always
has its merge commit behind it, and a reader can check the reason against git. Closing releases
whatever waits on the issue, which is why nothing else may close it and no other reason may be used.

A **failed attempt is an event, not a status**: nothing closes, the reason becomes a comment, and the
issue returns to `open`:

```bash
bd comment <id> "attempt N failed: <reason>"
bd update  <id> -s open
```

Its dependents stay blocked exactly where they were (nothing merged), and the retry channel is the
store's own ready answer: the next drain finds the issue like fresh work. There is no retry command and
no `failed` status. `attempt N` is the ordinal — one plus the failures already on the issue — so the
comments read as a history. A run killed between the merge and the record leaves the issue
`in_progress`; the next open repairs it from **git**, never from the store, writing the same close or
the same failure event.

A comment is also where anything written after publication goes — a triage brief, a later question, an
answer. The body is frozen; the conversation is the store's.

## Closure never crosses domains

Implementation issues and decision issues are two domains, and a blocking relation between them would let
a decision's closure release implementation work that was never built. So an implementation issue may only
wait on another implementation issue; a decision issue is reached by changing an issue, not by a blocking
relation. Blocking is not only the `blocks` edge: the `parent-child` relation is blocking too — a child
inherits its parent's blocked-ness — so the drain refuses while an implementation issue's **blocking
ancestry**, through either relation and at any depth, reaches a decision issue. It names the chain, from
the implementation issue to the decision issue — at `open`, before anything is claimed or repaired, **and
again at each claim** (`pick`), because a question can be answered while the drain is running and that
close releases its dependent into the very next cycle. So a run can fail **after** its open: the cycle
that reads the chain claims nothing and exits non-zero with no token, the run stops there, and what its
earlier cycles merged stays merged. Removing the crossing edge is the operator's act, never the drain's —
`bd dep remove` removes either relation, and `bd update <id> --parent ""` unparents a child:

```bash
bd dep remove <dependent> <blocker>
```

## When a skill says "fetch the relevant ticket"

The user normally passes the handle (`auth/02`) or the bead's id; read the body from its derived path,
and read state — status, labels, comments — from the store:

- **By handle**: `bd list --metadata-field handle=<handle> --all --json --limit 0` — a handle names
  exactly one issue, and `--all` finds it at any age.
- **By id**: `bd show <id> --json`.
- **By label**: `bd list --label <role> --status open --json --limit 0` — the open issues carrying a
  triage role label; `bd list --no-labels --status open --json --limit 0` is the untriaged read, the
  open ones carrying none. `--status open` is pinned rather than left to the store's default, which
  hides only `closed` — claimed work is not a triage queue either. `/triage` discovers its buckets
  with these; the drain's frontier is not one of them — `pick` asks for the unfiltered `bd ready` and
  applies the gate rule itself ("The frontier and the claim").
- **Blocked**: `bd blocked --json` — the issues a blocker is holding back, each naming the blockers it
  waits on (`blocked_by`). It takes no `--limit`, so the ready row's `--limit 0` does not carry over.
- **Comments**: `bd comment <id> "<text>"` writes one; `bd comments <id> --json` reads them back.
- **Transitions**: `bd history <id>` is the store's record of every status change. Git carries the
  merge commits and nothing else about state; there is no copy of the transitions in git, so the store's
  backup is not optional.

## Backing the store up

```bash
bd dolt remote add <name> <url>     # once per repo
bd dolt push                        # the pack's one-command backup, run from the repo
```

After a restore or a pull, recompute the store's derived blocked-ness (`bd recompute-blocked`); `bd
ready` trusts the stored flag, and a stale flag silently hides or surfaces work.

## Where a run's artifacts live

A drain writes views, never state: everything it produces lives in the run's `ARTIFACTS_DIR` (Archon's
per-run directory, e.g. `~/.archon/workspaces/_local/<repo>/artifacts/runs/<run-id>/`), and no node
consults one as the truth.

| Artifact | Holds |
| --- | --- |
| `review-base` | the base of the range it reports on: the position the last review reached (the Target's `refs/beads-dag/reviewed`), or Main's tip when it has none |
| `review.md` | the reviewers' findings for that range |
| `summary.md` | the one report a human reads first |
| `pick-exclusions.json` | the issues the store offered in the run's **last** `pick` cycle and the frontier left out, with the rule that excluded each |
| `attempted-ids.json` | the ids this run claimed — run bookkeeping, never store state |

The store is not committed and neither are the artifacts; the bodies under
`.scratch/<feature>/issues/` are. Nothing in a run's artifacts is ever copied into the store or into
git as a record.

## Wayfinding operations

Used by `/wayfinder`. The **map** and its exploration are git documents; the **child issues** are beads
of type `decision`.

- **Map**: one issue of type `decision` labelled `wayfinder:map`, its Notes / Decisions-so-far / Fog in
  a git document.
- **Child issue**: a bead of type `decision`, labelled `wayfinder:<research|prototype|grilling|task>`,
  with the question as its body file at the handle path — the same body convention as an
  implementation issue. A decision issue never enters a drain.
- **Blocking**: the same `blocks` edges (`bd dep add`); an issue is unblocked when every issue blocking
  it is closed.
- **Frontier**: the `decision`-typed issues in the store's ready answer, minus the claimed ones; first
  in map order wins.
- **Claim**: `bd update <id> -s in_progress`, and record the driving dev with the store's assignee
  field (`bd update <id> --assignee <dev>`) — for a decision issue that assignee is the claim a
  concurrent session reads.
- **Resolve**: `bd comment <id> "<answer>"`, then `bd close <id>`, then a context pointer (gist + link)
  in the map's Decisions-so-far. A decision issue's `closed` means its question is answered, which is
  legitimate only because the two domains never share an edge.
