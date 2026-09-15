# pilot-ux/20 — The mask desk's gate is answered, not awaited

**What to build:** the two mask-side survivors of the closeout review — a first prompt that vanishes while
the write permission is unknown, and a control mapping that claims to state the surface while hardcoding
half of it.

**The unanswered cell.** `web/src/desk/MaskPanel.tsx` passes `inputEnabled={session.controls.prompts}`, which
`maskControlStates` computes as `write.writable && !busy.job` (`web/src/desk/maskControls.ts:65-79`), and
`write.writable` is `item?.capabilities?.edit_labels === true` (`:49-56`). While `/api/me` is in flight `item`
is undefined, so `writable` is false and `MaskOverlay.onPointerDown` returns without a word
(`web/src/MaskOverlay.tsx:211-214`). The assignee's first drag on the canvas — the natural first action after
opening a Clip — is dropped, with no sentence (`refusal` is null for an unanswered cell,
`web/src/desk/maskControls.ts:52-55`) and no retry. Unknown is not the fact "unwritable": let `maskWriteOf`
answer three states, and let the canvas either hold the first prompt until the read lands or say that it is
still checking.

**The half-hardcoded mapping.** `MASK_VIEW_CONTROLS` (`web/src/desk/maskControls.ts:28-30`) is exported and
never read, while `maskControlStates` hardcodes `selectTrack: true, laneVisibility: true` (`:77-78`). Its
docstring says the mapping states the editor's surface whole, and `web/src/desk/maskControls.test.ts` leans on
that. Build the view half from the constant (or delete the constant), so a control added to one list cannot
end up without a state or a pin.

Acceptance:

- [ ] the write permission is three states — not yet known, writable, refused — and an unanswered `/api/me`
      never reads as refused
- [ ] a prompt on the canvas while the permission is unknown is not silently dropped
- [ ] `maskControlStates`' view half comes from `MASK_VIEW_CONTROLS`, or the constant is gone
- [ ] vitest pins the unknown caller's control states and that every mask control has a state
- [ ] `inputEnabled` reaching `MaskOverlay` is covered — `web/src/desk/maskPanel.test.ts` renders only
      `MaskPanel`, so today nothing asserts the canvas gate at all
