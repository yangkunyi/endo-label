# pilot-ux/23 — choose patches the selection in force, not a snapshot: implementation notes

The issue body (`issues/23-choose-patches-the-selection-in-force.md`) is frozen; this file is the
working record of what landed, the decision the finding left open, and what is left for the owner's
hand-verification.

The finding is the middle survivor of the closeout review over `pilot-ux/19`: `choose` closed over
`filters` (the render's read of the stored value) and wrote `chooseClipFilters(filters, patch)` to
both the state and `localStorage`. While `/api/me` was unanswered the read narrows `scope: "all"` to
`mine`, so an admin's first Project or tag pick in that window wrote `scope: "mine"` over what was
stored — the exact loss `resolveClipFilters` promises not to commit, and with no sentence left by
then. The same snapshot base made an event's second `choose` patch the value the callback was made
with, losing the first patch.

## The shape of the fix

The change is a patch of the selection **in force**, applied as a function of the state the change
lands on, and never of the value a render captured.

- `web/src/clipFilters.ts`
  - `chooseClipFilters(stored, caller, options, patch)` is now the whole decision, pure: the base is
    the selection in force for this caller and this option list — the read's `filters` once the read
    has a correction, the reader's stored value while it has none — and only the fields in `patch`
    change. `entry` is the read's correction (`clipFiltersView`), and `entry ?? stored` is exactly
    the value the hook's entry effect writes, so "the value in force" is one sentence in the module
    instead of a convention in the hook. **`pilot-ux/24` replaced that single base**: the basis is
    now field by field — `project`/`tag` from the resolution, `scope` from the reader's stored value
    until `/api/me` answers — so `entry ?? stored` is no longer an expression in the module (see
    `24-a-change-does-not-decide-an-unanswered-field.md`).
  - The module header, `ClipFilterCaller`, `ClipFilterResolution.corrected`, `ClipFiltersView` and
    `chooseClipFilters` say what the write path now does.
- `web/src/useClipFilters.ts`
  - `choose` is `setStored((current) => applyClipFilterChange(current, caller, options, patch))`: a
    functional update, so an event's changes fold over what the previous one produced, and the
    closure's `filters` is not a base at all. **`pilot-ux/24` moved the call from a bare
    `chooseClipFilters` to `applyClipFilterChange`, which folds the change and then writes the
    browser's entry** (`saveStoredClipFilters`), so the write is no longer a pure fold. `caller` and
    `options` are memoised so the view and the callback keep stable identities.
  - The write effect is `saveStoredClipFilters(entry ?? stored)` — the browser's entry is the
    correction when the read has one and the reader's value otherwise. A pick while `/api/me` is in
    flight therefore writes the patched stored value (`all` intact) instead of the read's narrowing.
    **`pilot-ux/24` made the effect write the read's `entry` and nothing else, and moved the write of
    a change into `applyClipFilterChange`**, so a browser whose reader never chooses a filter gains
    no entry; the pick-while-in-flight outcome above is unchanged.
- `web/src/clipFilters.test.ts` — the pick-while-unknown pin is rewritten to the new base, the
  /19 pins for the corrected caller and the sentence's lifetime are kept (with the new signature),
  and a pin for two changes in one event is added.
- `web/e2e/clip-scope.spec.ts` — the header comment says what the change patches. No assertion
  changed, no spec added, and the stack was not run (AGENTS.md → Verification).

## The decision the finding left open

The issue names the mechanism ("patch the raw stored selection functionally") and states the outcome
it is for ("an admin's own stored `all` is not the browser's to lose while `/api/me` is in flight");
the review's own consolidation note allowed either ("a functional update over the raw stored value
**or otherwise not lose an unknown caller's stored `all`**"). The mechanism landed as **patch the
raw stored selection while the Account is unknown, and the read's correction once it is answered**,
because that is the only one of the two that leaves `pilot-ux/19`'s landed and pinned behaviour
intact. (`pilot-ux/24` made the same choice field by field rather than whole-value: `project`/`tag`
come from the resolution, and only `scope` waits for the answer.)

- Under the always-raw alternative, a change never replaces the stored fields it did not touch, so a
  non-admin whose stored scope is `all` (a shared browser, or a revoked flag) keeps the sentence
  "Every Clip is the admin's scope; showing your own Clips." for the whole session — they have no
  scope control to replace the field with. That reverses /19's acceptance ("it goes when they change
  a filter") and its pin *"the sentence outlives the entry's correction, and a change ends it"*
  without this ticket asking for it. The ticket's own sentence scopes the mechanism to the window
  that is broken: "only the field the reader touched is written **while the Account is unknown**".
- The correction only exists once the read has an answer, and it is already what the browser's entry
  holds; patching it from then on is what /19 established ("a change is what replaces the stored
  value"), and it is what keeps a refused scope out of the reader's state as well as the entry.
- The /api/me window is untouched either way: while `corrected` is false there is no `entry`, so the
  base is the reader's stored value, field by field, and the admin's `all` survives.

Everything else in the hook keeps /19's shape: the reader's stored value is the state, the read's
correction goes to the entry in an effect and never back into the state, so the sentence outlives
the entry write and ends when the reader's own change replaces the value it is about.

## The pins

- An admin's `all` survives a Project and a tag pick made while `/api/me` is unanswered:
  `chooseClipFilters(WEST_ALL, { isAdmin: null }, options, …)` keeps `scope: "all"` for both, and the
  flag answering admin then asks with it as stored. The pin is a real one because the Account is an
  input to the pure function: a base that used the read's `filters` for an unknown caller fails it.
- Two changes in one event both land: **`pilot-ux/24` moved this fold to `applyClipFilterChange`
  and the fake storage** — the seam the hook actually calls — so the pin also asserts that the
  change wrote itself. Ticket 23's test folded `[{ tag }, { project }]` through `chooseClipFilters`
  (what the hook's functional `setStored` did) and showed the one-snapshot base losing the first
  change.
- The sentence's lifetime and the corrected caller's pick stay as /19 pinned them.

## Verification

- `web/`: `vitest run` **197 passed** in 21 files (baseline in this worktree: 196 in 21 — the
  pick-while-unknown test is rewritten, the corrected-caller test and the lifetime test keep their
  coverage with the new signature, and the two-changes-in-one-event test is added). `tsc -b --noEmit`
  clean. `oxlint` exit 0; the two warnings (`EditorCards.tsx:352`, `maskPanel.test.ts:65`) are
  pre-existing.
- `pytest`: **272 passed, 1 skipped** — no Python changed.
- This worktree has no `web/node_modules` of its own, so it was symlinked to the main checkout's
  (gitignored; left in place so the suite runs here).
- **Playwright was not run** (AGENTS.md: the browser stack is the owner's while draining), and no
  spec was added. The only e2e change is the file's header comment.

## What the owner should see by hand

1. As an **admin**, with `/api/me` slow (or by throttling the network), pick a Project or a tag on
   `/clips` before the Account answers. `localStorage` (key `endo_label:clip_filters-v1`) still holds
   `"scope": "all"`; once `/api/me` answers, the list is that Project/tag of every Clip and no
   sentence appears.
2. Same window as a **non-admin** on a browser that stored `all`: the pick keeps `all` while the
   Account is unknown; when `/api/me` answers `mine`, the sentence appears and the entry becomes
   `mine`, and the next pick (which patches the correction) ends the sentence — the /19 behaviour
   unchanged.
3. `/19`'s own hand-verification (admin stores `all`, logs out, annotator logs in, changes a filter)
   still passes: the sentence is readable and goes when the filter changes.

## Leftovers, deliberately out of this issue

- The hook's React wiring is still not executed by vitest (no DOM, no new dependency): what is pinned
  is the pure decision the hook calls, and the one line of `setStored`/`useEffect` around it is
  asserted only by the e2e spec the owner runs.
- The `notice` still has no per-surface persistence across navigation (/19's leftover), and a flag
  revoked mid-session still lands as the server's sentence until `/api/me` revalidates (13's).
