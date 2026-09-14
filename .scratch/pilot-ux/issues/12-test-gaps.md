# pilot-ux/12 — Test gaps from this feature

**What to build:** the in-process pins the two grill rounds left behind. 01–04 landed by hand with the
existing suites green but with nothing asserting the new behaviour, and 05–10 arrive with the same gap
unless it is ticketed.

The browser side of this ticket is dropped: the desk behaviours of 01–03 (Track delete, focus release,
the span keys while an input has focus, the empty-Brush notice, the Ruler's progress fill) and the
Coverage Strip / mask row of 05–06 are hand-verified by the owner in the pilot after the drain. Do not
add Playwright specs and do not run the e2e stack here — see `AGENTS.md` → Verification. A behaviour
worth pinning is pinned in-process instead.

Unit (vitest):
- The frame→gap/coverage mapping should be a pure function in a `.ts` module (the same complaint
  ticket 25 makes about `Home()`): pin it rather than the component.
- The `n` jump's next-frame search (07) including wrap and "nothing left".
- The mask summary → Track-lane spans mapping (06).

Backend (`tests/`):
- `/api/clips`: `scope=mine` for a non-admin (assignee and reviewer rows), `scope=all` refused for
  a non-admin, admin default, project+tag+scope combined (08).
- Project membership (09): the backfill seeds from existing Assignments; a non-member is refused
  with the sentence for assign, auto-assign and reassign; config `members:` seeds a new Project and
  leaves an existing one alone.
- Batch assign (10): per-item results, mixed state selection, Reviewing/Done skipped with a reason.
- The 403 sentences (04): assert the wording for each Assignment state, since that text is now
  part of the product.

- [ ] the coverage/gap mapping, the `n` search and the mask spans mapping are unit-tested
- [ ] the scope, membership and batch-assign rules have backend tests
- [ ] the refused-write sentences are asserted per state
- [ ] no Playwright spec was added and the e2e stack was not run for this ticket
