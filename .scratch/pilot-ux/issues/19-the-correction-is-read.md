# pilot-ux/19 — The correction is read, and its sentence is readable

**What to build:** the two survivors the closeout review left on `pilot-ux/17` — a notice nobody can read,
and a patch applied to a value the surfaces are not showing.

**The notice.** `web/src/useClipFilters.ts:77-84` writes the corrected selection in the same commit that
carries the sentence, so the render after it resolves over the corrected value: `corrected` goes false and
`notice` goes null (`web/src/clipFilters.ts:181-187`, the resolution over the corrected selection has
nothing left to say). The sentence is painted for the correction commit and nothing else — a flash — and the
`role="status"` nodes both consumers render (`web/src/ClipList.tsx`, `web/src/desk/ClipRail.tsx`) are never
read. That contradicts what the module promises in its own header (`web/src/useClipFilters.ts:11-19`): a
browser holding a value this caller cannot use is told why the list changed. `web/e2e/clip-scope.spec.ts`
now pins zero status nodes, which writes the loss down rather than deciding it.

**The patch.** `choose` (`web/src/useClipFilters.ts:86-95`) patches the state, not the shown selection, so
while `/api/me` is unanswered (`corrected` false, `web/src/clipFilters.ts:150-172`) a pick re-saves the
un-narrowed value and the dead Project or tag that read passed over. `web/src/clipFilters.ts:187-200` says a
change patches the selection the surfaces render.

One design answers both: the hook's state **is** `resolution.filters` (derived, with no effect re-correcting
a value the render already replaced), and the sentence is a fact that outlives the correction — held until
the reader changes a filter, which is what "told once" has to mean for a sentence a human reads. Keep the
decision logic pure in `web/src/clipFilters.ts`. Vitest here runs in node with `include: ["src/**/*.test.ts"]`
(`web/vite.config.ts`), so pin it in-process: no jsdom, no `@testing-library`, no new dependency. Whether the
sentence is genuinely on screen is the owner's hand verification (AGENTS.md → Verification).

Rejected for the record: deleting the notice and its `role="status"` nodes instead of making it readable. The
correction exists for a browser that strands its own list, and a silent reset is the confusion it was written
to end, so the sentence stays and becomes legible instead.

Acceptance:

- [ ] the sentence outlives the commit that corrects the selection: a reader whose stored `scope=all` or dead
      Project/tag was read passed can read why the list changed, and it goes when they change a filter
- [ ] a control patches the shown selection, so a pick while `/api/me` is unanswered cannot write an
      un-narrowed or dead value back to `localStorage`
- [ ] the hook's state is the resolution's filters — no correcting effect behind the render that already
      replaced the value
- [ ] vitest pins the sentence's lifetime and the pick-while-unknown case in-process, with no new dependency
- [ ] the contract text in `web/src/useClipFilters.ts` and `web/src/clipFilters.ts` matches the code, field
      for field
