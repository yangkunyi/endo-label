# pilot-ux/18 — The holes next to the filter fix: implementation notes

The issue body (`issues/18-the-holes-next-to-the-filter-fix.md`) is frozen; this file is the working
record of what landed, the three decisions the findings left open, and what is left for the owner's
hand-verification.

## 1. The focus guard now reads the click's *effective* control

`web/src/desk/focusGuard.ts` (new) holds the rule as a pure function, `controlToBlur(clicked)`, over
`GuardedElement` — as much of an element as the guard reads (`tagName`, `getAttribute`,
`parentElement`, a label's `control`, `blur`). `ClipDesk.tsx`'s `onPointerUp` handler is now
`controlToBlur(target)?.blur()`, so the desk keeps no second copy of the rule.

Two things the old `closest('button, [role=button], [role=radio], input[type=checkbox]')` could not
see:

- **A `label` is its control.** The rail's scope toggle is `<label><input type="checkbox">Every Clip
  (admin)</label>`: a click on the words lands on the *label*, and the browser puts focus on the
  input the label names — so the guard has to follow the label, not just look for the input. This is
  the whole of finding 1.
- **A control is not always the element under the pointer**, and a menu/dialog/popup owns the focus
  of everything inside it. The old code checked that with `closest` on the owner selectors *before*
  it looked for a control; the walk keeps that priority (owner anywhere up the chain beats a control
  nearer), which is why it is two passes and not one.

Decisions:

1. **The predicate is over a structural element, not a DOM element.** This repo has no DOM test
   environment (`clipFilterSurfaces.test.ts` says so in its header) and adding one is not this
   ticket's business. A real `HTMLElement` satisfies `GuardedElement` as it stands — `tsc` accepted
   `controlToBlur(target)` with no cast — while `focusGuard.test.ts` builds the elements it wants to
   pin as plain records, so "clicking the words beside the checkbox releases the checkbox" is a
   vitest assertion and not a Playwright one.
2. **A label is followed only to a control that would hold a desk key.** A `<label>` naming a
   `<select>` or a text input is *not* one: clicking the "Project" label must leave the field
   focused. Those fields are already `isEditableTarget`, so the transport was never theirs to
   intercept; blurring them would only take focus away from a field the click just focused.
3. **The owner selectors are unchanged** (`dialog`, `menu`, `listbox`, `aria-haspopup`). The ticket
   is about who the click's control is, not about which containers own focus.

## 2. `tags: ""` states nothing

`_parse_tags` (`endo_label/config.py`) reads the comma-separated string form into the tags it names
and returns `None` when it names none — the same silence as an absent key. So a config Clip entry
with `tags: ""` leaves `clip_tags` alone on every boot, while `tags: []` (a list, stated in full)
still clears it.

Decisions:

1. **A non-empty string is still a statement.** The string arm is the convenience form mirroring
   `members:` and `clip_allowlist:`; making *all* strings silent would leave `tags: "west"` quietly
   untagging nothing and, worse, would leave a tag the admin removed from the file in the store.
   Only a string that names no tag is silent. Pinned both ways in the test.
2. **`--tag ''` still clears — the CLI is not changed.** "An empty `--tag` value follows the same
   rule" is read as the rule *inside* a stated list: the list is stated in full, and a blank entry
   in it names no tag, which is how the CLI's only clearing gesture works (`--tag ''`, documented in
   `register-clip --help` and pinned by `test_register_clip_cli_states_tags_only_when_it_is_given_some`
   from ticket 14). Reading it as "an empty `--tag` is no statement" would leave the CLI with no way
   to clear tags at all, and no acceptance criterion asks for it. ADR 0028 gained a sentence for the
   blank-value side of the same rule.
3. **The seam is the boot, not `_parse_tags`.** The pytest pin boots a sitting twice with a blank
   `tags:` after an API `PUT .../tags` write, which is the behaviour the finding is about; the helper
   `_sitting_with_tags` now writes the string form for a `str` argument (so `""` reaches YAML as
   `tags: ""`) and keeps the list form for a list.

## 3. The refusal branch has its in-process pin again

Ticket 13 deleted the Playwright assertion that a Clips surface renders the server's own refusal
sentence, and the browser stack is the owner's, so the pin lives in the seam that already renders
these surfaces: `web/src/clipFilterSurfaces.test.ts`.

A refusal is a request's *error*, and SWR keeps an error in a cache entry — a fallback is data, so
`refused(message)` seeds the cache entry for the selection the surface asks with (via `SWRConfig`'s
`provider`) and no fallback entry for it. The surfaces' own error branches then render, which is what
the test asserts (`role="alert"` and the sentence on the page, the sentence in the rail, and no
Clips drawn for the refused request).

Decisions:

1. **The reachable refusal is the stale-flag one.** Ticket 13's correction means a stored `all` from
   a non-admin is read as `mine` and never asked, so the only way a Clips surface still asks for a
   selection the server refuses is a browser whose cached `/api/me` says admin after the server
   stopped agreeing — the window ticket 13 listed as a deliberate leftover. The test renders exactly
   that caller (stored `all`, `/api/me` answering admin, the `all` request refused), so the pin is
   about the branch and not about a scenario that no longer exists.
2. **Both surfaces, one test.** The deleted e2e assertion covered the page and the rail; both error
   branches are rendered together, since they are the same branch of the same stored selection.

## Verification

- `pytest`: **259 collected, 258 passed, 1 skipped** — baseline at this ticket's HEAD was 258
  collected, so the single new test is the blank-`tags` one. The existing tags tests (ticket 14's
  `--tag` pins, the dropped-tag test, the no-key test) all still pass.
- `web/`: `vitest run` **174 passed** in 18 files (baseline 168: 5 new in the new
  `desk/focusGuard.test.ts`, 1 in `clipFilterSurfaces.test.ts`); `tsc -b --noEmit` clean; `oxlint`
  clean apart from the pre-existing `desk/EditorCards.tsx:352` warning. This worktree has no
  `web/node_modules` of its own, so `web/node_modules` was symlinked to the main checkout's for the
  run (gitignored; left in place).
- Both new pytest/vitest pins were checked against the unfixed code: reverting `_parse_tags`'s
  `named or None` fails the blank-`tags` test, and removing the refusal seed fails the refusal test.
- **Playwright was not run** (AGENTS.md → Verification: the browser stack is the owner's while
  draining), and no e2e spec was added to.

## What the owner should see by hand

1. As an admin, on the desk of any Clip: click the rail's **Every Clip (admin)** *text*, then press
   Space. The transport plays, and the scope did not toggle again — that is finding 1, and it is the
   one acceptance item no in-process test can carry.
2. Click a `button` (e.g. a Frame control), then Space: unchanged, the transport plays.
3. Click into the rail's label again and Tab away and back: a control focused by Tab still answers
   Space/Enter itself.
4. Add `tags: ""` to a Clip entry in `config.yaml` after tagging that Clip from the desk or the API,
   restart the desk: the tags are still there. Change it to `tags: []` and restart: they are gone.

## Leftovers, deliberately out of this issue

- **A label naming a text input does not release focus.** That is the decision above, not an
  oversight: those fields are what `isEditableTarget` covers.
- **The refusal pin is a server render, so it cannot see the retry policy.** A real 403 in the
  browser also runs `onErrorRetry` (the app disables retries: `App.tsx` sets
  `shouldRetryOnError: false`); nothing here re-pins that.
- **`--tag ''` is still the CLI's only clearing gesture.** If a `--tag=` form that states an empty
  list without a blank entry is ever wanted, that is a CLI change with its own ticket.
