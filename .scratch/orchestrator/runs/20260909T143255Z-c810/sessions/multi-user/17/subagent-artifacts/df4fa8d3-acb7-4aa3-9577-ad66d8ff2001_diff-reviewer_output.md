# Standards report

No hard documented-standard breach. Diff matches ADR 0026/0027 + ticket 17: payload files hold ids, rename is registry-only, `/api/vocab` delete archives, hard delete 409s on `referenced_vocab_ids`, compose spots ids on disk. Sibling phase/class/triplet routers stay separate (AGENTS.md). English throughout (AGENTS.md).

## Judgement calls

**1. Duplicate resolve loops** (`labels_store.py`) — Duplicated Code  
`http_phase` / `http_class` same shape: `stored_id` → `names.get` → skip missing.

```python
vocab_id = stored_id(value)
if vocab_id is None:
    continue
name = names.get(vocab_id)
if name is None:
    continue
```

Extract one helper if a fourth mapper appears.

**2. PUT can stack same exact triple** (`triplet/router.py`) — CONTEXT.md Triplet / ADR 0019 uniqueness still holds; POST/span use `_same_vocab`, PUT does not:

```python
if int(row.get("id", -1)) == triplet_id:
    row["vocab_id"] = vocab_id
```

Two rows on one Frame can share one `vocab_id`. Pre-existing PUT hole; id storage makes it same-id not just same cells.

**3. Frame-cell rename guard gone** (`vocab_router.py` + deleted `TripletFrameCollision`) — ADR 0019: refuse rename if a Frame would hold two identical triples. Now only active unique-index `RegistryConflict`:

```python
except RegistryConflict as exc:
    raise _already_present(exc) from None
```

Compose test now asserts `"already present"`. Two *active* triples still collide. Archive B then rename A to B’s cells is allowed (`WHERE archived = 0`); GET can show two identical cell rows. 0026 identity is id, so maybe OK — residual vs 0019 cell uniqueness.

**4. Desk `/api/vocab` writes registry, no admin** (`vocab_router.py`) — ADR 0026 + CONTEXT.md Vocab name: only admin writes registry; labeler uses candidates. This diff is what calls `create_item` / `rename_item` / `set_archived` from ungated desk routes. Ticket 17 still needs this HTTP for compose. Split later, don’t treat as ticket-17 fail.

**Skipped:** folding sibling routers (AGENTS.md forbids); optimistic version (ADR 0027, not this ticket); tooling-level nits.