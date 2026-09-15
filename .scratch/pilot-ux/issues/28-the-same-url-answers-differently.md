# pilot-ux/28 — The same URL answers differently depending on whether the desk is built

**What to build:** the one honest red on `main`. It is not a product bug a user hits — it is a gate that
cannot be trusted, and it is the reason the last round's three-command gate had to be run twice and read
by hand.

## What happens

`endo_label/app.py:40-58`: `_mount_built_desk` registers a `GET /{full_path:path}` catch-all **only when
`web/dist/index.html` exists**. The catch-all's body raises `HTTPException(404, "Not Found")` for `api/…`
paths. Starlette matches a request against the route table by path first and reports a method mismatch as
`405`; so with a built desk, `POST /api/session/redo` — a path that exists nowhere — matches the catch-all's
path and fails its method check, and the answer is **405**. Without a built desk there is no catch-all at
all, and the same request is a **404**.

`tests/test_mask_session.py:971-981` pins `404`, so:

```
main checkout, web/dist present (the owner's)      pytest: 1 failed  ← false red
worker worktree, web/dist absent (gitignored)      pytest: green    ← never sees it
```

`web/.gitignore:11` ignores `dist`, so every worktree the drain builds is the second row. The failure can
therefore never be attributed to the change that caused it: a worker's gate is green by construction, the
owner's is red by construction, and a real regression in that file would arrive wearing the same clothes
as this artifact. That is the cost — not the 405.

## What to build

Make an API path's answer independent of whether the frontend has been built, and pin it in **both**
worlds.

- Decide and state what `/api/…` paths that exist nowhere should answer, for every method, and make it one
  answer in a sitting with a built desk and one in a sitting without one. The current 404 for `GET
  /api/does-not-exist` is pinned by `tests/test_sitting_desk.py::test_unknown_api_path_is_json_404_not_desk`
  and is the shape to converge on (JSON, no desk HTML).
- Careful with the obvious move. Widening the SPA catch-all to every method, or adding
  `@app.api_route("/api/{rest:path}", methods=[...])`, does not only fix this case: Starlette prefers a full
  match over a partial one, so such a route also swallows **wrong-method requests to API paths that do
  exist** (`POST /api/health` would answer 404-instead-of-405). If the answer you choose changes what a
  real endpoint says to a wrong method, say so in the body of this ticket's note as a deliberate decision —
  do not let it happen as a side effect.
- Whatever the shape, `_mount_built_desk` must not be the thing that decides API routing. A desk that has
  not been built should remove the desk's routes and nothing else.
- `tests/test_mask_session.py::test_empty_undo_is_200_noop_and_there_is_no_redo` must keep the intent it
  was written for — there is no redo — while its assertion stops depending on the host's build state. If
  the honest pin needs a second client (one sitting with a dist, one without) then add it here; that is
  what this ticket is for.
- Add the pin that closes the class of defect: the same `/api/…` request answered by a sitting built with
  a desk and a sitting built without one must get the same status **and** the same content type. Name it
  after the invariant, so the next person who moves a route knows what they are about to break.

Do not touch `web/` — `pilot-ux/26` and `pilot-ux/27` own it and the fence is deliberate (28 is the only
ticket of the three that can run pytest alone).

Acceptance:

- [ ] every `/api/…` path that matches no route answers the same, for every method, with and without a
      built desk
- [ ] no real endpoint's wrong-method answer changed without that being named as a decision in this
      ticket's note
- [ ] `test_empty_undo_is_200_noop_and_there_is_no_redo` pins "there is no redo" and no longer depends on
      whether `web/dist` exists
- [ ] the both-worlds pin exists and fails if the two sittings are allowed to disagree again
- [ ] `python -m pytest tests -q` is green **with `web/dist` present** — run it that way on purpose and say
      so in the note; that is the configuration the gate has never covered
- [ ] vitest and tsc untouched and green
