# 12 — Test gaps from this feature

**What to build:** the pins the two grill rounds left behind. 01–04 landed by hand with the
existing suites green (`desk.spec.ts` + `mask-desk.spec.ts` 68 passed, backend 26 passed) but with
nothing asserting the new behaviour; 05–10 will arrive with the same gap unless it is ticketed.

e2e (`web/e2e/`):
- Track delete (01): the trash button asks, the row goes, and reopening the Session does not bring
  the Track (and its masks) back.
- Focus release (02): click a rail button, press Enter → the button does not fire again and
  `document.activeElement` is `body`; a menu/dialog trigger keeps its focus.
- Span keys (02): with focus inside a Vocab typeahead input, `[` marks and `]` paints and no
  bracket character lands in the field; `i`/`o` still type.
- Empty Brush (02): `[` with an empty Brush shows `Brush is empty — …`.
- Ruler progress (03): the fill's width tracks the Playhead, and is 0 at Frame 0.
- Coverage Strip (05) and mask row (06): gaps and covered Frames map to the stored labels; the
  strip follows Task focus; Predict/Propagate refresh the mask row.

Unit (vitest):
- The frame→gap/coverage mapping should be a pure function in a `.ts` module (the same complaint
  ticket 25 makes about `Home()`): pin it rather than the component.
- The `n` jump's next-frame search (07) including wrap and "nothing left".

Backend (`tests/`):
- `/api/clips`: `scope=mine` for a non-admin (assignee and reviewer rows), `scope=all` refused for
  a non-admin, admin default, project+tag+scope combined (08).
- Project membership (09): the backfill seeds from existing Assignments; a non-member is refused
  with the sentence for assign, auto-assign and reassign; config `members:` seeds a new Project and
  leaves an existing one alone.
- Batch assign (10): per-item results, mixed state selection, Reviewing/Done skipped with a reason.
- The 403 sentences (04): assert the wording for each Assignment state, since that text is now
  part of the product.

**Blocked by:** —

Status: ready-for-agent

- [ ] the five e2e behaviours from 01–03 are pinned
- [ ] the coverage/gap mapping and the `n` search are unit-tested
- [ ] the scope, membership and batch-assign rules have backend tests
- [ ] the refused-write sentences are asserted per state
