# Triplet vocab is the table of exact triples; Library is this-Frame toggle plus desk-wide delete

Phase and class already treat one string as a desk-wide Vocab name (rename/delete rewrite every Clip). Triplet did not: three independent lists (`instruments`, `verbs`, `targets`) were the vocab, Library rows were a composed shortcut, and deleting a column name was refused while any row used it. That made add/delete feel unlike class, hid trash behind List, and left Now unable to dismiss a label.

**Vocab for triplet is the exact triple** (instrument + verb + target as one identity). The Library table is that list. Plus adds a row to the list only, not this Frame. Clicking a Library row toggles this Frame (selected = on this Frame). Now stays read-only. Trash on a Library row deletes that identity desk-wide (confirm): phase unlabeled, class flag dropped, or that triplet row removed from every Clip. Double-click renames a phase or class name, or one cell of a Vocab triple, rewriting every matching Clip; a triple-cell rename is **refused** if any Frame would then hold two identical triples. The folded List section goes away.

Migration: drop the three column lists. Existing triplet **rows on Frames stay**. The new table is the unique exact triples already on disk. Unused words that never appeared in a row are discarded. Typeahead for a new triple is words that already occur in the table.

Span Mark from / Apply / Remove still paints an interval of the paint chip; it is not how a Vocab name is deleted.

This supersedes ADR 0010’s “triplet cells are not desk-wide rename” for **Vocab** rows (this-Frame instance cells are still not a separate editor). It supersedes ADR 0012’s refuse-delete-while-in-use rule for instrument/verb/target names — those lists no longer exist. ADR 0014 (one exact triple per Frame, submit toggles) still holds.

## Considered Options

- **Keep three column vocabs** — rejected; the labeler wants each combination as a table row, one identity.
- **Cartesian product of the old lists** — rejected; explodes.
- **Wipe existing triplet rows with the old lists** — rejected; only the column lists go.
- **Leave Frame triples without a Vocab table** — rejected; names and Frames must agree.
- **Silent merge on rename collision** — rejected; do not drop a row without saying no.
- **Now click-to-clear this Frame** — rejected this pass; Now stays read-only, Library shows selected and toggles.
- **Plus writes this Frame** — rejected; adding a name and labeling this Frame stay separate.
