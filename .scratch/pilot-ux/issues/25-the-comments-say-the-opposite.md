# pilot-ux/25 — The comments say the opposite of the code

**What to build:** the three low survivors of the closeout review over `pilot-ux/22` — comments that now
contradict the code, a pure rule module that reaches back into a data-fetching one, and two assertions
nobody wrote. Nothing here changes behaviour: it is text, one import direction, and pins.

1. **`web/src/desk/keyboard.ts:2` imports `mayUndo` from `./maskControls`**, and `maskControls.ts` carries
   `useSWR` (`useMaskWrite`, `useMaskRead`). `TimelinePanel`, `FrameControls` and `PlayerPanel` import
   `isEditableTarget` from `keyboard.ts` for a DOM question, so that edge drags SWR and React into them.
   `mayUndo` is a pure rule and belongs on the side that fetches nothing: move it into `keyboard.ts` (or a
   module both can import that fetches nothing) and have `maskControls` import it from there — one direction
   only. The existing `keyboard.test.ts` and `maskControls.test.ts` pins stay green.
2. **`web/src/desk/maskControls.ts:22` and `web/src/desk/MaskPanel.tsx:779` say no answer is coming**, while
   SWR retries a 404 indefinitely, so an answer may still land; `maskControls.ts:117`'s wording is the one
   that matches the code ("once it has failed the state stays unreadable until an answer lands"). Make the
   other two say what the code does.
3. **`.scratch/pilot-ux/notes/21:61,78` still describes the conclusion the following two rounds reversed**
   (where `mayUndo` is derived, and whether the chord swallows the event). Bring the notes up to what
   landed.
4. **Two pins.** `maskReadFailure`'s null arm (`web/src/desk/maskControls.ts:239`) is never asserted: the
   refusal cases in `web/src/desk/maskPanel.test.ts` assert `refusalText` and never deny
   `data-mask-read-failed`, so the read-failure sentence could appear beside a refusal and stay green. And
   `maskWriteOf`'s error arm ignores `asked` (`maskControls.ts:115`) — a combination `useMaskWrite` cannot
   produce — so either say in a comment why the arm exists or leave it out.

Scope fence: `web/src/desk/` and the notes only. Do not touch `web/src/clipFilters.ts`,
`web/src/useClipFilters.ts` or `web/src/clipFilters.test.ts`; they are `pilot-ux/24`'s, and the two tickets
must stay in disjoint files. Change no behaviour.

Acceptance:

- [ ] the desk's key rules import nothing that fetches; the dependency points one way and the existing
      keyboard and maskControls pins stay green
- [ ] the "no answer is coming" wording matches what SWR actually does, in both places
- [ ] `notes/21` describes the landed behaviour
- [ ] the read-failure sentence is asserted absent beside a refusal, and the `{asked: false, error}` arm is
      either justified in a comment or gone
- [ ] pytest, vitest and tsc are green; no Playwright spec added and the e2e stack not run
      (AGENTS.md → Verification)
