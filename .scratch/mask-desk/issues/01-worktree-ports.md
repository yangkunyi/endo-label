# mask-desk/01 — This worktree uses its own ports

**What to build:** `dev2` sitting and Playwright must not steal `main` or `dev1` sockets. Default sitting API is **7882**, Vite dev **5175** (CORS allows that origin). `npm run test:e2e` is isolated API **7892** + Vite **5192**, `--strictPort`, do not reuse another worktree’s server. Existing phase/class/triplet Playwright still green on the new e2e pair. No mask overlay in this ticket.

- [x] `python -m endo_label` binds `127.0.0.1:7882` unless `--port` is passed
- [x] `npm run dev` is Vite `5175` proxying `/api` to `7882`
- [x] CORS allows `http://127.0.0.1:5175` and `http://localhost:5175` (keep 5173 too if still needed)
- [x] Playwright e2e API `7892`, Vite `5192`, strict ports, no reuse of a foreign process
- [x] Vocab desk e2e still passes on that pair
- [x] README / sitting help text name these ports; `main` stays 7880/7881, `dev1` stays 7891/5191

## Answer

`dev2` sitting default is `127.0.0.1:7882`; Vite dev is `5175` (`strictPort`) proxying `/api` to `7882`. CORS allows `5175` and still allows `5173`. Playwright e2e is `7892` + `5192`, `--strictPort`, `reuseExistingServer: false`. Vocab desk e2e 35/35 on that pair. Vite 7 stays as the operator set it (not this ticket). `main` 7880/5173 and e2e 7881/5174, `dev1` e2e 7891/5191, untouched.
