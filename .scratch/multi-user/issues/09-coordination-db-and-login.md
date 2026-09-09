# 09 — Coordination DB and login

**What to build:** SQLite (WAL) foundation; Account (username + password argon2id, stackable role flags admin / reviewer / annotator); server-side session cookie (httponly + samesite=lax, secure as a config flag, off on localhost http); CLI subcommand bootstrapping the initial admin + temporary password; frontend `/login` page and app-shell top bar (current identity, logout); unauthenticated access to any page is redirected to login.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] compose seam: any /api endpoint without a session returns 401; correct login yields a working cookie; wrong password 401; disabled accounts are refused at login and their existing session gets 401 on the very next request
- [x] compose seam: role flags read/write correctly per user (data prep for the coarse gates)
- [x] e2e: login → desk → logout → login again; unauthenticated deep links land on /login
- [x] WAL and busy_timeout in effect: two interleaved clients read/write without corrupting each other

## Answer

SQLite WAL + `busy_timeout=5000` at `labels_root.parent / coordination.sqlite` (override `coordination_db`). Users table holds username, argon2id hash (`pwdlib`), stackable admin/reviewer/annotator flags, disabled. Login sessions table; cookie `session_id` is httponly + samesite=lax, `secure` via `session_cookie_secure` (off by default). `/api/health`, `/api/auth/login`, `/api/auth/logout` are public; every other `/api/*` is 401 without a live session or when the Account is disabled. CLI: `python -m endo_label create-admin NAME [--password] [--config]`. Frontend `/login` + app-shell username/logout; unauthenticated pages go to `/login`.

