# Double-click rename of a phase or class-tag name rewrites every Clip

Phase and class tables list desk-wide vocab. Double-click a name, commit a new string: that list is renamed and every Frame document of that kind that stored the old string is rewritten. Empty and duplicate names are rejected. A class-tag `grasper` is not the same list as triplet instrument `grasper`. Triplet **cells** are not this operation: changing a cell updates only that row on this Frame; typing a new word adds it to the matching list and uses it.

## Considered Options

- **Add-only vocab (parent spec)** — superseded for phase and class-tag names; add via the empty row remains.
- **Rename the picker only, leave Frame strings** — rejected; the table and the Frame would disagree.
- **Per-Clip rename** — rejected; there is one desk vocab.

## Consequences

- New vocab rename HTTP. It must rewrite all Clip documents of that kind in one request, or refuse.
- Vocab **delete** is still out of this pass.
- Triplet instance edit may PUT that Frame’s rows; it must not scan other Clips.
