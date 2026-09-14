# pilot-ux/05 — Coverage Strip for the focused Task type

**What to build:** the first answer this product has ever had to "标到哪了" — a read-only strip
showing which Frames carry a label of the **focused** Task type, with click-to-jump into the gaps.

Coverage is **per Task type**: with Task focus on class, the strip answers for class; switch to
phase and it answers for phase. mask is *not* in this strip (mask is not a Task focus tab) — it
gets its own row in 06. No completion percentage, no blocking (see `CONTEXT.md` and ADR 0029).

Code:
- Space already exists: the Lane well's reserved strip (`TimelineBand.tsx`, `[data-lane-well]`)
  and its `clipRailWidth` left spacer; the strip sits directly **above the Lane well** and spans
  the track width, keeping the picture size fixed.
- Data comes from what the desk already fetches: `desk.phaseDoc.frames` / `classDoc.frames` /
  `tripletDoc.frames` (the same maps `useLaneVisibility` uses) — a Frame is covered when its entry
  holds at least one identity. No new endpoint.
- Rendering: covered Frames as a filled segment in the Task type's colour; an **Unlabeled gap** (a
  maximal run of Frames with no identity) as a hollow/dim segment. Keep it a thin band; it is not
  a Lane and must not look like one.
- Gesture: a plain click seeks the Playhead to that Frame (same rule as a Lane bar). No
  drag-select, no trim, no painting; `aria-label` on the strip carries the count, e.g.
  `Coverage: class, 84 of 120 frames labeled`.
- Empty Clip / no Clip: the strip still renders (Ruler and Lane well already do).

- [ ] the strip follows Task focus (phase/class/triplet) and re-renders without a refetch
- [ ] covered Frames vs Unlabeled gaps are visually distinct and switch with the focus
- [ ] clicking a gap seeks to that Frame; clicking a covered Frame seeks too
- [ ] a "no labels at all" Clip shows one gap and does not crash
- [ ] the Lane well's reserved height and the picture size are unchanged
- [ ] a spec pins the strip's frame→gap mapping (`web/src/timeline.test.ts` neighbours)
