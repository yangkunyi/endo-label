# desk-interaction/01 — One step back for label writes

**What to build:** the server half of the interaction review's F4
(`docs/specs/2026-09-15-desk-interaction.md`): a one-step undo for the phase, class and triplet
documents, gated exactly like the write it undoes, and visible to the desk before the click.

`desk-interaction/02` (the desk pass) is blocked by this ticket and wires the button. It builds
against the interface named under "The interface 02 will build against" — keep it exactly, or say in
your note what you changed and why.

## Why

Every write in the desk is immediate: ADR 0025 removed the Save button, the label editors commit on
the click, and `Remove from frames 0–13` erases a range in one press. The mask has an Undo (button and
chord) for its own Session; the label documents have nothing. `undo` appears in the Python tree only
under `endo_label/mask/`. So the desk's most common gesture is its most irreversible one — which is
also why the review wanted confirmations, and why this ticket replaces the confirmation with
recoverability instead (the review's F3 is answered by this ticket; `desk-interaction/02` records
that decision and changes no dialog).

## What happens today

Each of the three sibling backends does the same four things
(`endo_label/phase/router.py`, `endo_label/frame_class/router.py`, `endo_label/triplet/router.py`):

```python
doc = labels_store.load_clip(settings, "phase", clip_id)     # whole document
...                                                          # mutate
labels_store.save_clip(settings, "phase", clip_id, doc)      # whole document, atomic tmp+replace
return with_new_version(_view(doc), new_version)
```

- `require_label_write(request, clip_id, kind, body.version)` is what bumps the Clip's `clips.version`
  in the coordination DB and raises `VersionConflict` → 409 (`endo_label/auth.py:142`, `:163`).
- `require_label_assignee(request, clip_id, kind)` is ADR 0030's gate, and its refusal sentence is the
  same one `/api/me` reports as `write_refusal` (`_write_refusal`, `endo_label/coordination.py`).
- `labels_store._write` already writes a `.tmp` and `replace`s it.
- There is no previous document anywhere: the load-mutate-save is destructive by construction.

## What to build

1. **Keep the document in force before each successful write**, per (Clip, Task type). Where it lives
   is yours to choose and to name in the note — a `prev` sibling of the Clip's json
   (`settings.labels_root/<kind>/<clip_id>.prev.json`) is the obvious one, and it should be written
   through the same tmp+replace discipline. It must be written **in the same act as the write**: a
   snapshot that survives a write that was refused (404 frame, unknown vocabulary name, 409 version,
   403 assignee) is a bug, and a write that lands without its snapshot is a bug too.
2. **`POST /api/<kind>/{clip_id}/undo`** — restores that document, bumps the Clip version the way a
   write does (`with_new_version`), and answers the same view shape as a write.
3. **One step, consumed.** After an undo there is nothing to undo, and a second press must not flip
   the labels back. This is not a redo toggle: the desk has no redo (the mask has none either, and
   `tests/test_mask_session.py` pins that for the mask). Answer the second undo with a refusal that
   says there is nothing to undo, not with a restore.
4. **The gate is the write gate, not a second one.** An undo is a write to that item's labels:
   `require_label_assignee` then `require_label_write(..., body.version)`. A non-assignee's undo is
   refused with the *same sentence* its write gets (byte for byte — `tests/test_refused_write.py` is
   the file that pins `/api/me`'s `write_refusal` against the 403 detail, so extend that shape), a
   stale version is the same 409, and an item whose labels are frozen (Submitted/Done/Reviewing by
   someone else) refuses an undo exactly as it refuses a write. This is the failure this design must
   not have: an undo that writes labels for an account the gate would turn away.
5. **The desk must see it before the click.** The Clip's read for that kind carries whether an undo is
   available (a boolean on the view `GET /api/<kind>/{clip_id}` already returns), because ADR 0030's
   discipline is that the desk shows the answer before the click rather than offering a button that
   answers "nothing to undo". Same field name on all three kinds, and truthful after a write, after an
   undo, and after a write that was refused.
6. **Whole-document restore.** A span erase over fourteen frames comes back in one step, because the
   document does. A vocabulary deletion (`DELETE /api/registry/{vocab_id}`) is *not* covered — that is
   a registry write, not a label write, and the desk keeps its confirmation for it.
7. Do not touch `endo_label/mask/`: the mask's Session undo is its own, and it does not share this
   storage.

## The interface `desk-interaction/02` will build against

- `POST /api/phase/{clip_id}/undo`, `POST /api/class/{clip_id}/undo`,
  `POST /api/triplet/{clip_id}/undo`; body `{"version": <int> | null}`; 200 returns the write's own
  view plus the bumped `version` and `undo_available: false`.
- `GET /api/phase/{clip_id}` (and its two siblings) returns `undo_available: <bool>`.
- Refusals keep their existing status codes and sentences: 403 (the write's sentence), 409 (version
  conflict), 404 (no such Clip), and a 200-or-4xx answer that names "nothing to undo" for a second
  press — pick the code, name it in the note, and pin it.

## Acceptance

- [ ] a span write then an undo restores every Frame the span touched, in one step, and the Clip's
      version moved forward for both the write and the undo
- [ ] a single-Frame write then an undo restores that Frame (and removes a Frame that had nothing)
- [ ] a second undo is refused with a sentence that says there is nothing to undo, and the labels are
      unchanged by the attempt
- [ ] a non-assignee's undo is refused with the same sentence its write gets, byte for byte
- [ ] a stale `version` on the undo is the same 409 a write gets
- [ ] an item in a frozen state (Submitted or Done, someone else's Reviewing) refuses an undo
- [ ] a refused write (bad frame index, unknown vocabulary name, version conflict) leaves no snapshot
      behind — the next undo does not claim a write that never happened
- [ ] `undo_available` is false before any write, true after one, false after the undo, and false again
      after the snapshot is consumed
- [ ] each pin fails when the behaviour it names is removed (say in the note which one you undid to
      check)
- [ ] `python -m pytest tests -q` green, run with `web/dist` present as well as without it (the two
      configurations the gate has been read in before); `web/` untouched, so vitest and tsc are
      untouched
- [ ] an ADR bullet records that an undo is a label write and passes the same gate (extend
      `docs/adr/0030-assignment-is-the-only-label-write-gate.md`), and this ticket's note says where
      the previous document is kept, what the second-press answer is, and why one step is the whole
      of it

Do not touch `web/` — `desk-interaction/02` owns it, and it is blocked on this ticket. Do not add
Playwright specs and do not run the browser stack: it is the owner's while draining (AGENTS.md →
Verification).
