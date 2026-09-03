# 02 — Triplet Vocab is the table of exact triples

**What to build:** Drop the independent instruments/verbs/targets lists. Existing triplet rows on Frames stay. The Vocab table is the unique exact triples already on disk. Library for triplet is that table: Plus composes a new row into the table only; click toggles this Frame; trash confirms then drops that triple from every Clip. Typeahead words come from triples that already exist. No cartesian product. Compose: migrate once, delete rewrites all Clips or fails with none half-updated.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Vocab stores exact triples; the three column lists are gone after migrate
- [x] Frame triplet rows from before migrate are kept and fill the table
- [x] Plus adds a Vocab row only; Library click toggles this Frame
- [x] Trash confirms then removes that exact triple from every Clip
- [x] Compose covers migrate, delete rewrite, and unused column words discarded

## Answer

Vocab is `triples` of exact instrument/verb/target rows. GET migrates once from unique Frame rows, drops `instruments`/`verbs`/`targets`, discards unused column words. Plus POSTs `/api/vocab/triples` only. Library is that table: click toggles this Frame; trash confirms then DELETE rewrites every Clip or restores all. Typeahead words come from existing triples (`datalist`). No cartesian product: Frame write requires the exact Vocab triple. Compose covers migrate, Plus-only, cartesian refuse, delete rewrite, and half-failure restore.
