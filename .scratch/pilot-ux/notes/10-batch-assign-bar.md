# pilot-ux/10 — Batch assign bar: implementation notes

The issue body (`issues/10-batch-assign-bar.md`) is the frozen brief; this file is the working
record of what landed, what was decided where the body left room, and how it was verified.

## What landed

- `endo_label/coordination.py`
  - `batch_assign_items(path, *, items, assignee=None, reviewer=None, allow_reassign=False,
    account_id)`. It walks the items in the order asked (the same pair twice is one item), answers
    each one on its own, and returns `{"assigned": [...], "skipped": [{clip_id, task_type,
    reason}]}`. It **calls `assign_item` / `reassign_item` / `assign_reviewer`** rather than
    re-implementing the transitions, so the state machine still has one writer and the batch cannot
    drift from the single-item routes (which stay exactly as they were).
  - `_batch_state_refusal(state, *, reviewer, holder, allow_reassign)` is the one place a state
    answers for itself; `_batch_item` re-reads an item when a transition loses a race, so a
    conflict becomes a per-item sentence instead of a lost row or a 500.
  - An **unknown Account is the one request-level failure** (404, before anything is written): the
    name is the same for every item, so no row could answer it differently. Everything else —
    unknown item, wrong state, non-member, reviewer == assignee — is a per-item skip, and the
    successes are kept: the answer is per item, never all-or-nothing.
- `endo_label/items_router.py` — `POST /api/items/batch-assign` (admin-only), body
  `{items: [{clip_id, task_type}], assignee?, reviewer?, allow_reassign?}`. Exactly one of
  `assignee` / `reviewer` is required (400 otherwise). After the commit it publishes **one
  transition per assigned item**, named the way its single-item route names it (`assign` /
  `reassign` / `assign_reviewer`), so `/api/events` subscribers and the workflow push see a batch
  as the individual moves it is.
- `web/src/batchAssign.ts` (+ `.test.ts`) — the board's rendering of all of that: which state each
  action takes, the button that names the count, the reassign confirm, the notice and its tags, and
  the account picker's Project grouping.
- `web/src/AssignmentsBoard.tsx` — the selection now spans the columns and a sticky `Batch assign`
  bar carries the account picker, the action, the primary button, the confirm, the notice and the
  skipped items; each row's control is the same account picker instead of a free-text username.

## Decisions the body left room for

1. **One state, one move.** Unassigned → `Assign`, Labeling → `Reassign`, Submitted →
   `Assign reviewer`; Reviewing and Done are not selectable at all and say why in the row
   (`Reviewing is not assignable`, `Done is final`) where the checkbox would be. So a batch never
   has an ambiguous item, and the bar's action is the thing that decides what the ticked rows mean.
   Changing the *reviewer* of a Reviewing item is still only the single route's path — the batch has
   no move for it, which is why Reviewing rows stay out of the selection.
2. **`allow_reassign` is the caller confirming it has named the holder**, not a UI-only flag.
   Without it a Labeling item answers `Labeling — alice holds it` and is not taken; with it the
   same call reassigns. The board makes that flag honest with a two-step confirm: the first press
   only *asks* (`Takes 3 items from alice`), and only `Confirm reassign` sends
   `allow_reassign: true`. A stray API call can therefore never silently take work off someone.
3. **The batch only takes the states its action names**, even when `allow_reassign` is set: the
   bar sends only the rows that match the chosen action, and both Unassigned and Labeling land under
   the assignee path (one `assignee` request, one `allow_reassign` flag) — the check order in the
   server is state first, flag second.
4. **The picker's scope is the Projects the action's ticked rows touch**; with nothing ticked yet it
   offers every Project, which is what makes Account-first work. Membership (09) is the only source:
   grouped under one `<optgroup>` per Project, sorted by name, an Account that is a member of
   several Projects appears **once** (where it first appears), and an Account in none of them is
   never offered. If the ticked rows move the Account out of scope the choice is **kept and named**
   (`carol — not a member of these Projects`) rather than blanked: the choice survives between
   batches, and the server's per-item sentence is the answer rather than a surprise.
5. **A row's reviewer picker does not offer the item's annotator.** The batch's reviewer list is
   shared by items with different annotators, so there the rule is answered per item
   (`alice is the assignee — pick another reviewer`). Membership does not gate the reviewer path —
   09 gated the assignee paths only — so the batch mirrors `assign_reviewer` exactly and refuses
   nothing extra.
6. **The notice's tag comes from the server's sentence**, not from a parallel code: the leftmost
   word of a refusal is its cause (a state name), and `skipTag` maps the two non-state causes
   (`Not a member`, `Reviewer is the assignee`) plus `No such item`, with `Skipped` as the fallback
   so an unforeseen sentence still lands in the count. The `3 skipped (Done)` grouping is therefore
   exactly the sentences the board also prints beside the skipped rows.
7. **A batch that spans Projects answers per item instead of being rearranged.** D12 puts
   cross-Project batch assignment out of scope, so the bar does not offer it as a move: the picker
   is scoped to the Projects the ticked rows are in, and when the selection still spans studies the
   Account's refusals come back one item at a time (`Not a member`) rather than the bar quietly
   dropping rows or picking a second Account for the rest. The All-Projects view is the only place
   this is reachable, and the notice plus the skipped list say exactly what happened.

## Verification

- `pytest tests` — **237 passed, 1 skipped** (baseline before this issue: 223 passed, 1 skipped).
  New `tests/test_batch_assign.py` (14 tests): one gesture over several Task types of one Clip and
  across two Clips; a refused item not taking the successes with it; the holder being named and the
  flag being required; reviewer == assignee refused per item; a non-member refused by sentence while
  the member's items land; unknown items skipped rather than 404; the same pair sent twice; exactly
  one of assignee/reviewer; admin-only; the board's own rows as the input; and the three exhaustive
  `*_answers_the_five_states` tests, which pin the sentence for every state under each action.
- Live smoke (throwaway config in `/tmp`, `uvicorn` on `:7898`, `PYTHONPATH` pointed at this worktree
  — the venv's `endo_label` is an editable install of the main checkout, so `python -m endo_label`
  from elsewhere serves Main's code and gives a 405 for this route), curl + `curl -N` on
  `/api/events`: 3 items in one gesture → 3× `assign`; the same item again → `Labeling — alice holds
  it`; with `allow_reassign` → `reassign`; a cross-Project batch → the member assigned and
  `boss is not a member of Project Ward — add them first.` skipped; a Reviewing/Done/unknown-item
  mix → 1 assigned, 2 skipped; both/neither assignee → 400, unknown Account → 404; reviewer ==
  annotator → `boss is the assignee — pick another reviewer`; a real reviewer → `Reviewing`, and a
  Labeling neighbour → `Labeling is not ready for review`; `GET /api/items` agreed throughout. An
  SSE subscriber watched two items in one call and received `assign` then `reassign`, in order.
- `web/`: `tsc -p tsconfig.app.json --noEmit` clean, `vitest run` **150 passed** (baseline 139; 11
  new in `batchAssign.test.ts`), `oxlint` clean apart from the pre-existing
  `desk/EditorCards.tsx:352` warning.
- **Playwright was not run** — no browsers are installed on this machine, and the browser stack is
  the owner's while draining. `web/e2e/multiuser.spec.ts` was updated for the new control (three
  lines: the two per-row assigns and the reviewer assign now `selectOption` an Account from the
  picker instead of `fill`ing a username), but no e2e test was added.
- `vite build` was deliberately **not** run (AGENTS.md), so the SPA bundle is not part of this
  verification; the change is typechecked and the logic under the bar is unit-tested.

## Leftovers, deliberately out of this issue

- The **auto-assign form still takes comma-separated usernames**, so a typo there is still a 404
  (the per-row control was the surface the ticket names). Spreading items across several Accounts is
  that path by decision, and its multi-Account input is not the same control as a one-Account
  picker. Worth a follow-up datalist over the same grouped member list.
- The batch has **no move for a Reviewing item** (e.g. swapping its reviewer). `assign_reviewer`
  only takes Submitted, and changing that is a state-machine question, not a board one.
- `coordination._account_name` (04's leftover, already noted in 09) still queries a table named
  `accounts`; untouched here.
- The board's row control offers every member of the Project, whatever their roles — a Submitted
  row's reviewer picker does not filter to `reviewer`-flagged Accounts (the server never required
  it, and `GET /api/projects` does not carry roles). The assignee is filtered out because that
  pairing *is* refused.
- No new domain term: "Assignment", "Project membership", "Auto-assign" and the state names already
  say all of it, and `CONTEXT.md` is ticket 11's file — if it wants the one-gesture reading of
  assignment written down, it belongs in that entry, not here.
