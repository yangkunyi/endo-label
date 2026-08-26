# 01 — HeroUI tables write this Frame

**What to build:** The workbench right rail is three always-open HeroUI Tables (default order class, triplet, phase; drag to reorder; no chevron fold). Phase and class rows are the desk vocab lists; triplet rows are this Frame’s instance rows (columns instrument, verb, target). Click, plus+Enter, x, and triplet cell edits persist this Frame immediately. Shell controls (slider, play, buttons) are HeroUI, not `stone-*` chrome. There is no Arm control. `[` / `I` then `]` / `O` paints the **selected** rows as Write using the existing span POSTs (one request per selected class tag and per selected complete triplet row). Play, fps, skip-N, Clip rail, contained JPEG, and localStorage split sizes / editor order stay.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Class, triplet, and phase editors are HeroUI Tables; they stay open (no fold state); they can be dragged to reorder; copy says phase, class, triplet, instrument, verb, target — never Arm, armed, operation on/off, subject–verb–object, or Annotation
- [x] The sitting uses HeroUI Table, Select, Button, and Slider for these controls; it does not restyle them with `stone-*`; lucide plus/x mark add and remove
- [x] Phase: one row per desk phase name; at most one selected, equal to this Frame’s phase (or none); click PUTs that name on this Frame; plus then a name + Enter adds the vocab name and selects it on this Frame; x clears this Frame’s phase only
- [x] Class: one row per class-tag name; selected rows are exactly the flags on this Frame; click toggles that flag on this Frame; plus + Enter adds the tag and turns it on this Frame; x turns that flag off this Frame and does not delete it from the list
- [x] Triplet: plus appends an empty row that is not written until all three cells have names on the matching lists; x DELETEs that row on this Frame; editing a cell updates that row only; typing a new word adds it to that list and uses it on this row; two rows with the same triple remain allowed
- [x] Span Write uses table selection (no Arm): phase overwrites the selected name; class unions every selected tag; triplet idempotent-adds every selected complete row; incomplete triplet rows are ignored; `]` without `[` is this Frame only; keys are ignored while an input is focused; a successful span write pauses play
- [x] Mask, Task-focus, Session, vocab delete, and desk-wide rename of instrument/verb/target lists are out of this ticket
- [x] Compose coverage of existing class/triplet span semantics stays green; Playwright shows the three tables, current-Frame writes, no “Arm class span”, no Frame filmstrip, and Space play still working

## Answer

Right rail is three always-open HeroUI Tables (class, triplet, phase). Click / plus+Enter / x write this Frame. `[` snapshots the selected rows; `]` POSTs span Write (phase overwrite, class union, triplet add). No Arm. Remove-from-span and desk-wide rename stay tickets 02–03.
