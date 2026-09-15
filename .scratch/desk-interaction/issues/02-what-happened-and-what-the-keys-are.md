# desk-interaction/02 — What happened, and what the keys are

**What to build:** the desk half of the interaction review
(`docs/specs/2026-09-15-desk-interaction.md`). One worker owns `web/` for the whole pass, on purpose:
every finding below touches the same handful of files (`FrameControls`, `TimelinePanel`,
`EditorCards`, `VocabLibrary`, `ClipDesk`), and the last two rounds of this repo were burnt by
parallel tickets whose semantic halves landed apart (ticket 26's acceptance undone by ticket 27
merging beside it). So: one ticket, one writer, one merge.

**Blocked by `desk-interaction/01`** — the last item wires the label editors' "Revert" button to the
server undo that ticket builds. Nothing else here depends on it; if you find yourself waiting, do the
other items first and leave item 4 for last.

The findings are argued in the review, with their sources. This body is *what to build*, what must
fail if it is undone, and — in "Traps" — the things the browser suite already pins that you cannot
run. Read "Traps" before you touch anything.

## 1. The span gesture stops the picture (F1)

**Today.** `[`/`i` marks a span start; `]`/`o` and the `Apply to frames a–b` / `Remove from frames
a–b` buttons write the inclusive range from that mark to *the Frame on screen now*
(`useBrushRange` → `rangeEnds(markedFrom, frameIndex)` in `web/src/desk/lanes.ts`). Nothing in that
path stops playback: the only caller of `pausePlayback` in the tree is the mask overlay's
pointer-down (`web/src/desk/PlayerPanel.tsx:207`). So a labeler can mark, keep watching, and commit a
range whose far end moved while they were deciding.

**To build.** Pause when the span's extent is read from the current Frame, at the two places that are
the whole of it: the mark, and the write funnel `useIdentityWriter.commitIdentityRange`
(`web/src/desk/writer.ts`, which every current-Frame range write already goes through — `Apply`,
`Remove`, `]`/`o`). Do **not** pause for the gestures whose extent is drawn on the timeline instead
(the lane paint drag, the bar trim): their range is the thing the pointer drew, not the playhead, and
`writeLaneSpan` is already a separate path. Put the rule where a reader can see it in one place and
name it in the note.

**Why it matters this much.** Five separate feature tickets asked for exactly this and none of them
has an implementation or a test: `desk-workbench/03`, `desk-workbench/06`, `desk-tables/01`,
`desk-tables/02`, `desk-dark/01`, `desk-combobox/03`, and the four specs behind them. The browser
suite pins the toast and the bars and never the pause — which is how it died. A pin needs a `<video>`,
and the browser stack is the owner's, so this one lands hand-verified: put the exact steps in the
note's "What the owner should see by hand" and say where a browser assertion would go.

**Also.** Four of those specs promised a *success flash* on the slider ("toast + slider flash"). It
does not exist (`rg flash web/src` is empty). It is **not** to be added: with this ticket the write
already answers three times (the picture stops, the notice arrives and then leaves, the bars appear),
and a fourth animation on the desk's most frequent action is noise. Say that in the note — that is the
decision, and the specs' promise is retired with it.

## 2. The notice arrives, and then leaves (F2)

**Today.** One `DeskNotice` string in `ClipDesk`, rendered as the *last* child of the Frame controls
footer (`web/src/desk/FrameControls.tsx:138`) — a `flex … overflow-x-auto` strip. Nothing clears it:
`notify(null)` is only called before the next write. So on a narrow window a confirmation can be
scrolled out of view, and a twenty-minute-old "Wrote … frames 0–3" looks exactly like a fresh one.

**To build.**

- Successes live about eight seconds; errors stay until they are replaced. Eight, not three: five
  browser assertions read a notice right after the write
  (`web/e2e/desk.spec.ts:809, 889, 919, 1083, 1148`) and a lifetime that is too short turns them into
  flakes the owner will meet, not you.
- A new notice must *look* new — it arrives rather than overtyping the previous text (its own key
  remount is enough; the line is already `role="status"`/`role="alert"`).
- The line must not be able to scroll out of the strip: pin it to the strip's visible edge
  (`sticky left-0` with the footer's own background) instead of moving it out. Do **not** give the
  footer a second row: its height is a layout constant the browser suite reads off the boxes
  (`web/e2e/desk.spec.ts:1256-1299`, including `wellBox.height >= 88`), and a taller footer is a
  browser-visible change you cannot check. Say in the note that the "own row" the review suggested is
  deliberately left to a round that can run the suite.

**Pin.** The lifetime decision as a pure function (how long a notice of each kind lives, and that a
new notice is a new value), in the module that already owns pure decisions beside it.

## 3. A range erase says how big it was — and is one step back (F3)

**Today.** `Remove from frames a–b` and `Delete`/`Backspace` on the selected bars erase in one press,
with no confirmation and no undo, while deleting a *vocabulary name* — which is recoverable, you can
type it again — asks `window.confirm`.

**To build.** No new dialog, and that is the decision: `desk-interaction/01` makes the erase one step
recoverable, which is the better answer, and a confirmation would also hang two existing browser tests
(Playwright dismisses dialogs by default, so `web/e2e/desk.spec.ts:1083`'s "Remove from frames 0–1"
would silently not remove anything). What is missing is size: the notice already names the range
(`Removed class: grasper on frames 0–13`), so append the count for a multi-Frame erase
(`… on frames 0–13 (14 frames)`). Appending only — see Traps.

**Pin.** The notice-text function (range and count) as a pure value.

## 4. Revert: the label editors' one step back (F4 — needs `01`)

**Today.** The mask panel has Undo (a button and a `Ctrl/Cmd+Z`); the phase, class and triplet editors
have nothing (`undo` exists nowhere in the Python tree outside `endo_label/mask/`).

**To build.** A **Revert** button in the focused Task type's editor card, wired to ticket 01's
`POST /api/<kind>/{clip_id}/undo` with the version the desk holds, showing the server's sentence on
refusal, disabled when the read says nothing is undoable, and carrying the refreshed document on
success the way a write does.

**Naming and the chord — both are decided here, and both are traps.**

- The button's accessible name must **not** contain "Undo". The mask panel and the focused label
  editor are mounted at the same time (`EditorRail` renders `<MaskPanel/>` plus the cards) and the
  browser suite finds the mask's undo with `getByRole("button", { name: "Undo" })`
  (`web/e2e/mask-desk.spec.ts:387`), which matches an accessible name by substring — a second button
  containing "Undo" makes that locator ambiguous and the test fails in strict mode. "Revert the last
  class write" is the shape; the visible label can be "Revert".
- **No chord this round.** `Ctrl/Cmd+Z` is the mask's, document-level and unconditional, and
  `web/e2e/mask-desk.spec.ts:374` pins that pressing it undoes the mask. A second owner of the same
  keystroke would fire two undos, and "which surface does the chord mean when both are on screen" is a
  real question the desk has not answered. Record it in the note as the one thing this round leaves
  open (with the shape the answer will take: one arbiter in the desk's key table, item 6).

**Pin.** The button's enablement rule as a pure function of the item's read (`undo_available` and the
write cell), and the chord's absence: the key table says the chord belongs to the mask.

## 5. Rename gets a control you can see (F5)

**Today.** A Library row applies the identity to the Frame on click, but through
`window.setTimeout(…, 300)` — with the comment "300ms click delay so dblclick can rename; drop if
rename gets its own control" — in `web/src/desk/VocabLibrary.tsx:84` (phase and class) and
`web/src/desk/EditorCards.tsx:473` (triplet rows). The gesture that pays for it (double-click to
rename) appears nowhere on screen.

**To build.**

- A pencil button on each phase/class Library row, inside the row's `li`, after the Brush toggle and
  before the trash, under the same `controls.canRegistryWrite` guard the double-click already has.
  Accessible name `Rename <name>` (never the rename field's own label — see Traps), `title="Rename"`,
  visible on hover and on keyboard focus (so it is reachable by Tab, not only by mouse).
- Triplet rows: **no new control inside the cells.** Those three cells are `grid-cols-3` and the
  browser suite measures their column boxes mid-edit (`web/e2e/desk.spec.ts:1700-1725`); put
  `title="Double-click to rename the <slot>"` on each cell instead, which is where the pointer already
  is when the gesture is wanted.
- **Keep the 300 ms delay and the double-click.** Record in the note why it cannot go yet: the click
  and the double-click are the same element, the pick is a toggle (`aria-pressed`), so an immediate
  click would make a double-click apply-and-unapply, and five browser tests double-click these rows to
  rename (`web/e2e/desk.spec.ts:608, 622, 1546, 1572, 1711`) — a round that owns `web/e2e/` can drop
  the double-click and the delay together, and the pencil is what makes that possible later.

**Pin.** The pencil's presence is a render, so pin what is pure: that the row's click still schedules
the pick (the existing behaviour) and that the pencil's accessible name is derived from the row's name,
not from the field's label.

## 6. The keys become a table, and the table is the help (F6)

**Today.** `Space` (PlayerPanel), `[`/`i`, `]`/`o`, `n` (FrameControls), `Escape`, `Delete`/`Backspace`
(TimelinePanel), `Ctrl/Cmd+Z` and `Escape` (MaskPanel), `Enter` (the library fields) — each a
`document` listener in its own component, five owners. The only hint in the UI is a `title` on the
coverage strip's chevron ("(n)"), and `i`/`o` are synonyms of `[`/`]` that nobody can guess. Nothing
renders a list of them.

**To build.**

- `web/src/desk/keys.ts`: the bindings as **data** — key (or chord), the context it applies in
  (always / not-a-field / the focused Task type), its owner, and the one-line help text. The `?` panel
  and the `title`s render *from that table*, so the help cannot disagree with the desk.
- A `?` overview panel (`?` opens it, `Escape` closes it) listing the table, and `title` +
  `aria-keyshortcuts` on the controls that have a binding. Keep `i`/`o` and document them — that is
  the call; nothing retires them.
- **Do not consolidate the listeners this round.** Move nothing out of `MaskPanel`: that surface was
  just reworked by `pilot-ux/22` and is the most heavily pinned in the app. The table is where the
  bindings are *declared*; the note records the single-dispatcher shape as the eventual one and this
  as the step that makes the keys knowable without touching the handlers.
- The table must not import anything that fetches: `web/src/desk/keyboard.ts` already carries that
  rule and the import-direction pin in `keyboard.test.ts` is the fence (its header comment says why).

**Pins.** (a) the pure resolver (event → binding id, per context, including "a keystroke inside a text
field is not the desk's"); (b) the table's own invariants: every entry names an owner and has help
text, and no two entries share a key *in the same context*; (c) a source-level pin, using the
TypeScript-compiler walk `keyboard.test.ts` already uses, that every key the table declares for an
owner actually appears as a compared `event.key` in that owner's file — so the table cannot drift into
a claim nothing can falsify.

## 7. The Ruler and the splitters take the keyboard (F7)

**Today.** The Ruler (`web/src/desk/TimelineBand.tsx:246`) is `role="slider"` with
`aria-valuemin`/`max`/`now`/`valuetext` and **no `tabIndex`**, so scrubbing is pointer-only. The three
resize handles (`web/src/desk/ResizeHandle.tsx`) are `role="separator"` with no `tabIndex`, no
`aria-value*`, no keys, and a 4px hit area. There is no `tabIndex` anywhere under `web/src`.

**To build**, per the WAI-ARIA authoring practices the review cites: the Ruler focusable with
Left/Right (and Up/Down) stepping one Frame, Home/End to the first and last, Page Up/Down by ten (the
desk has no "jump N frames" at all today); each splitter focusable with arrows to resize and
`aria-valuenow`/`min`/`max`. Handle both **on the focused element**, not on `document`: a text field's
own Home/End must stay the field's by construction, and it keeps the desk-wide table (item 6) free of
them. Widen the splitters' pointer target without changing their visual thickness.

**Pins.** A pure step function for the Ruler (`rulerFrameAfterKey(key, current, frameCount)`, clamped)
and one for a splitter's width, both pinned without a DOM.

## 8. The Submit button says what it will submit (F8)

**Today.** `ItemActions.run()` awaits `announceSubmitHint()` and *then* posts the transition, and the
sentence ("Submitting with 3 of 14 frames unlabeled for class") is rendered beside buttons that have
already become the next state's. It reports; a warning that arrives with the act cannot inform it. The
button also says "Submit" without naming the Task type, while on the desk the component sits in the
header and acts on the rail's focused tab.

**To build.** Keep D8 as it stands — warn, never block — and move the information earlier: the button
names its Task type and carries the unlabeled count continuously (`Submit class · 3 unlabeled`), the
sentence stays as the record of what was submitted, and the count comes from the coverage the desk
already folds (`ClipDesk` has it for the strip and for `n`). Nothing is disabled by it.

**Pin.** The label's text as a pure function of (Task type, coverage) — including the zero case.

## 9. Saved-ness is visible (F10)

**Today.** Every edit is a write (ADR 0025, no Save button) and no surface says so. A first-time
labeler looks for Save; a returning one wonders whether the last click landed. The notice covers the
bulk writes and nothing else.

**To build.** A small persistent indicator in the Clip header that reflects the last write for the
focused item: a `role="status"` **span** (not a button — see Traps) reading "Saved 12:04" and turning
into the failure sentence when a write is refused. Keep it a sentence, not a state machine.

**Pin.** The text as a pure function of the last write's outcome and time.

## 10. The small ones (F10)

- The coverage strip's `n` chevron is a 14px square button (`web/src/desk/CoverageStrip.tsx:73-79`) —
  the desk's "next thing to do" control is its hardest target. Give it a normal hit area **without
  changing the strip's height** (the strip sits above the ruler whose box the browser suite reads).
- The Brush toggle is a bare icon with `aria-label="Brush"` and no `title`; give it one, and show the
  existing empty-Brush sentence ("Brush is empty — pick an identity in the Library first") as the
  reason the range buttons are disabled, so the desk explains itself instead of leaving two dead
  buttons. Pin the disabled-reason function.
- `web/src/components/ui/combobox.tsx` is imported by nothing: the later decisions
  (`desk-dark/01`: "not ComboBox", `desk-vocab-library/02`) moved the editors to short native inputs
  with a `datalist`. Delete it, and say in the note that the deletion is the record of that decision
  (it is in git history if a future round wants it back).

## Not in this ticket: the frame numbers (F9)

The review's F9 says the screen mixes two numbering systems ("Frame 12 of 14" beside "frames 0–13",
`aria-valuemax = 13`). It is **not** changed here, for a reason worth recording: the numbers are
pinned by the browser suite in ten places — `getByText("Frame 0 of 2")` / `"Frame 1 of 2"` in
`web/e2e/mask-desk.spec.ts` (7×) and `web/e2e/desk.spec.ts` (3×), plus `video[aria-label='Frame 0']` —
so renumbering means editing the owner's specs in the same change, and no worker may. What this ticket
does instead is state the rule the desk will follow and put it in the note: **counts are 1-based for
people, addresses (frame indices) stay 0-based and are named as indices wherever they are not
obviously an address**, with the empty states dropping the number entirely ("No class tags on this
frame"), which costs nothing because nothing pins them. A round that owns `web/e2e/` finishes it.

## Traps: the browser suite you cannot run

`web/e2e/` is the owner's while draining (AGENTS.md → Verification): do not add a spec, do not run the
suite. But its assertions constrain what you may change, and these are the ones that bite:

| Pinned by | So |
|---|---|
| `mask-desk.spec.ts:274, 391` — `getByRole("button", { name: /save/i })` has **zero** matches | nothing you add may be a *button* whose accessible name matches /save/i. Item 9's indicator is a `role="status"` span, never a button. |
| `mask-desk.spec.ts:387` — the mask's Undo is found by `name: "Undo"` (substring match) | the label editors' button is "Revert" (item 4), and nothing else gains "Undo" in its accessible name. |
| `mask-desk.spec.ts:374` — `Control+z` undoes the mask | no second owner for that chord this round (item 4). |
| `desk.spec.ts:809, 889, 919, 1083, 1148` — five write notices, matched by prefix | you may **append** to a notice; never reword or reorder what is already there (item 3). |
| `mask-desk.spec.ts` ×7 and `desk.spec.ts` ×3 — `"Frame 0 of 2"`, `"Frame 1 of 2"`, `video[aria-label='Frame 0']` | no renumbering (F9 above). |
| `desk.spec.ts:608, 622, 1546, 1572, 1711` — double-click to rename, then `getByLabel("Rename phase")` / `getByLabel("Rename class tag")` / `getByRole("textbox", { name: "Rename verb" })` | the pencil's accessible name must not *contain* those fields' labels (`getByLabel` matches a substring), and the double-click path must keep working (item 5). |
| `desk.spec.ts:158` — `libraryRow` filters an `li` by its text, and rows are found by `getByRole("button", { name, exact: true })` | the pencil is an icon with no text inside the `li`, and it must not change the row button's accessible name (item 5). |
| `desk.spec.ts:1256-1299` — layout boxes: the timeline/ruler/transport sit below the player, `wellBox.height >= 88`, the picture's height stays put | the footer keeps its height (item 2), and the coverage strip keeps its height (item 10). |
| `multiuser.spec.ts:136, 179, 229` — `getByRole("button", { name: "Submit" })`, no `exact` | appending to that button's name is safe (item 8). |

Free to change (nothing pins them): the notice's position within the strip, the `?` panel, the pencil,
`title`s, the splitters' hit area, the Ruler's keys, the save indicator, the empty-state sentences.

## Acceptance

- [ ] the picture pauses on `[`/`i`, on `]`/`o` and on both range buttons, and does not pause on the
      lane paint or the bar trim; the exact browser steps are in the note's hand-verification section
- [ ] a success notice leaves on its own after about eight seconds; an error stays; a new notice is
      visibly new; the line cannot be scrolled out of the footer strip
- [ ] a multi-Frame erase's notice names its size, and the existing notice text is only ever appended to
- [ ] a "Revert" button in the focused editor restores the last label write through ticket 01's
      endpoint, is disabled from the read when there is nothing to revert, shows the server's sentence
      on refusal, and the desk's `Ctrl/Cmd+Z` still belongs to the mask alone
- [ ] phase/class Library rows carry a pencil (accessible name `Rename <name>`, visible on hover and
      focus), triplet cells carry a `title` naming the double-click, and both click delays are still in
      place
- [ ] `web/src/desk/keys.ts` holds the bindings as data, the `?` panel and every `title` render from
      it, `i`/`o` are documented rather than retired, and no listener moved out of `MaskPanel`
- [ ] the Ruler is focusable and responds to arrows, Home/End and Page Up/Down at the element; the
      splitters are focusable, carry `aria-value*`, respond to arrows, and have a wider hit area
- [ ] the Submit button names its Task type and carries the unlabeled count before the click, and D8
      is unchanged (nothing blocked)
- [ ] the header shows a `role="status"` save indicator that is not a button; the `n` chevron has a
      usable target; the Brush toggle has a `title` and the range buttons say why they are disabled;
      `web/src/components/ui/combobox.tsx` is gone
- [ ] every pin fails when the behaviour it names is removed — say in the note which ones you undid to
      check
- [ ] `cd web && npx vitest run` and `npx tsc -b --noEmit` are green, and so is `python -m pytest tests
      -q` (no Python file is touched; run it if your worktree has a `web/dist`, otherwise say in the
      note that you did not)
- [ ] `docs/adr/0030-assignment-is-the-only-label-write-gate.md` gains the sentence that the editors'
      Revert is the same write gate, and the note records: the two decided-but-different things (no
      confirmation for a range erase; no chord for the label undo), the two deferred ones (the 300 ms
      delay, the frame numbers), what the owner must check by hand, and that the browser stack was
      neither run nor added to
