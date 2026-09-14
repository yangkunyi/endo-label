# Spec: Multi-user annotation system

Status: ready-for-agent
Map: `.scratch/multi-user/map.md` (8 decision tickets, all closed; this spec is their convergence)
ADRs: `docs/adr/0026` (vocab registry), `docs/adr/0027` (storage split)
State names below: Unassigned → Labeling → Submitted → Reviewing → Done (canonical terms in `CONTEXT.md`).

## Problem Statement

This endoscopic labeling desk is a single-user local system: only one person can work at a time, there are no accounts or ownership, finished items have no review step, and the vocab is one flat global list. When multiple people must label concurrently — across batches, studies, and surgery types — and review each other's work, the system fails on three levels: identity, task assignment, and the quality loop. Features are not merely missing; "exactly one user" is an assumption baked into the code.

## Solution

Turn it into a multi-user system: each person gets an Account (created by the admin, stackable roles); the admin assigns (Clip, Task type) items to annotators; finished items are submitted; reviewers inspect and edit on the same desk, then pass or reject; vocab becomes a global registry with per-Project enablement; storage becomes SQLite for coordination plus files for label payloads. The first version runs on localhost; deployment comes later. Review is an optional stage: a submitted item may be consumed downstream immediately (marked "delivered") without waiting for review.

## User Stories

1. As an annotator, I want to log in with my Account, so that my writes are attributed to me and I only see my own work.
2. As an annotator, I want to change my own password after first login, so that my Account stays mine.
3. As an annotator, I want a "My Tasks" list showing only my assigned (Clip, Task type) items with their states, so that I know exactly what to work on next.
4. As an annotator, I want opening an item to land me in the same desk I already know, so that my labeling workflow is unchanged.
5. As an annotator, I want to submit a finished item (Labeling → Submitted), so that it becomes reviewable and usable downstream.
6. As an annotator, I want to recall a submitted item back to Labeling, so that I can fix something I missed before review.
7. As an annotator, I want to see the reviewer's note when my item is rejected, so that I know exactly what to redo.
8. As an annotator, I want to create a project-local candidate Vocab word when enabled words don't cover what I see, so that I am never blocked mid-labeling.
9. As an annotator, I want the picker to offer only my Project's enabled words, so that I never wade through other surgeries' label sets.
10. As an annotator, I want a stale concurrent save to be rejected with a refresh hint (409), so that nobody's paint silently disappears.
11. As an annotator, I want my mask Session to open automatically per Clip and survive switching Clips, so that I never manage Sessions by hand.
12. As an annotator, I want an "inferring…" hint and a timeout message when someone else's inference holds the lock, so that GPU waits are understandable.
13. As a reviewer, I want to see the items assigned to me for review, so that I know my review workload.
14. As a reviewer, I want to open a submitted item in the same desk and edit its labels, so that small problems are fixed in place.
15. As a reviewer, I want to pass an item (Reviewing → Done) with reviewed-by recorded, so that quality is traceable per item.
16. As a reviewer, I want to reject an item with one short note, so that the annotator knows what to redo without a comment-thread ritual.
17. As a reviewer, I want to manage my Projects' word lists (enable/disable registry words, add/edit candidates), so that curation stays local and mistakes stay reversible.
18. As an admin, I want to bootstrap the first admin Account via CLI, so that the system starts without a setup wizard.
19. As an admin, I want to create Accounts with temporary passwords and disable an Account so that it logs out immediately, so that access matches the team.
20. As an admin, I want to create Projects (name + hospital field), so that each study owns its words and its Clips.
21. As an admin, I want to register source media as Clips into a Project via CLI/config — the same media into two Projects becoming two Clips — so that onboarding a batch is one step and studies never collide.
22. As an admin, I want to manually assign items to annotators, so that distribution is deliberate.
23. As an admin, I want to multi-select unassigned items and auto-assign them balanced by holding count (with batch/Task-type filters), so that distribution is one click when deliberate splitting doesn't matter.
24. As an admin, I want an assignment board with (Clip, Task type) rows grouped by state, so that progress and the Submitted backlog are visible at a glance.
25. As an admin, I want to reassign or unassign an item with labels staying on the Clip, so that people changes never destroy work.
26. As an admin, I want to assign reviewers to submitted items the same way I assign annotation (manual + balanced auto, reviewer ≠ annotator), so that review flows through one mechanism.
27. As an admin, I want to mark an item delivered with a timestamp, so that downstream usage is recorded even though export tooling doesn't exist yet.
28. As an admin, I want to write the global Vocab registry (add, rename, archive, promote candidates), so that label identity stays consistent across studies.
29. As an admin, I want a rename to apply to every Clip of every Project at once, so that stale strings never survive anywhere.
30. As an admin, I want hard delete refused for referenced words (archive instead), so that labels can never be wiped by accident.
31. As an admin, I want a per-Project enable matrix, so that each study's picker is small and precise.
32. As any user, I want deep links (`/desk/:clipId/:kind`) that survive refresh and can be pasted to a colleague, so that discussing a case means sharing a URL.
33. As any user, I want state changes (reject, review passed, reassignment) to appear without manual refresh, so that lists never lie to me.
34. As any user, I want the UI to render only what the server says I may do (capabilities), so that I never hit dead buttons and permissions have one source of truth.
35. As an admin, I want Session caps (per-user and global) configurable, so that GPU memory stays bounded as the team grows.
36. As any user, I want to filter my list and the board by Project and Clip tags, so that cross-cutting questions ("where does the West China data stand") are answerable.

## Implementation Decisions

**Domain vocabulary** follows root `CONTEXT.md`: Clip, Frame, Task type, Assignment, Review, Project, Account, Vocab name; "Session" still means the mask working state only — the auth domain says login/Account.

**Four decision records underpin this spec and are not restated here**: assignment unit and ownership (ticket 03), review state machine (ticket 04), vocab registry (ADR 0026), storage split (ADR 0027).

**Coordination database (SQLite, WAL mode)**, new:
- Tables: users (stackable role flags admin/reviewer/annotator), login sessions, projects (name + hospital field), clips (registered into exactly one Project; replaces the clips list in the config file), vocab registry (stable id, display name, archived flag) + per-Project enablement/candidates, assignments ((clip, task type) key; state, assignee, reviewer, note, reviewed_by, reviewed_at, delivered_at), per-clip version (optimistic concurrency).
- Every state transition is a transactional check-and-set. State machine (ticket 04):
  - `Unassigned → Labeling → Submitted → Reviewing → Done`
  - No branch at submit; Done = reviewed-and-passed, the only terminal state; reject = Reviewing/Done → Labeling with a note; recall = Submitted → Labeling; re-review = Done → Submitted. Consumption bypasses the state machine and only sets the delivered flag.
- Multi-worker/multi-process safety comes from WAL + busy_timeout.

**Label file storage (layout unchanged)**: one JSON file per (Clip, Task type), atomic writes as today; label content switches from bare strings to **registry id references** (existing validation data is not migrated — see Out of Scope). Save requests must carry the clip version read from the DB; mismatch returns 409. The multi-file rename/delete rewrite transactions in the labels store are deleted outright.

**Auth (ticket 06)**: server-side session cookie (session table in the coordination DB), httponly + samesite=lax, secure as a config flag (off on localhost http); passwords argon2id (pwdlib); two permission layers sharing FastAPI Depends — coarse role gates per route group (user management / assignment / registry writes = admin; project word lists and review transitions = reviewer+; login public), and the fine ownership check at label writes (assignee + state allows). A CLI subcommand bootstraps the initial admin.

**Mask/SAM (ticket 07)**: model resident, single shared instance; a global inference lock wraps the inference entry point (hard constraint from predictor instance state); SessionManager moves from "one per process" to keyed by (user, Clip), auto-opened on first mask action, kept across Clip switches, LRU-capped at 2 per user / 8 global (config); manual close/reset stays. Predict waits synchronously on the lock with an "inferring…" hint and a 30-second timeout; Propagate keeps its single-active-job + polling unchanged.

**Vocab service (ADR 0026)**: registry as the single identity source; per-Project enabled subsets; annotators create candidates, the admin promotes; retiring = disable per Project or archive globally (labels kept), hard delete only for zero-reference names. Typeahead semantics unchanged (drawn from existing triples).

**Frontend (ticket 08, option B)**:
- Routes: `/login`, `/desk/:clipId/:kind`, `/admin/users`, `/admin/assignments`, `/admin/projects`, `/admin/vocab`; two layouts (auth shell, app shell with top bar).
- Existing react-router and **SWR stay — no library swap** (App.tsx already uses both; ticket 08 said TanStack Query, the equivalent is implemented with SWR). Items/board/lists are cached queries invalidated on mutation; label painting updates optimistically and rolls back on 409; workflow events arrive over SSE/WebSocket.
- Capability payload: `/me` plus per-item capabilities from the server; a single desk component renders buttons from capabilities (submit/recall/pass/reject/vocab editing) — no per-role copies of the desk.
- Admin console: users, assignment board (state columns, reviewer assignment, auto-assign, delivered marker in place), project list, vocab management screen (registry browse / enable matrix / promotion queue). Clip/media registration via CLI/config, UI deferred.
- ClipDesk is decomposed panel by panel (player/timeline/editor cards/mask/vocab library), each step gated by compose / vitest / tsc; pixel-identical. Playwright for the remaining drain is ticket 22 after product leaves 15/20/21.

**API surface** (contract level): `/api/auth/*` (login/logout/change password), `/api/me` (identity + capabilities), `/api/items` (assignment list/transitions/reject note/delivered), `/api/projects`, `/api/registry` (registry CRUD/enablement/candidates/promote/archive), existing `/api/phase|class|triplet|vocab|mask` endpoints gain auth and ownership checks, version field added to existing save endpoints.

## Testing Decisions

- Good tests assert external behavior only: against the composed FastAPI app (HTTP black box) and the real UI (Playwright) — never against internals. Two seams, both existing prior art, no new seams:
  - **Backend primary seam**: the `tests/test_compose.py` pattern — `TestClient(create_app(Settings(..., predictor_backend="fake")))` with temp directories. The fake predictor backend was designed for CI; all GPU logic (queuing/lock/timeout paths) is verified through it at the API level. Concurrency and 409 scenarios are expressed with two interleaved clients (A writes with a version, B writes in between, A's retry must 409; racing the same transition works the same way). Disabled accounts logging out immediately, role 403s, ownership 404/403 all live here.
  - **Frontend seam**: the `web/e2e/desk.spec.ts` pattern — login, My Tasks, submit/recall, pass/reject, board operations, capability rendering (annotators see no vocab editing) through the real UI. Remaining-drain Playwright is ticket 22 only, so parallel Worktrees do not bind `7881`/`5174`/`7893`.
- Existing unit tests (frontend api/deskStore, backend pure functions) stay as auxiliaries; acceptance happens on the two seams.

## Out of Scope

- Deployment (ngrok/tunnels, https, multi-worker ops) — decided after localhost works; config flags like `secure` cookies are pre-provisioned.
- Migration of existing single-user labels (validation data only).
- Patient de-identification and ethics compliance (hospital's responsibility).
- Export pipeline ("delivered" is a manual marker; export tooling is a separate effort).
- Notifications/messaging, progress charts, review comment threads, registration wizards.
- Multi-GPU sticky routing and multiple model instances (deferred addition, trigger conditions in ticket 07).
- Self-serve task pool, deadline/progress statistics, advanced auto-assign strategies (optional features on the map).

## Further Notes

- If requirements change, update the corresponding ticket Answer in `.scratch/multi-user/` first, then this spec; where spec and tickets disagree, ticket Answers are the decision record and this spec is the execution surface.
- "Import batch" is an informal notion, not an entity (Project owns vocabulary and ownership); same media in multiple Projects = multiple Clips is part of the model.
- Suggested build order: coordination DB + auth → assignment/state machine → registry and id migration → frontend shell and admin console → mask multi-user → ClipDesk decomposition → ticket 22 Playwright closeout.
