# pilot-ux/18 — The holes next to the filter fix

**What to build:** the three smaller surviving findings of the closeout review on `pilot-ux/13`.

**1. The focus guard cannot see the control's own label (medium-low).** `web/src/ClipDesk.tsx:34-37`
releases focus after a click on `button`, `[role='button']`, `[role='radio']` or `input[type='checkbox']`
— but the desk rail renders its scope toggle as a `<label>` wrapping the checkbox
(`web/src/desk/ClipRail.tsx:32-44`), so clicking the "Every Clip (admin)" text leaves focus on the
control and `isEditableTarget` (`web/src/desk/keyboard.ts:4-7`) then makes Space toggle the scope instead
of the transport. That is the defect the guard was widened for, alive one click away. Widen it to the
click's effective control (follow a `label` to its control, or match the label itself inside the rail)
and pin the predicate as a pure function — `ClipDesk.tsx` has no test seam, and a pure predicate is how
this repo pins its other surface rules.

**2. `tags: ""` clears a Clip's tags (low).** `config._parse_tags` (`endo_label/config.py:140-152`) sends
an empty string down the string arm, so it becomes an empty tuple: a statement, after which
`register_clip` (`endo_label/coordination.py:895-899`) clears `clip_tags`. Its own docstring and ADR 0028
say a statement is a *list* (`tags: []`) or one or more `--tag`, and that a key with no opinion leaves the
store alone — so `tags: ""` means no statement, and an empty `--tag` value follows the same rule.

**3. The refusal branch lost its pin (test gap).** 13 deleted the e2e assertion that a Clips surface
renders the server's refusal sentence, leaving that branch unasserted. The browser stack is the owner's
(`AGENTS.md` → Verification) and `web/src/clipFilterSurfaces.test.ts` is the seam that already renders
these surfaces — pin it there.

Acceptance:

- [ ] clicking the "Every Clip (admin)" text releases focus, and Space still drives the transport afterwards
- [ ] the focus guard's predicate is a pure function with a vitest test
- [ ] a config Clip entry with `tags: ""` leaves the store's tags alone while `tags: []` still clears them, both pinned by pytest
- [ ] the Clips surfaces' refusal sentence has an in-process pin again
