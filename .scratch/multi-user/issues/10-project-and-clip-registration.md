# 10 — Project and Clip registration

**What to build:** projects table (name + hospital field); Clips registered into the DB, each belonging to exactly one Project; CLI/config-based batch registration (low-frequency operation, no UI — the screen comes in 15); the same source media registered into two Projects = two independent Clips (labels, assignments, states all separate; media shared read-only); catalog serves the Clip directory from the DB, retiring the clips list in config.yaml; GET /api/projects.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] compose seam: creating a project and registering media reflects correctly in /api/projects and the Clip directory
- [ ] compose seam: registering the same media into two Projects yields two Clip ids, each independently openable
- [ ] compose seam: unregistered media does not appear in the directory (registration semantics replace the allowlist)
- [ ] e2e: registered Clips open and label normally in the existing desk
