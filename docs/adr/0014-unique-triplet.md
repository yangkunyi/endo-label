# One exact triple per Frame; submit again toggles it off

A Frame may have several triplet rows, but not two with the same instrument + verb + target. Submitting a triple that is already on this Frame deletes that row (toggle), same idea as a class flag. Span add already skipped Frames that held the triple ([ADR 0008](./0008-class-triplet-span.md)); this-frame POST no longer appends a duplicate. Old documents that already stored duplicates collapse on the next write of that Frame (all matching rows go away when toggled off).

This punches a hole in “stores stay” for the desk rewrite: the triplet this-frame write is no longer “always append.”

## Considered Options

- **Allow identical triples** (phase-class-triplet story 44) — rejected; the labeler wants Pick+Create to toggle, and a second instance of the same action cannot be told apart without a Track.
- **UI-only toggle, server still appends** — rejected; a raw POST would disagree with the desk.

## Consequences

- `test_triplet_rows_stack_and_allow_identical_triples` must change.
- Delete-by-id still valid for a visible row; toggle is the combobox path.
