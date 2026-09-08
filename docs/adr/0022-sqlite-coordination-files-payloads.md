# SQLite for coordination, files for payloads, optimistic version on label writes

Multi-user adds relational coordination data — Projects, the vocab registry (ADR 0021), assignments with workflow states (tickets 03/04), clip registration, later users — plus true concurrency. That coordination data lives in **SQLite in WAL mode**: transactions give atomic check-and-set state transitions, boards are joins, and multiple uvicorn workers / processes are safe (`busy_timeout` backstop). The per-(Clip, Task type) label JSON files and the mask store stay as **payload files** written with atomic tmp+replace. Label saves carry an **optimistic version** taken from the Clip's DB row; on mismatch the API returns 409 and the client re-reads — closing the cross-process lost-update window without hand-rolled locks.

## Considered Options

- **All-JSON files with in-process or flock locks** — rejected; flock solves locking only, every board/query stays hand-written file scanning, and multi-worker stays fragile.
- **Everything in SQLite including labels and mask blobs** — rejected; document-sized payloads gain nothing from the DB and lose diffability and hand inspectability; the mask store already works as files.

## Consequences

- The clips list in `config.yaml` is replaced by Clip registration in the DB (scoped per Project).
- ADR 0021's id-keyed labels stand: a vocab rename touches only the registry row — the multi-file rewrite transactions in `labels_store.py` disappear.
- Export resolves ids to names with one join at button-click time; downstream consumers may key on ids, which survive renames.
- Ticket 06 (auth) puts its user table in the same database.
