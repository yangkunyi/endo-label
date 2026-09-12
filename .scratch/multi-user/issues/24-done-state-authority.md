# 24 — Who may re-open or reject a Done item

**What to build:** a call on `re_review` and `reject` from Done. `endo_label/capabilities.py` grants both to anyone carrying the reviewer flag, while the module's own docstring says a role flag alone never writes someone else's item — every other action is assignment-based. Verified on the closeout review: an uninvolved reviewer could flip another team's Done item back to Submitted, or reject it to Labeling with a note. The spec says re-review goes through the admin, so "admin-only" and "the item's assigned reviewer" are both defensible; "any reviewer" is not.

Whatever is chosen has to reach the capability matrix test, whose rows currently cannot see it: in every row the reviewer happens to be the item's assigned reviewer.

**Blocked by:** — (review finding from the 22 closeout; `.scratch/multi-user/issues/22-playwright-closeout.md`)

Status: needs-triage

- [ ] decision recorded on who holds `re_review` / Done→Labeling reject
- [ ] `capabilities.py` matches its docstring and the decision
- [ ] the parametric matrix covers an uninvolved reviewer for each Done-state action
- [ ] `web/e2e/harness.ts`'s reset lever stops relying on the current behaviour if it changes
