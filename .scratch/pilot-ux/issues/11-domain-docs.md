# pilot-ux/11 — Domain docs for these decisions

**What to build:** the vocabulary and the two decisions that need a record, written down the
moment they were settled rather than after the code (the code for 05–10 depends on these words).

`CONTEXT.md`:
- **Ruler** — the clause "directly under the picture" is now false (the transport sits between it
  and the picture): reword to "directly under the transport row", and allow the played-span fill
  (the seek track shows how far the Playhead has come) while keeping `_Avoid_: progress bar` for
  the *completion meter* reading. Still not a label lane.
- **Coverage Strip** (new) — a thin read-only band over the Lane well: which Frames carry at least
  one identity of the focused Task type, gaps for the Unlabeled runs, click seeks. Not a Lane, not
  completion, not a Review state.
- **Unlabeled gap** (new) — a maximal run of Frames with no identity of that Task type.
- **Track lane** (new) — one row per Track, spans = Frames that Track has a mask on. Read-only;
  mask is not a Task focus tab.
- **Project membership** (new) — the explicit relation between an Account and a Project; it gates
  who may be assigned work in that Project. `_Avoid_: deriving membership from assignment history;
  membership as a permission on reads`.

`docs/adr/`:
- `0028-project-membership.md` — why explicit membership, why it gates assignment, why config
  seeds once and the database owns it afterwards (a UI edit must not be reverted by a restart).
- `0029-coverage-is-not-completion.md` — why coverage is "has ≥1 identity" with no Frame-level
  "checked, nothing here" record, why Submit stays unblocked, and what would have to change to add
  a cleared bit later.

- [ ] `CONTEXT.md` carries the four new terms and the corrected Ruler clause
- [ ] no `CONTEXT.md` entry describes implementation detail
- [ ] ADR 0028 records the membership decision and its rejected alternative
- [ ] ADR 0029 records why coverage is not completion, and names the deferred cleared-bit idea
- [ ] each new term has an `_Avoid_:` line
