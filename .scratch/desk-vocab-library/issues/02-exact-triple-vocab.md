# 02 — Triplet Vocab is the table of exact triples

**What to build:** Drop the independent instruments/verbs/targets lists. Existing triplet rows on Frames stay. The Vocab table is the unique exact triples already on disk. Library for triplet is that table: Plus composes a new row into the table only; click toggles this Frame; trash confirms then drops that triple from every Clip. Typeahead words come from triples that already exist. No cartesian product. Compose: migrate once, delete rewrites all Clips or fails with none half-updated.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Vocab stores exact triples; the three column lists are gone after migrate
- [ ] Frame triplet rows from before migrate are kept and fill the table
- [ ] Plus adds a Vocab row only; Library click toggles this Frame
- [ ] Trash confirms then removes that exact triple from every Clip
- [ ] Compose covers migrate, delete rewrite, and unused column words discarded
