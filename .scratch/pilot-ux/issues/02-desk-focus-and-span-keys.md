# 02 — Desk focus, span keys, empty Brush

**What to build:** the keyboard must reach the desk, not the last-clicked control. Trial
feedback: "键盘输入不要被按钮截获了，现在 io/[] 都会到按钮上".

The probe (`web/e2e` fixture, isolated from the pilot) settled what actually happened:
`[`/`]`/`i`/`o` are document-level and *did* work with a button focused; the real mechanisms were
**Enter re-firing the focused button** and **the keys doing nothing while focus sat in a Vocab
field, or the Brush was empty**.

Code:
- `web/src/ClipDesk.tsx` — `releaseFocus` on the desk's `onPointerUp`: a clicked
  button/`role=button`/`role=radio` is blurred, so Enter cannot re-fire it. Menus and dialogs
  (`role=dialog|menu|listbox`, `aria-haspopup`) keep their focus; Tab users keep Space/Enter.
- `web/src/desk/FrameControls.tsx` — `[`/`]` bypass `isEditableTarget` (brackets never belong to a
  Vocab name, and marking a range should not mean leaving the typeahead); `i`/`o` keep the guard.
  With an empty Brush, a bracket press now says
  `Brush is empty — pick an identity in the Library first` instead of returning silently.

Verified: `desk.spec.ts` + `mask-desk.spec.ts` 68 passed after the change.

**Blocked by:** —

Status: MERGED

- [x] a mouse click leaves no focused button
- [x] `[`/`]` act from inside a Vocab field; `i`/`o` do not
- [x] an empty Brush explains itself
- [x] no spec pins these three behaviours yet — see 12

## Comments

Delivered by hand as commit `e7287f2` (`fix(desk): focus, Ruler progress and the transport above
the Ruler`).
