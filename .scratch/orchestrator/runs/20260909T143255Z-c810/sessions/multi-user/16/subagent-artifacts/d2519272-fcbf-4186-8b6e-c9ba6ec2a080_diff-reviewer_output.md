**Spec axis.** HEAD `4ed6689b`. All product work unstaged/untracked. Vocab router/picker/labels untouched.

**(a) Missing / partial**

1. Role split vs cited 02. Ticket 16: “writes admin-only, per ticket 02”. Ticket 02: “全局注册表**仅管理员可写**（建/改名/归档/提升…）；审阅者管项目词表（启用/停用、候选增删改）；标注员只用启用的词 + 建候选。” API + tests 403 every write, including enable/disable and candidate create-edit. Matches 16 acceptance “non-admin writes 403”; misses 02 reviewer/annotator writes.

2. Admin screen not gated. Spec: “the `/admin/vocab` screen with three areas”. Route in `App.tsx` has no admin check; only nav hides. Any authed user loads full browse/matrix/queue; writes 403.

3. Zero-breakage proof thin. Spec: “existing vocab endpoints and `test_compose` fully green”. Diff adds one `/api/vocab` check; `test_compose` not run/touched. Router unchanged, so likely green, unproven.

**(b) Scope creep**

1. `GET /api/registry/visible` not in “create / rename / archive / enable-disable / candidate create-edit / promote”. Serves “the enable matrix decides each Project's visible set”.

2. AppShell “Desk” link + header re-layout. Spec asked `/admin/vocab` screen; Vocab nav implied, Desk link not.

3. Promote also enable-on-source-project + delete candidate. Spec: “promoting a candidate turns it into a global id”. Delete implied by queue; auto-enable extra.

**(c) Looks done, looks wrong**

1. Same 16-vs-02 permission bind: implementation treats enable-disable and candidate create-edit as admin-only because 16 lists them under `/api/registry` then “writes admin-only”. 02 (cited) keeps those as reviewer/annotator. CONTEXT also: “the labeler adds project-local candidates”.

2. Matrix can enable archived rows; `visible_items` drops `archived=1`. Spec: “the enable matrix decides each Project's visible set” — enable archived ≠ visible until restore.

No picker/label-file id migration. No Playwright.