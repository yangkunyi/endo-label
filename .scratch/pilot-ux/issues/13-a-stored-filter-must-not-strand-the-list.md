# pilot-ux/13 — A stored filter must not strand the list

**What to build:** the two ways the new Clip filters leave an Account with a list it cannot fix.

**1. `scope=all` outlives the admin flag (review finding, medium-high).** The scope is remembered per
origin (`web/src/clipFilters.ts:52-64`), the checkbox that sets it is admin-only
(`web/src/ClipList.tsx:86-92`), and the desk rail reads the same stored scope with no filter UI at all
(`web/src/desk/ClipRail.tsx:15`). The server refuses `scope=all` from a non-admin with 403
(`endo_label/mask/http.py:170`). So once a shared browser changes hands — or an Account loses its
admin flag — the non-admin is stranded: `/clips` and the rail show the refusal sentence and nothing in
the UI clears the stored scope. A non-admin must always end up with its own Clips: the stored value is
corrected (or ignored) for a caller the server would refuse, and the rail needs the same escape as the
Clips page. The server's rule does not change — a non-admin asking for all is still a refusal.

**2. A filter value that no longer exists silently empties the list (review finding, medium-low).**
`web/src/clipFilters.ts:81-83` keeps filtering by a `project`/`tag` that is no longer in the option
list (a renamed or deleted Project, a tag that no Clip carries any more) while the `<select>` falls
back to empty, so the list and the rail go empty and the empty state blames "no Clips" instead of the
dead filter. An unmatched value must be named or dropped, never silently filter everything away.

Acceptance:

- [ ] a non-admin whose browser holds `scope=all` sees its own Clips, on `/clips` and on the desk rail, and the stored value is corrected or ignored
- [ ] the desk rail can clear or change the stored scope without leaving the desk
- [ ] a stale `project`/`tag` filter cannot empty the list silently: the value is dropped, or the empty state names it
- [ ] vitest pins both fallbacks as pure functions in `clipFilters.ts`; the server still refuses `scope=all` from a non-admin (pytest)
