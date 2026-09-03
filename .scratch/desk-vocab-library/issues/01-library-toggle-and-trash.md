# 01 — Library is this-Frame toggle, Vocab trash, and rename; List is gone

**What to build:** Now stays read-only. Library is the this-Frame toggle: a row looks selected when that identity is on this Frame; click again turns it off. Plus still adds a Vocab name only, not this Frame. Each phase and class Library row has trash: confirm, then delete that name desk-wide (phase unlabeled / class flag dropped on every Clip). Double-click a phase or class name in Library to rename desk-wide. The folded List section is gone. Span Mark from / Apply / Remove unchanged. Playwright: selected/toggle, Plus does not write Frame, confirm then delete, List gone. Compose: existing phase/class delete and rename still atomic.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Library row selected means on this Frame; click toggles this Frame only
- [x] Now stays read-only; Plus does not write this Frame
- [x] Trash on phase/class Library rows confirms, then rewrites every Clip
- [x] Double-click rename lives on Library; List is gone
- [x] Playwright and compose cover toggle, confirm-delete, and no List

## Answer

Phase/class Library rows are `aria-pressed` when that identity is on this Frame; click toggles this Frame only. Plus still POSTs vocab only. Trash confirms (`window.confirm`) then DELETE rewrites every Clip. Double-click the Library name to rename desk-wide. Folded List is gone on phase/class (triplet List stays for ticket 02). Playwright covers selected/toggle, Plus, confirm-delete, List gone; compose rename/delete tests still pass.
