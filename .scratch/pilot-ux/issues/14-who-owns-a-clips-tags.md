# pilot-ux/14 — Who owns a Clip's tags after the first registration

**What to build:** the two writers of `clip_tags` currently fight, and the sitting wins on every
restart.

`coordination.register_clip` (`endo_label/coordination.py:876-886`) lost its `if tags:` guard while 25
landed, so every `create_app` rewrites a Clip's tags from the catalog entry. Two consequences: a tag
written through `PUT /api/clips/{clip_id}/tags` (`endo_label/admin_router.py:201`) is rolled back at
the next restart, and re-registering the same Clip from the CLI without `--tag` clears tags the store
held. ADR 0028 forbids exactly this shape of loss one table over ("a UI edit must not be reverted by a
restart").

The rule to implement: **a registration states tags only when it was given some.** When a config entry
(or `--tag`) carries a tag list, that list is the Clip's tags in full, so a tag dropped from it
disappears — what 25 was after. When it carries none, the registration leaves the store's tags alone —
what the admin API needs. The rule gets one sentence where the next reader will find it (ADR 0028, or
the config documentation).

Acceptance:

- [ ] registering a Clip twice with no `tags:` / `--tag` keeps tags written afterwards through the API
- [ ] a config entry that does state `tags:` states them in full, removals included
- [ ] the rule is written down (ADR 0028 or the config docs), not only in code
- [ ] pytest pins both directions
