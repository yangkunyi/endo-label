# 02 — Empty vocab seed

**What to build:** A new sitting has empty phases, class_tags, instruments, verbs, and targets. The labeler adds names with plus or by typing. An existing `vocab.json` is not wiped on startup. Compose and desk tests that assumed seed names such as Preparation or grasper add those names themselves.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Fresh vocab (no file, or missing list keys) returns empty lists for all five names; old seed strings are not injected
- [x] Plus on phase/class and typing a new triplet word still add a name to the matching list and can write this Frame
- [x] An already-written `vocab.json` keeps its names until the labeler changes them; startup does not delete them
- [x] Class-tag `grasper` is still not the same list as triplet instrument `grasper`
- [x] Compose tests that need a name POST it first; they do not assume built-in Preparation, grasper, or the other former seed strings
- [x] Vocab delete, dark chrome, and mask are out of this ticket
