# Coverage is not completion: "has at least one identity", and no Frame-level cleared bit

The trial question "how far has the labeling got?" gets a visual answer (the Coverage Strip, mask's
own coverage row, Track lanes) and a navigation answer (`n` jumps to the next Unlabeled gap). Coverage
means exactly one thing: a Frame carries at least one identity of the Task type being asked about.
phase / class / triplet labels are a sparse positive store, so covered and Unlabeled gap are read
straight off the documents the desk already fetches — answering the question writes nothing, and no
new endpoint exists for it.

There is deliberately **no Frame-level "checked, nothing here" record**. A Frame with no phase label
looks identical whether the labeler judged it blameless and moved on or never opened it, and we accept
that. A negative record would double the store (every Frame needs a row, not just the labeled ones),
hand the labeler a second thing to maintain on every Frame, and put a second source of truth beside
the labels themselves — to answer a question nobody downstream asked: a phase-less or blurred stretch
is a valid answer, not an unfinished one. Coverage is also not per Frame state the desk keeps; it is
derived from the labels each time it is drawn.

Submit therefore stays unblocked by coverage, and coverage is not a Review state. The workflow already
says a Clip is usable downstream from **Submitted** onward (reviewed-by, not coverage, is what review
tells apart), so gating Submit on coverage would make an unlabeled tail a workflow dead end. Submitting
with gaps succeeds; the desk first says how much is missing
(`Submitting with 32 of 120 frames unlabeled for class`), and both the desk and the board's Submit say
it. `n` reports when there is nothing left instead of silently doing nothing. Neither is a modal,
neither is a refusal.

**What would have to change to add a cleared bit.** The decision is deferred, not forbidden, and its
shape is known: a durable per-(Frame, Task type) negative record with its own write path and version.
A boolean cannot ride on the label documents unchanged — they are positive-only, and their optimistic
version is the Clip's (ADR 0027), so clearing a Frame would need a write that the current shapes
cannot express. Coverage would then have three states per Frame (covered / cleared / never looked
at), the strip would grow a third appearance, `n` and the Submit hint would count *uncleared* rather
than uncovered, and Unlabeled gap would split into "unseen" and "cleared empty". That is a store
change plus a migration story, not a UI tweak — not worth it until someone needs the distinction.

## Considered Options

- **A Frame-level "checked, nothing here" bit now** — rejected, for the doubling, the second source of
  truth, and the chore with no consumer named above.
- **Block Submit on incomplete coverage** — rejected; it contradicts "usable from Submitted onward" and
  turns a legitimate empty stretch into an error.
- **Show a completion percentage instead of where the gaps are** — rejected; the strip's job is to say
  *where* the gaps are, so a click can seek there. A score sitting next to the same numbers would mean
  something else and invite treating coverage as a gate.
- **Infer "looked at" from navigation** (Frames the Playhead visited, or the mask Session's state) —
  rejected; navigation is not a label write, it does not survive a Session, and it would make phase /
  class / triplet coverage depend on mask state that they deliberately do not need.

## Consequences

- The strip, the `n` jump, and the Submit hint read one derived map per Task type; the counts must not
  be recomputed from a second source.
- mask gets its own coverage row and Track lanes — it is not a Task focus tab, so mask is never in the
  strip, and Track lanes are read-only rows that seek but cannot be painted or trimmed.
- A Clip with no labels at all renders one gap rather than an error; an empty Clip still shows the
  strip, as it shows the Ruler and the Lane well.
- Reopening this ADR means a new store shape, not a UI adjustment.
