# Desk interaction review: what the desk does that fights the labeler

The product owner has been using the pilot by hand and reports that parts of the interaction "feel
wrong" without being able to name them. This document is that review: every finding is read off the
code at `cb81ec6` (the tree the running pilot serves), checked against what the earlier desk features
asked for, and explained with a principle that is not mine — usability heuristics, the ARIA authoring
practices, and what two other labeling tools document about themselves.

It is a review, not a decision record. Nothing here is decided; the items marked **needs your call**
change something already settled (a `D` number from `2026-09-14-pilot-ux.md`, or an older feature's
acceptance criteria), and the rest is mechanical.

## How to read it

Each finding answers four questions: **what the code does** (with the file), **why that costs the
labeler** (with the principle and its source), **what I would do**, and **how big** the change is.
Priority is impact × cheapness, not the order they were found in.

| # | Finding | Kind | Size |
|---|---------|------|------|
| F1 | A span write does not pause playback, and the range's end is the moving Frame | defect (documented 5×, never implemented) | small |
| F2 | The notice line never expires and can be scrolled out of view | defect | small |
| F3 | Bulk removals are one click with no confirmation, while one name delete asks | defect by inconsistency | small |
| F4 | There is no undo for phase / class / triplet at all | missing capability | medium (server + desk) |
| F5 | Rename-by-double-click forces 300 ms of lag on every label click | defect (a decided gesture's cost) | small, **needs your call** |
| F6 | Shortcuts are undiscoverable and owned by four components | structure | medium |
| F7 | The Ruler and the resize handles are ARIA widgets with no keyboard | accessibility | small |
| F8 | The Submit warning arrives as the submit goes through | defect vs D8's intent | small |
| F9 | Frames are 0-based in the text and 1-based in the count | consistency | small |
| F10 | A batch of smaller ones (hit targets, "did it save?", the Brush's discoverability, dead combobox) | cleanup | small each |

The three I would do first, in this order: **F1** (it can write a range the user never chose),
**F3**+**F4** together (they are the same anxiety), **F6** (the desk is keyboard-first and nothing
teaches its keys).

---

## F1. A span write does not pause playback, and the range's end is the moving Frame

**What the code does.** `[` marks a span start; `]` (or the *Apply to frames* button) writes the
inclusive range from that mark to *the Frame on screen now* — `useBrushRange` computes
`rangeEnds(markedFrom, frameIndex)` (`web/src/desk/lanes.ts`), and `applyRange`
(`web/src/desk/FrameControls.tsx`) writes exactly that range. Nothing in that path stops playback.
The only caller of `pausePlayback` in the whole tree is the mask overlay's pointer-down
(`web/src/desk/PlayerPanel.tsx:207`). `TimelinePanel`'s lane painting and trimming
(`paintLane`, `trimBar`) do not pause either.

**Why that costs the labeler.** `Space` starts the video. The labeler marks a span, keeps watching,
and hits `]` — the write lands across a range that grew while they were deciding. The desk then
names the range it wrote (`Wrote class: clipper on frames 0–6`), which reads as confirmation of an
intent the labeler never formed. This is the "slip" class of error rather than a misunderstanding:
nothing on screen told them the far end was still moving.

Five separate feature tickets asked for this and none of them has an implementation or a test:

- `.scratch/desk-workbench/issues/03-span-gesture-and-phase-painting.md` — "pauses playback if it is running"
- `.scratch/desk-workbench/issues/06-playback-and-full-sitting-verification.md` — "pauses playback"
- `.scratch/desk-tables/issues/01-heroui-tables-write-this-frame.md` — "pauses play"
- `.scratch/desk-tables/issues/02-remove-from-span.md` — "pauses play; keys stay ignored in inputs"
- `.scratch/desk-dark/issues/01-dark-compact-sitting.md` and `.scratch/desk-combobox/issues/03-paint-chip-apply.md` — "pauses on a successful interval write"

The four `spec.md` files behind those features say it too ("pause when an interval write succeeds, so
that I can see where the write landed"), and `web/e2e/desk.spec.ts` asserts the toast and the bars but
never the pause — so the requirement has been prose-only since the workbench era.

**What I would do.** Pause on the gesture, not on the success: pause when `[` marks and when `]` /
Apply / Remove commits, the way the mask overlay already pauses on pointer-down. Pausing after the
write would leave the same drift between mark and commit. Then pin it in the browser suite (the only
place that can see a `<video>`): after Apply, `video.paused === true` and the playhead is at the
range's end.

While there: four of those specs also promised a **success flash** on the timeline ("Success: toast +
slider flash"). `rg flash web/src` finds nothing — it was dropped and never re-decided. Either drop
the claim from the record or add a short flash; I would only add it if F2 lands, because a flash is a
second way of saying "it worked" and the notice line is currently the first.

**Size.** Small (one callback through `playback.ts`, three call sites, one e2e assertion).

## F2. The notice line never expires and can be scrolled out of view

**What the code does.** The desk holds one `DeskNotice` (`web/src/ClipDesk.tsx`) and renders it as the
last child of the Frame controls footer (`web/src/desk/FrameControls.tsx:138`), which is
`overflow-x-auto` and already holds the playback hint, the Frame readout, the span readout, the Brush
chips, three range buttons and the worker status. No timer clears it: `notify(null)` is only ever
called *before* the next write.

**Why that costs the labeler.** Two reasons. On a window narrower than the full rail the line can be
scrolled off the right edge, so the confirmation of a write is simply not on screen. And a
twenty-minute-old "Wrote … on frames 0–3" looks exactly like a fresh one, so the line stops being
evidence: the labeler scrolls the timeline to check the bar instead, which is the thing the line
existed to save them. Nielsen's first heuristic is that the design "should always keep users informed
about what is going on, through appropriate feedback **within a reasonable amount of time**" —
feedback that never goes away is feedback that has stopped answering the question.

**What I would do.** Give the notice a lifetime and a fixed place: successes fade after a few seconds,
errors stay until replaced or dismissed, and the line gets its own row instead of floating at the end
of a scrolling button strip. A new notice should also *look* new (it arrives; it is not just the
previous text overtyped). The plumbing is already right otherwise: it is a `role="status"` /
`role="alert"` live region, which is what an assistive-technology user needs.

**Size.** Small.

## F3. Bulk removals are one click with no confirmation, while a single name delete asks

**What the code does.** Three native confirmations exist, all for deleting a *name*:

- `web/src/desk/VocabLibrary.tsx:208` — "Delete class tag X from every Clip?"
- `web/src/desk/EditorCards.tsx:436` — "Delete triple X from every Clip?"
- `web/src/desk/MaskPanel.tsx:993` — "Delete <Track> from this Clip? Its masks go with it."

None exists for the two operations that destroy label work across many Frames at once:

- `Remove from frames a–b` (`web/src/desk/FrameControls.tsx:184`) — one click, erases the Brush's
  identities from every Frame in the range, no confirmation, no undo.
- `Delete` / `Backspace` on the selected lane bars (`web/src/desk/TimelinePanel.tsx:149`) — one
  keystroke over a selection that is only visible as a ring around a bar, same consequences.

**Why that costs the labeler.** The asymmetry is backwards. Deleting a vocabulary name is annoying but
recoverable — type it again; the labels that used it keep their name. Erasing fourteen Frames of
class labels is not recoverable in any way the desk offers. The heuristic that applies is error
prevention, whose point is to "check for [error-prone conditions] and present users with a
confirmation option **before they commit to the action**"; the confirmation guidance is equally
explicit that a confirmation belongs on "actions with serious consequences … in particular … actions
that cannot be undone", and equally explicit that *undo is the better answer* where it is available:
"do try your best to offer undo … to reduce anxiety and allow users to recover from major problems."
It also warns against confirming routine actions, which is exactly why the single-Frame toggle must
stay unconditional.

**What I would do.** Two steps, in order.

1. Until there is undo (F4): make the destructive range actions state what they will do and ask once.
   The labels are already specific and already carry the range (`Remove from frames 0–13`); adding the
   count (`… (14 frames)`) is the "be specific" part — an unspecific "Are you sure?" is what the
   guidance calls useless, because the only sensible answer is "yes, that is what I clicked". Confirm
   only when the range is more than one Frame *and* something is actually there, so the frequent
   one-Frame case stays frictionless.
2. Replace the three `window.confirm` calls with one small in-app confirmation when we touch them
   again: a native dialog cannot be styled to match a dark tool, blocks the page, and cannot be
   operated the way the rest of the desk is. Low priority — they are honest and specific today.

**Size.** Small.

## F4. There is no undo for phase / class / triplet at all

**What the code does.** Mask has an Undo button and a `Ctrl/Cmd+Z` chord, scoped to the current
Frame's Track ("restores this Frame's Track-on-Frame from immediately before the last undoable
committed edit"). Phase, class and triplet have nothing: `undo` appears nowhere in the Python tree
except under `endo_label/mask/`, so there is no endpoint, and the desk has no chord and no button for
them. Every other write in the desk is immediate and has no Save button (ADR 0025), which is the right
call — but it makes the click itself the commit, and there is no way back from a wrong one.

**Why that costs the labeler.** This is the reason F3 needs confirmations, and the reason the desk
feels unforgiving in a way that is hard to point at: the product's most common gesture is also its
most irreversible one. "Users often perform actions by mistake. They need a clearly marked 'emergency
exit' to leave the unwanted action without having to go through an extended process" is heuristic 3,
and the confirmation guidance ends on the same note — "some user errors will remain despite even the
best of confirmation dialogs … do go to great lengths to provide undo".

**What I would do.** A one-step, per-(Clip, Task type) undo on the server, surfaced as the mask Undo
already is (button + `Ctrl/Cmd+Z`, with the chord routed by Task focus).

The server shape is small and already half-present: every label write is a whole-document write
(`phase` / `class` / `triplet` documents per Clip) and the Clip already carries a `version`, which is
what produces the 409 the desk renders as "Someone else saved this Clip first". Keeping the previous
document per (Clip, Task type) on each write and exposing `POST /api/clips/{id}/{task_type}/undo`
costs one column or one small table plus one endpoint, and it is honest about its scope: it undoes the
last write, not a session's history.

**This is the single biggest interaction upgrade in the list**, and it is the one that needs a
decision, because it adds a server surface and because "how many steps" is a product choice.

**Size.** Medium: one endpoint + storage, desk wiring, the chord routed to the focused Task type, and
tests on both sides (pytest for the endpoint, vitest for the chord's routing).

## F5. Rename-by-double-click forces 300 ms of lag on every label click (**needs your call**)

**What the code does.** A Library row applies the identity to the Frame on click — but through a
timer:

```
// ponytail: 300ms click delay so dblclick can rename; drop if rename gets its own control
clickTimer.current = window.setTimeout(() => { … onPick(name); }, 300);
```

`web/src/desk/VocabLibrary.tsx:84` (phase and class) and `web/src/desk/EditorCards.tsx:473` (a
triplet row) each carry that comment and that delay, and one of them calls it "ponytail" — a known
debt, deliberately left for the day rename gets its own control.

**Why that costs the labeler.** Tagging a Frame is the desk's most frequent action, and it is
deliberately three times slower than it needs to be. By the response-time limits the user is no longer
"directly manipulating" the data (0.1 s) but in the band where "users notice the delay … they do lose
the feeling of operating directly on the data" (0.2–1.0 s) — for a click whose only visible effect is
a checkmark appearing on a row. Double-click-to-rename is also invisible: nothing on the row says so,
which is the "recognition rather than recall" heuristic failing at the same time.

The gesture itself is decided (`desk-vocab-library/01`: "Double-click a phase or class name in Library
to rename desk-wide", spelled out again in `desk-vocab-library/03` and `desk-cards-grid/02`), so this
is not mine to change — the *conflict* is the problem: one control cannot answer a single click
instantly and a double click differently without waiting to find out which one it was.

**What I would do (your call).** Separate the two affordances and delete the timer:

- the row toggles on click, immediately;
- renaming gets its own control — the cheapest is a pencil icon on the row, shown on hover and on
  keyboard focus, with `F2` as the shortcut and `title="Rename (F2)"`. (Double-click can keep working
  *in addition*, now that it no longer has to be waited for.)

Alternatively, if double-click must stay the only gesture, accept the lag knowingly and say so in the
record — but then the desk pays 300 ms on its most used action for a rename that happens a handful of
times a session, which is a bad trade.

**Size.** Small.

## F6. Shortcuts are undiscoverable and owned by four components

**What the code does.** The keys, verified against the tree:

| Key | Effect | Owner |
|-----|--------|-------|
| `Space` | play / pause | `web/src/desk/PlayerPanel.tsx` |
| `[` or `i` | mark the span start | `web/src/desk/FrameControls.tsx` |
| `]` or `o` | apply the Brush to the range | `web/src/desk/FrameControls.tsx` |
| `n` | jump to the next Unlabeled Frame | `web/src/desk/FrameControls.tsx` |
| `Escape` | drop the mask's pending marks / clear the bar selection / close a rename field | `MaskPanel`, `TimelinePanel`, `VocabLibrary` |
| `Delete` / `Backspace` | remove the selected lane bars | `web/src/desk/TimelinePanel.tsx:149` |
| `Ctrl/Cmd+Z` | undo (mask only) | `web/src/desk/MaskPanel.tsx` |
| `Enter` | commit a vocab name / a rename | `VocabLibrary`, `EditorCards` |

Each is a `document` listener inside its own component — four components, five listeners (Frame
Controls has two) — and the only hint anywhere in the UI is a `title` on two controls (the Coverage
Strip's chevron says "(n)"). `i` and `o` are synonyms of `[` and `]` that no one can guess, and `o`
is a bare letter that performs a *write* across a range.

**Why that costs the labeler.** Heuristic 6: "Minimize the user's memory load by making elements,
actions, and options visible … Information required to use the design should be visible or easily
retrievable when needed." Heuristic 7 says shortcuts may be "hidden from novice users" — but only if
they are *learnable*, and heuristic 10 asks for help that is "easy to search and focused on the user's
task". Both tools this desk is competing with do exactly that: Label Studio surfaces its hotkeys from
the labeling editor's settings icon and lets them be enabled, disabled and customized
(docs.humansignal.com/guide/hotkeys); CVAT documents a shortcut beside each control and puts the step
sizes in Settings (docs.cvat.ai, "Menu and Navigation Bar").

The five-listener structure is the other half of the cost: nothing prevents two components from
answering the same key, and nothing can list what the keys are without reading four files. `Escape`
already means three things on one screen.

**What I would do.**

1. One desk-level keydown with a table of bindings (`key → handler`, with the editable-target guard
   stated per binding, since the brackets deliberately ignore it). Ownership becomes a table, and the
   table is the help.
2. A `?` overview panel that renders that table, plus `title="… (key)"` on every control that has a
   binding (the pattern the Coverage Strip already uses for `n`).
3. Retire `i` / `o`, or at least move the *write* off a bare letter. `[` and `]` are the documented
   gesture and the only ones the browser suite pins; `o` writing to fourteen Frames on a stray
   keystroke is a slip waiting to happen.

**Size.** Medium (mostly mechanical, but it touches every keyboard effect in the desk).

## F7. The Ruler and the resize handles are ARIA widgets with no keyboard

**What the code does.**

- The Ruler (`web/src/desk/TimelineBand.tsx:246`) is `role="slider"` with
  `aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` — correctly labelled — but it has
  no `tabIndex`, so it cannot be focused, and it has no key handling, so it cannot be moved from the
  keyboard. Scrubbing is pointer-only.
- The three resize handles (`web/src/desk/ResizeHandle.tsx`) are `role="separator"` with an
  `aria-label` and `aria-orientation`, but no `tabIndex`, no `aria-valuenow`/`min`/`max`, no keys, and
  a 4 px-wide hit area (`w-1`).

There is no `tabIndex` anywhere under `web/src` at all, so this is the whole of it: nothing in the
desk can be reached or operated from the keyboard except the controls the browser makes focusable by
default (buttons, inputs, selects, links).

**Why that costs the labeler.** The desk is a keyboard-first tool by design (that is what the whole
D2 / D3 shortcut discussion was about), so a keyboard-only path for the two most basic spatial
controls is a real gap, not a checkbox. The authoring practices are precise about both:
a slider is "the focusable slider control" with Right/Up to increase, Left/Down to decrease, Home/End
to the ends of the range and optional Page Up/Down for larger steps; a window splitter takes arrow
keys (and Enter to collapse/restore), and its `role="separator"` element "has the `aria-valuenow`
property set to a decimal value representing the current position", plus `aria-valuemin`/`aria-valuemax`.

There is a bonus in it: Home/End and Page Up/Down on the Ruler would give the desk "go to the first
frame", "go to the last frame" and "jump ten frames" — none of which exists today in any form, and
both neighbouring tools have them (CVAT: first/last frame, step back/forward with a configurable step
size, and a numeric "go to the specific frame" field).

**What I would do.** Per the practices: `tabIndex={0}` on both, the arrow/Home/End/PageUp/PageDown
handling on the Ruler, the arrow (and Enter) handling plus `aria-value*` on each splitter. Widen the
splitters' pointer target (a wider transparent hit area, or grow on hover) — 4 px is a hard target for
a control the labeler uses to shape their workspace.

**Size.** Small; no design decisions needed.

## F8. The Submit warning arrives as the submit goes through

**What the code does.** `ItemActions.run()` awaits `announceSubmitHint()` and *then* posts the
transition (`web/src/ItemActions.tsx:50,67,69`). The hint itself is a report —
`submitGapNotice()` produces "Submitting with 3 of 14 frames unlabeled for class" — rendered in a
`role="status"` beside buttons that have already turned into the next state's buttons. On the desk the
same component sits in the header, next to the Clip id, while the Task type it acts on is the *rail
tab*.

**Why that costs the labeler.** D8 in the pilot UX spec is "`n` jumps to the next unlabeled Frame of
the focused Task type; **Submit warns but never blocks**". Warning after the fact is not warning: the
decision it is meant to inform has been made and cannot be unmade, and the sentence reads as an
apology. The desk already has the coverage map in hand (`ClipDesk` folds it for the Strip and for `n`),
so the information exists before the click — it is just not shown before it.

Two smaller things ride along: the button says "Submit" without naming the Task type, so a labeler
working on class can submit triplet while believing they submitted the Clip; and `MyTasks` labels each
row "clip · task_type" while the desk's header does not.

**What I would do.** Keep D8 exactly as it is and move the information earlier — put the count on or
beside the button, continuously ("Submit class · 3 unlabeled"), and leave the sentence as the record
of what was submitted. Nothing is blocked; the warning becomes a thing the labeler can see while
deciding. Name the Task type in the button while you are there.

**Size.** Small.

## F9. Frames are 0-based in the text and 1-based in the count

**What the code does.** The footer says `Frame 12 of 14` (`FrameControls.tsx:138`), the picture overlay
says `Frame 12` (`PlayerPanel.tsx:200`), the buttons say `Apply to frames 0–13`, the coverage segments
are titled `Covered 3–7` / `Unlabeled gap 8–11`, the Ruler's `aria-valuetext` is `Frame 12` with
`aria-valuemax = frame_count - 1`, and the empty states read "No class tags on frame 0". The API is
0-based (`0..N-1`) and always will be.

**Why that costs the labeler.** "Frame 12 of 14" is a sentence with two numbering systems in it: is
the last Frame 13 or 14? The same screen says the maximum is 13 (`aria-valuemax`) and that the Clip
has 14 Frames. Heuristic 2 asks the design to "speak the users' language" and heuristic 4 to be
internally consistent; this is neither, and it is the kind of thing that makes a user hesitate before
every range they type or read.

**What I would do.** Pick one and apply it everywhere. I would display 1-based counts to people
(`Frame 13 / 14`, `frames 1–14`) and keep 0-based numbers only where a number has to match the API,
the CLI or a log line — or, if the API's numbering should stay visible (there is an argument for a
tool whose users talk to the server), always print the total as the last index (`Frame 12 of 0–13`).
Either is fine; the current mixture is not.

**Size.** Small, but it touches every readout, so it should be one pass with a search for every place
a frame number reaches the screen.

## F10. Smaller ones, worth one cleanup ticket

- **The `n` jump's only visible affordance is a 10 px chevron** in a 14 px-square button
  (`web/src/desk/CoverageStrip.tsx:73-79`). It has a good `aria-label` and `title`; it needs a normal
  button size. This is the desk's "next thing to do" control and it is the hardest thing on the
  timeline to hit.
- **Nothing says "saved".** Every edit is a write (ADR 0025, no Save button), and no surface says so.
  A first-time labeler looks for Save; a returning one wonders whether the last click landed. One
  persistent indicator in the header ("Saved" / "Saved 12:04") answers both and costs a line — the
  notice line only covers the bulk writes, not the frequent single-Frame ones.
- **The Brush's arm control is a bare icon.** `web/src/desk/VocabLibrary.tsx` renders the chip toggle
  as `<Brush/>` with `aria-label="Brush"` and no `title`, so nothing connects "click the brush" to
  "`[` and `]` now work". The empty-Brush notice ("Brush is empty — pick an identity in the Library
  first") is good writing; show it as the range buttons' disabled explanation, and give the icon a
  `title`.
- **A dead combobox reads as intent.** `web/src/components/ui/combobox.tsx` exists and is imported
  nowhere; the triplet composer uses three native `<datalist>`s (`EditorCards.tsx:792`) instead. Native
  datalist filtering is browser-defined and cannot be shaped by us. Either use the component or delete
  it — but a component that no surface uses invites the next reader to assume a design that is not
  there.
- **Three `window.confirm` dialogs** (F3). Fine for now; if a fourth destructive path appears, build
  one small in-app confirmation and use it everywhere.

---

## What I did *not* find a problem with

So the review's boundary is visible:

- The mask panel's permission model — four states, the refusal sentence before the click, the held
  prompt for an unanswered read, `Inferring…` / `Propagating… 0:42` feedback. That was just reworked
  and it reads correctly.
- The empty/waiting states everywhere (`Choose a Clip`, `This Clip has no Frames.`, `No Tracks`,
  `Nothing is waiting for your review.`, the calm "No class tags on frame 0").
- The error path for a stale write: 409 → "Someone else saved this Clip first. Refreshed — retry your
  edit.", inline where the edit happened, `role="alert"`.
- Refusals are the server's own sentence, never the desk's invention (ADR 0030), and the Clips
  rail/page read one selection so they cannot disagree.
- `Escape` is escape-like everywhere it appears, and the editable-target guard keeps typing safe
  (with the deliberate exception of the brackets, which cannot appear in a name).
- Load/refresh behaviour: SWR revalidation after transitions, so a transitioned item's buttons come
  from the server rather than from local optimism.

## Decisions this review needs from you

1. **F4 — undo for label writes.** Add a server-side one-step undo per (Clip, Task type), or decide
   that confirmations are enough? (My read: undo is the highest-value item here.)
2. **F5 — the rename gesture.** Separate rename into its own control and make the label click
   immediate, or keep double-click and the 300 ms lag knowingly?
3. **F6 — `i` / `o`.** Retire them in favour of `[` / `]`, or keep the synonyms and document them in
   the `?` panel?
4. **F1 — the success flash.** Four older specs promise one and it does not exist. Add it, or drop the
   claim from the record?

Everything else (F1's pause, F2, F3, F7, F8, F9, F10) is mechanical and can be one ticket each, or
grouped: F1+F2 as "the write tells the truth", F3+F8 as "say it before it happens", F7 as
"accessibility", F9+F10 as "the readouts and the small targets".

## How to verify

Per `AGENTS.md` the browser stack is yours, not a worker's: `npm run test:e2e` in `web/` (Chromium
against `127.0.0.1:7881`, Vite on `5174`, mask on `7893`). Note that today the suite pins **neither**
the pause (F1) nor any notice lifetime (F2) — the span-gesture test asserts the toast text and the
bars, which is why both could regress unnoticed. Whichever of these lands needs a browser assertion,
because none of them is visible from `vitest`'s node environment.

## Sources

- Jakob Nielsen, *10 Usability Heuristics for User Interface Design*, NN/g (rev. 2020) —
  https://www.nngroup.com/articles/ten-usability-heuristics/ (heuristics 1, 2, 3, 4, 5, 6, 7, 10 are
  quoted above from the page's own text).
- Jakob Nielsen, *Response Times: The 3 Important Limits*, NN/g —
  https://www.nngroup.com/articles/response-times-3-important-limits/ (0.1 s = "reacting
  instantaneously"; 0.2–1.0 s = the user "does lose the feeling of operating directly on the data").
- *Confirmation Dialogs Can Prevent User Errors — If Not Overused*, NN/g —
  https://www.nngroup.com/articles/confirmation-dialog/ (guideline 1: serious or irreversible
  consequences; guideline 2: not for routine actions; guideline 3: be specific; and "do go to great
  lengths to provide undo").
- W3C WAI-ARIA Authoring Practices, *Slider Pattern* —
  https://www.w3.org/WAI/ARIA/apg/patterns/slider/ (keyboard interaction and the focusable slider's
  roles/states).
- W3C WAI-ARIA Authoring Practices, *Window Splitter Pattern* —
  https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/ (arrow keys, Enter, Home/End, and the
  focusable separator's `aria-valuenow`/`min`/`max`).
- Label Studio, *Hotkeys* — https://labelstud.io/guide/hotkeys (hotkeys shown from the labeling
  editor's settings, customizable and switchable).
- CVAT, *Menu and Navigation Bar* — https://docs.cvat.ai/docs/annotation/annotation-editor/navbar/
  (shortcuts documented per control, configurable step size, saved/undo/redo, delete-and-restore).
