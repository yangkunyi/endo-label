# pilot-ux/07 — Unlabeled jumps and the Submit hint: implementation notes

The issue body (`issues/07-unlabeled-jumps-and-submit-hint.md`) is frozen; this file is the working
record of what landed and the two decisions the code list did not settle.

## What landed

- `web/src/timeline.ts` — the pure half of both gestures:
  - `nextUnlabeledFrame(coverage, from)` walks the Coverage Strip's own folded runs (never a second
    count), wraps once, and answers `null` when there is no Unlabeled gap left at all. It returns
    `null` for `total <= 0` too, so an empty Clip has nothing to jump to.
  - `submitGapNotice(counts)` → `Submitting with 32 of 120 frames unlabeled for class`, or `null`
    when the Clip is covered for that Task type.
  - `everyFrameLabeledNotice(task)` → `Every Frame has a class label`.
  All three sit next to `foldCoverage` / `coverageSummary` (ADR 0029's one derived map per Task type).
- `web/src/desk/unlabeledJump.ts` — `useUnlabeledJump({coverage, frameIndex, notify})`: the `n` key
  and the strip's button are one gesture. `next == null` is a notice (`error: false` — "nothing
  left" is good news, not an alert); otherwise it `seek`s, never a bare store `scrub`, so the
  picture follows the Playhead.
- `web/src/desk/FrameControls.tsx` — the `n` keydown handler, guarded exactly as 02 guards `i`/`o`
  (`isEditableTarget`, so a Vocab field keeps its letters) plus Ctrl/Cmd/Alt rejection (the browser's
  own Ctrl+N, the window manager's Alt+N).
- `web/src/desk/CoverageStrip.tsx` — a chevron (`data-next-unlabeled`) in the strip's head, inside
  the left rail column: the track's geometry (`clipRailWidth` + 1px + `flex-1`) is untouched, so the
  strip still lines up with the Ruler and the Lane well.
- `web/src/ClipDesk.tsx` — the coverage map is folded **once** here and passed down: the strip draws
  it, `n` walks it, the Submit path names it. `TimelinePanel` no longer folds its own copy.
- `web/src/ItemActions.tsx` — `submitNotice?: SubmitHintSource`, announced on the Submit click (in
  the same button row as the item's actions) and then the POST runs as before. A hint source that
  throws says nothing; it can never stand between the item and its submit.
- `web/src/desk/DeskItemActions.tsx` — `submitNotice={() => submitGapNotice(coverage)}` from the map
  the desk already holds.
- `web/src/submitHint.ts` — `clipSubmitHint(clipId, taskType)`: the board's read of the same
  documents (phase/class/triplet clip docs; the Annotation summary for mask), ending at
  `submitGapNotice`. `web/src/maskCoverage.ts` gains `maskCoverageCounts` for the mask row's counts.
- `web/src/AssignmentsBoard.tsx` — a Submit button on Labeling rows plus one board-level hint line.

## Decision 1: the board's Submit did not exist

The ticket says "`web/src/AssignmentsBoard.tsx` mirrors it" and the checklist ends with "the same
sentence appears from the board's Submit" — but the board had no Submit: `ItemActions` is only
rendered by the desk header and My Tasks, and the board's `COLUMNS` table offers assign / reassign /
reviewer only. The backend has always allowed it (`capabilities.item_capabilities`: `submit` is
`state == "Labeling" and (is_assignee or admin)`, and `submit_item` is not admin-gated), so the
smallest honest way to make the checklist true was to add the admin's Submit to the board.

- The button shows for Labeling rows, gated by the state check with the server predicate quoted at
  the call site (`capabilities.item_capabilities`). The board is admin-only (`/api/items` is
  admin-only), so `Labeling` and the server's predicate are the same set here. The cleaner
  alternative — `/api/items` rows carrying `capabilities` like `/api/me?clip_id&task_type` does —
  is a backend payload change this ticket did not ask for; the file already client-gates its
  delivery marker from `me.roles` the same way.
- The sentence is a board-level line (`data-submit-hint`), not row-local state: the row moves to the
  Submitted column the moment the submit lands, and a sentence that vanishes with it is not a
  sentence the owner can read. On the desk the header row does not move, so the hint stays where it
  was said, next to the item action.

## Decision 2: the Frame controls bar moved inside the playback context

`n` is a seek, and only `PlaybackProvider` owns `seek` (a bare `scrub` would leave the `<video>` on
the old Frame until the next `timeupdate`). `FrameControls` therefore moved inside
`<PlaybackProvider>` in `ClipDesk` — a context provider adds no DOM node, so the bar's position
between the desk body and the `ResizeHandle` is unchanged. The cost is that the bar re-renders with
the playback context (a few times a second while playing), which `TimelineBand` already does.

## Verification

- `web/`: `tsc -b --noEmit` clean; `vitest run` 147 passed (139 before this issue): new pins for
  `nextUnlabeledFrame` (gap ahead, inside a gap, wrap, covered Clip, empty Clip, the single gap from
  either side), `submitGapNotice`, `everyFrameLabeledNotice`, `maskCoverageCounts`, `clipMetaPath`.
- `oxlint src`: one pre-existing warning (`EditorCards.tsx` set-state-in-effect), nothing new.
- `pytest` (backend untouched, refactored payload untouched): 223 passed, 1 skipped.
- **Playwright was not run and no spec was added** — per `AGENTS.md`, the browser stack is the
  owner's; ticket 12 owns the in-process pins and explicitly drops the browser side of 01–03/05–06.

## Leftovers, deliberately out of this issue

- My Tasks' Submit has no hint: that page has no coverage source, and the ticket names the desk and
  the board. `ItemActions` takes the hint as an optional source, so giving My Tasks a source later
  is a one-line change there.
- The board's Submit is only reachable as admin, which is what the board is; an annotator submits
  from the desk or My Tasks.
- `n` is the focused Task type only. mask keeps its own strip row and Track lanes (06) and is not a
  Task focus tab — pressing `n` with the mask panel open walks class/phase/triplet coverage.
