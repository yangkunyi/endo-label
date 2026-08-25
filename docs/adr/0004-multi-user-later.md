# Logins, clip assignments, per-labeler vocab, concurrent Predict — later

Preferences for several labelers (logins, assigned Clips, per-labeler name lists, two Predict on different Clips) are **not** this spec. This spec stays one desk, one desk-wide vocab, at most one Session per process. A later spec may reopen auth, bind address, user store, assignments, and GPU Session count. Do not add those to phase / class / triplet tickets.

## Considered Options

- **Pull multi-user into this spec** — rejected; map already parked assignments/queues/roles; glossary is one labeler; Session is one in-process worker.
