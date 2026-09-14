## Spec report

### (a) Missing / partial
None for ticket 17 id-contract.

Compose covers: rename without file rewrite; archive keeps labels + drops picker; hard-delete 409 referenced / 200 zero-ref; disk stores ids.

Spec Label file storage also says “Save requests must carry the clip version read from the DB; mismatch returns 409.” Not in this diff (ticket 11, not 17 What to build).

### (b) Scope creep
Little extra: paint of archived name is 400 (`find_active`). Ticket only: “the picker set no longer offers the word.” Fits existing unknown-name 400; not a new product.

`DELETE /api/registry/{vocab_id}` is asked (hard delete), not creep.

### (c) Implemented but wrong
**PUT uniqueness hole.** Ticket: “all existing behavior tests green under the new semantics (triple uniqueness…)”. CONTEXT Triplet: “One Frame holds at most one row per exact triple.” POST/span use `_same_vocab`. PUT `/api/triplet/.../{triplet_id}` sets `vocab_id` with no check → two rows, same id, one Frame.

**Archive + rename can duplicate display triple.** Ticket deleted “multi-file rename/delete rewrite transactions” (`TripletFrameCollision` frame scan gone). Unique index is `WHERE archived = 0` only. Archive A, rename active B to A’s cells → GET can show two identical triples on one Frame. Registry 409 only if target still active (`test_triplet_cell_rename_collision_on_frame`).