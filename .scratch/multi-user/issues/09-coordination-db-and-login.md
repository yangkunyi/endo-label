# 09 — Coordination DB and login

**What to build:** SQLite (WAL) foundation; Account (username + password argon2id, stackable role flags admin / reviewer / annotator); server-side session cookie (httponly + samesite=lax, secure as a config flag, off on localhost http); CLI subcommand bootstrapping the initial admin + temporary password; frontend `/login` page and app-shell top bar (current identity, logout); unauthenticated access to any page is redirected to login.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] compose seam: any /api endpoint without a session returns 401; correct login yields a working cookie; wrong password 401; disabled accounts are refused at login and their existing session gets 401 on the very next request
- [ ] compose seam: role flags read/write correctly per user (data prep for the coarse gates)
- [ ] e2e: login → desk → logout → login again; unauthenticated deep links land on /login
- [ ] WAL and busy_timeout in effect: two interleaved clients read/write without corrupting each other
