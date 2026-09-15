# Assignment is the only label-write gate: mask included, and an admin self-assigns before masking

Every Task type is written under the same rule, mask included: the item's Assignment is the only key,
and no role flag is one. In **Labeling** the assignee writes the Task type's labels on the Clip; in
**Review** the assigned reviewer does; Submitted and Done are frozen. `capabilities.item_capabilities`
computes that cell as `edit_labels`, `coordination._write_allowed` reads the same cell with
`admin=False, reviewer=False` on purpose, and `endo_label/mask/http.py` puts every mask write behind
`require_label_assignee(request, clip_id, "mask")` — Predict, Propagate, Undo, Clear mask, pin delete,
Track Label edits, Track deletes, save and review. So an admin who wants to mask an item **self-assigns
it first**: `assign` (or `reassign`) hands it over, `edit_labels` turns true for them exactly as it
would for any other Account, and the editor opens. One extra click, and it is the click that leaves a
record of who held the item — an admin bypass would leave none, and claim-on-first-write would put the
ownership decision inside the write it is meant to gate.

The refusal is a sentence, not a status, and the desk must be able to say it *before* the click. Ticket
23's finding was a non-assignee seeing an enabled mask editor and learning the truth from
`403 Forbidden` rendered as "Predict failed". So the sentence has one author: `/api/me`'s per-item
payload now carries `write_refusal`, which is `coordination._write_refusal`'s wording for that Account,
that item and that Task type — byte for byte the `detail` the refused call would carry — and `null`
whenever `edit_labels` is true. The desk renders the mask editor's write controls from that cell and
nothing else: disabled when it is false, with the sentence beside them. `edit_labels` and the sentence
arrive in one answer, so a disabled control and a refused call cannot disagree — the same property
`capabilities.py` states for the buttons.

Reading is not writing, and the desk keeps looking. A non-assignee still opens the Clip, sees its
Tracks, the silhouettes on every Frame and the Track Lanes, and can select a Track and show or hide its
lane; what goes away is Predict, Propagate, Undo, Clear mask, New Track, Track Label edits, Track
deletes and the picture prompts that would schedule a Predict. There is no Save control to gate: ADR
0025 writes the Annotation on each successful edit.

## Considered Options

- **The admin as a special writer** — rejected; the admin's role gates *handing work out* (assign,
  reassign, unassign, assign_reviewer) and the review transitions, never the label payload. A second
  rule for one role would have to be repeated in every Task type's guard, and the labeler of a Clip
  could not tell who wrote what.
- **Claim-on-first-write** — rejected; it makes the first write its own grant, so a bystander's misclick
  silently takes a Clip away from its assignee, an audit of "who held this item" stops meaning
  anything, and the refusal sentence has nothing to name.
- **A mask-only exception** — rejected; mask is the heaviest editor and the one whose ownership costs
  the most to get wrong, which is an argument for the rule, not against it. `coordination.TASK_TYPES`
  holds mask beside phase, class and triplet, and the desk treats it as one of the Clip's items.
- **Hiding the mask editor from a non-assignee** — rejected; ticket 23 asked for the *writes* the desk
  showed and could not make, not for the mask to disappear. Membership and Assignment say who is given
  work and who writes it, never who may look (ADR 0028).
- **A second ownership table for mask** — rejected; the Assignment already stores (Clip, Task type).

## Consequences

- `_write_allowed`'s hardcoded `admin=False, reviewer=False` stands as the decision, not as a
  placeholder for a bypass.
- The desk's gate is one pure mapping (`web/src/desk/maskControls.ts`, pinned by vitest both
  as a mapping and as the desk rendered from it — the panel's controls and the canvas's
  pointer gate): the write controls follow `edit_labels`,
  the view controls (Track selection, Lane eyes) do not, and a write in flight only ever
  subtracts. The mask panel, the Track rail, the picture overlay and the editor rail's phase / class /
  triplet editors all read it, so the desk
  has no second opinion about who may write.
- A sentence the desk shows for a refusal comes from the server; the desk words no refusal of its
  own. One line is the desk's: a `/api/me` read that ended without an answer has no server sentence
  to show, so the surface says it could not read the permission — a statement about the read, never
  about ownership. The phase, class and triplet editors read the same cell — `useItemWrite(clipId,
  focus)` in `web/src/desk/EditorRail.tsx` — and show the same sentence before the click, having been
  the one place left that still learned the truth from its own 403; each surface words the read that
  never answered in its own line (`MASK_READ_FAILED`, `LABEL_READ_FAILED`), which is the only thing
  they do not share. Vocab and registry writes are a different gate: they follow the Project's
  word-list capabilities, not this Clip's item.
- The e2e harness assigns every Clip × Task type before it touches the desk (`ensureLabelingFor`), so
  issue 22's sitting states the decision rather than working around it.
- The permission has four states, not two (`maskControls.ts`'s `ItemWrite`). `unknown` is an item cell
  the desk has not read yet — no Clip open, or the read in flight — and it is not a false reading of a
  refusal: the editor renders off and explains nothing, the canvas holds the first prompt drawn while
  the read is out (its gate is `checking`, not `refused`), and the answer that lands writable is what
  sends it. `unreadable` is a read that ended without an answer — a (Clip, Task type) pair `/api/me`
  answers 404 for, which is what a mask Assignment row deleted by hand looks like, or a request that
  failed — and it is not the held `unknown`: no answer is coming, so nothing is held for one and the
  editor says in its own words that it could not read the permission. Registration creates all four
  rows per Clip (`coordination._ensure_assignment_rows`), so the 404 arm is a hand-made store's shape,
  not the state machine's.
