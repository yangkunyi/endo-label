# Vocab lists start empty and a name can be deleted

Phase, class, and triplet lists are not shipped with seed names (`Preparation`, `grasper`, …). Plus still adds. A trash control deletes a name from that desk list. Deleting a phase or class-tag name is the inverse of rename (ADR 0010): one request removes it from the list and rewrites every Clip of that kind (phase becomes unlabeled; the class flag is dropped), or fails with no Clip left half-updated. Deleting an instrument, verb, or target name is **refused** while any triplet row still uses that string. An existing `vocab.json` is not wiped on upgrade; the labeler deletes leftover seed names with trash. Class-tag `grasper` is still not triplet instrument `grasper`.

## Considered Options

- **Keep seed, still no delete** — rejected; the labeler could not remove default names.
- **Empty seed only, no delete** — rejected; a sitting that already wrote `vocab.json` would keep the old names.
- **Leave orphan strings on Frames** — rejected; the table and the Frame would disagree (same reason as rename).
- **Strip triplet rows that contain a deleted instrument/verb/target** — rejected; a row is three names, not one vocab line. Edit or delete the row first.

## Consequences

- ADR 0010’s “vocab delete is still out of this pass” is superseded.
- x on a table row still means this Frame only (clear phase, turn a class flag off, delete a triplet instance). Trash is a separate control.
- Compose tests that assumed seed names (`Preparation`, …) must add those names first.
