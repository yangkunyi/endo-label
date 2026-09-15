# pilot-ux/28 — The same URL answers differently: implementation notes

The issue body (`issues/28-the-same-url-answers-differently.md`) is frozen; this file is the working
record of what landed, the one decision the ticket asked to be named rather than made by side
effect, and the runs.

## What landed

- `endo_label/app.py`
  - `_DeskRoute(Route)` overrides `matches()` to return `Match.NONE` for `/api` and `/api/…`,
    whatever the method. The desk's catch-all is registered with this class, so a request the desk
    cannot answer is left to the router instead of being answered by the desk. The endpoint's
    `raise HTTPException(404, "Not Found")` branch for api paths is gone, and so is the import.
  - `_mount_built_desk` still registers the routes only when `web/dist/index.html` exists — a desk
    that was not built removes the desk's routes and nothing else. It now appends the two
    `_DeskRoute`s directly, which is what lets the class be used (FastAPI's `@app.get` always builds
    an `APIRoute`). The functions are Starlette-shaped: they take `Request`, and the SPA path comes
    from `request.path_params["full_path"]`.
  - The invariant this buys: `POST /api/session/redo` — a path that exists nowhere — is a JSON 404
    with a built desk, not the 405 the GET-only catch-all's partial path match produced, and the
    same 404 without one.
- `tests/test_sitting_desk.py`
  - `test_unmatched_api_path_answers_the_same_with_and_without_a_built_desk` — the class-closing
    pin, named after the invariant. Two sittings, one built (`_write_dist`) and one bare
    (`web_dist` pointing at a path that does not exist), are asked the same four unmatched `/api/…`
    paths with six methods each; both must answer the same status **and** the same content type, and
    that answer is a JSON 404.
  - `test_wrong_method_on_a_real_api_path_does_not_become_404` — the decision below, pinned.
- `tests/test_mask_session.py`
  - `_sitting` grew a `web_dist` argument so a test can name its world instead of inheriting the
    host's.
  - `test_empty_undo_is_200_noop_and_there_is_no_redo` keeps its intent — there is no redo — and now
    asserts it in both worlds explicitly instead of asserting whatever the host's build state made
    true.

## Decision: no real endpoint's wrong-method answer changed

The obvious move was rejected, not taken by accident: widening the SPA catch-all to every method, or
adding `@app.api_route("/api/{rest:path}", methods=[...])`. Starlette returns the first full match a
route produces and a path catch-all full-matches *every* method, so it swallows the real route's
partial match. Verified directly: with an all-method `/api/{rest:path}` appended to the route table,
`POST /api/health` answers **404 instead of 405**. `test_wrong_method_on_a_real_api_path_does_not_become_404`
pins 405 in both worlds, so that fix cannot land silently.

Two answers did change, both toward the world without a desk and both a consequence of leaving API
routing to the router:

1. **Unmatched `/api/…` paths.** When the desk was built, any method other than GET on a path no
   route claims answered 405 (the catch-all's path matched, its method did not). It now answers 404,
   matching the deskless sitting and the shape `test_unknown_api_path_is_json_404_not_desk` already
   asserted for `GET /api/does-not-exist`. This is the ticket.
2. **`GET /api/clips/` — a trailing slash on a real path.** The built desk answered 404, because its
   catch-all claimed the path before `redirect_slashes` could run; the deskless sitting answered 307
   → 200. The built sitting now takes the same redirect. The endpoint's trailing-slash answer was
   wrong in the built world, so this is convergence, not a decision to preserve.

## Verification

- `pytest tests -q` **with `web/dist` present** — the configuration the gate never covered — **275
  passed**. `web/dist` was copied from the host build at `/data3/yky/endo_label/web/dist` on purpose
  for this run (gitignored; left in the worktree).
- `pytest tests -q` **without `web/dist`** — the configuration every worker worktree is in — **274
  passed, 1 skipped**. The skip is `test_default_sitting_serves_repo_web_dist`, which is marked
  `skipif` on the dist's absence.
- Both new pytest pins were checked against the unfixed `app.py`: the invariant test fails (built
  world 404 vs bare 405) and the mask test fails with `('built desk', 405)`. The 405 guard passes
  before and after, and fails if the naive all-method catch-all is added, which is what it is for.
- `web/`: `vitest run` **206 passed** in 21 files; `tsc -b --noEmit` clean. No file under `web/` was
  edited — the fence with 26/27 holds; this ticket is pytest-only. This worktree had no
  `web/node_modules` of its own, so the main checkout's was copied in for the run (gitignored; left
  in place).
- Playwright was not run and no e2e spec was added to: the browser stack is the owner's while
  draining (AGENTS.md → Verification).

## Leftovers, deliberately out of this issue

- The desk still answers 200 HTML for `/clips/CLIPA/` where a deskless sitting 404s. That is desk
  routing, not API routing; the invariant is about `/api/…`, and the fence keeps `web/` out.
- `/api` itself (no trailing slash) sits outside the auth middleware's `path.startswith("/api/")`
  guard. The fix answers it uniformly — JSON 404 in both worlds, every method — but does not widen
  the guard; that is a separate question about auth, not about desk routing.
