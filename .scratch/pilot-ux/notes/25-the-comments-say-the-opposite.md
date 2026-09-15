# pilot-ux/25 — The comments say the opposite of the code: implementation notes

The issue body (`issues/25-the-comments-say-the-opposite.md`) is frozen; this file is the working
record of what landed, the decisions the body left open, and what is left for the owner's
hand-verification. It is the third-ticket text-and-pins survivor of the closeout review: no
behaviour changed, in `web/src/desk/` and the notes only.

## What landed

- `web/src/desk/keyboard.ts` — `mayUndo(writable, busy)` now lives here, with the module's own
  header saying why: `TimelinePanel`, `FrameControls` and `PlayerPanel` import `isEditableTarget`
  for a DOM question, so this side must fetch nothing. The only line it has into
  `maskControls.ts` is `import type { MaskBusy, MaskWrite }`, which `verbatimModuleSyntax` erases
  at build; the value edge runs the other way.
- `web/src/desk/maskControls.ts` — imports `mayUndo` from `./keyboard` instead of defining it, and
  `maskControlStates` reads the imported predicate for `undo` unchanged. The module docblock's
  `unreadable` paragraph no longer says no answer is coming: nothing is held for an answer that has
  not landed, and SWR retries the 404, so an answer may still turn the state writable or refused.
- `web/src/desk/MaskPanel.tsx` — the `data-mask-read-failed` paragraph's comment says the same, in
  the same words: `/api/me` has not answered, a retry may land, the desk does not wait on it.
- `web/src/desk/maskPanel.test.ts` — a `readFailureText` helper, and the refusal render now denies
  the read-failure sentence (as do the writable and unanswered renders): a refusal is an answer, so
  the desk's own line must not sit beside the server's.
- `.scratch/pilot-ux/notes/21-the-pins-this-range-still-owes.md` — section 3's framing and its
  decisions 3 and 4 now say what the code does after tickets 22 and 25, rather than the two
  conclusions the following rounds reversed.

## Decisions

1. **`mayUndo` goes to `keyboard.ts`, and the type import back is the price.** The ticket offers
   `keyboard.ts` or "a module both can import that fetches nothing". A third module holding only
   `mayUndo` (plus the `MaskBusy`/`MaskWrite` shapes the chord needs) would exist for the import
   direction and nothing else, and moving `MaskWrite` out of `maskControls.ts` would put the
   permission's four states away from `maskWriteOf`/`MaskRead`, which produce them. So the rule
   moved to the side the panels already import, and the permission's *shape* is imported back as a
   type: `verbatimModuleSyntax` erases it, so no `useSWR` and no React enter a panel through
   `keyboard.ts`, which is the property the finding is about. The header states the direction, so
   the next reader does not have to work it out.
2. **The retry wording is about the present, not the future.** The desk shows its own line while
   the read is `unreadable`; SWR keeps retrying, so "no answer is coming" was a claim the code does
   not make. The two flagged places now say the desk stops holding, not that nothing will arrive —
   the wording `maskWriteOf`'s error arm already had. The other "never answered" shorthand in the
   desk was left alone: it names the read that ended without an answer (SWR's retry is another
   read), and it claims nothing about what happens next.
3. **The `{asked: false, error}` arm stays, with the reason written down.** The ticket offered
   "say in a comment why the arm exists or leave it out". It exists because an error decides
   regardless of `asked`, and it is checked before `isLoading` so a retry in flight cannot read as
   a hold. `useMaskWrite` keys SWR on the Clip, so a read it never made cannot carry an error —
   `asked` is ignored because the combination cannot arise, not because the arm swallows it.
   Removing the arm would not change the settled 404 (it would fall through to `asked`), but it
   would make a retry in flight — `isLoading` true with the earlier error still set — read as a
   hold again, which is the oscillation ticket 22 closed.
4. **The new pin is the negative.** This render cannot reach `unreadable` (SWR's `fallback` seeds
   data, not an error), so the read-failure paragraph's own rendering stays hand-verified; what the
   render can pin is that a refusal is not shown beside it. `readFailureText(html)` returns null in
   all three reachable states — refusal, writable, unanswered — so a panel that worded a read
   failure for a refusal now fails. Checked against the bug: answering `MASK_READ_FAILED` for
   `refused` in `maskReadFailure` fails the refusal test on the new assertion (and only on it).
5. **`notes/21` is brought forward, not rewritten as a history.** Its record of what ticket 21
   landed is kept, and the two reversed decisions say so ("Ticket 21 passed the boolean in from the
   call site; ticket 22 reversed that…") rather than silently reading as if they had always been
   true. Its counts and owner list are ticket 21's and are left as they were.

## Verification

- `pytest`: **272 passed, 1 skipped** — the same count the last three tickets recorded (the backend
  is untouched). The venv's editable install maps `endo_label` at the main checkout, as it does for
  every worktree in this drain; nothing here is Python.
- `web/`: `vitest run` **203 passed** in 21 files (baseline at this ticket's HEAD: the same 203 —
  the two pins are assertions inside existing tests, not new tests); `tsc -b --noEmit` clean;
  `oxlint src` at its two pre-existing warnings (`maskPanel.test.ts` children-prop,
  `desk/EditorCards.tsx` set-state-in-effect).
- This worktree had no `web/node_modules` of its own, so `web/node_modules` was symlinked to the
  main checkout's for the run, as ticket 21 did (gitignored; left in place).
- **Playwright was not run and no e2e spec was added** (AGENTS.md → Verification: the browser stack
  is the owner's while draining).

## What the owner should see by hand

1. **The chord on a non-assignee's Clip.** Open a mask item assigned to someone else and press
   Ctrl/Cmd+Z: nothing is sent, no notice appears, and the browser's own undo still works (focus a
   text field first and its Ctrl+Z still undoes the field). Unchanged by this ticket — it is the
   behaviour the moved rule and the retitled decision now describe.
2. **The failed read.** Make `/api/me?clip_id=…&task_type=mask` fail (stop the API, or delete the
   item's Assignment row): the panel shows "Could not read this Clip's mask permission — mask
   writes are off until it loads." while the read is unreadable, and if a retry lands the controls
   come back and that line goes. The paragraph's own rendering is pinned in `maskPanel.test.ts`
   since ticket 26 (the failed read is seeded into SWR's cache, which the `fallback` cannot carry);
   what stays by hand is the retry landing.

## Leftovers, deliberately out of this issue

- **The import direction is pinned in `keyboard.test.ts` since ticket 26.** That test walks
  `keyboard.ts`'s value imports from the source and fails on any that reaches a module with imports;
  what it does not replace is a lint boundary (`no-restricted-imports` or `import/no-cycle`, which
  would live in `web/.oxlintrc.json`), and it watches imports rather than module bodies.
- **`isEditableTarget` still has no in-process pin** (tickets 21 and 22's leftover, unchanged).
- **`web/src/desk/maskSession.ts` and the other "never answered" shorthands** still use that phrase
  for the unreadable state; it names the read, not the future, so this ticket did not touch them.
