# desk-combobox/02 — shadcn Pick+Create desk; HeroUI gone

**What to build:** The workbench is shadcn, always dark, no light switch. HeroUI is fully removed (no HeroUI components, no HeroUI package). Left Clip rail, contained JPEG, bottom slider and play/fps/skip, drag widths on a new localStorage key. Right rail is class → triplet → phase, fixed order, not tables: Pick+Create comboboxes write this Frame (type-to-add vocab, placeholder `Type to add`). Class chips toggle this Frame; re-picking a lit class tag turns it off. Phase re-picking the current name unlabeled this Frame. Triplet three comboboxes commit only when complete; same triple toggles off (needs ticket 01); instance × deletes that row. Closed List per editor: phase/class rename + trash; triplet three name lists trash only. × is never vocab delete. Interval Apply/chip/Mark from wait for ticket 03; this-Frame sitting must work without HeroUI.

- [x] `@heroui/*` (and HeroUI theme/plugin) are gone from the desk; no HeroUI component remains in the sitting
- [x] Sitting is always dark; no light switch; Clip rail, JPEG contain, slider, play, fps, skip-N, and rail drag work; editor order is class, triplet, phase and is not drag-reorderable
- [x] Class Pick+Create writes this Frame; chips show flags; chip click and re-pick toggle off; List rename/trash still desk-wide
- [x] Triplet Pick+Create writes a complete row; duplicate exact triple toggles off; × deletes this-Frame row; List trash 409 while in use
- [x] Phase Pick+Create writes this Frame; re-pick current name clears this Frame; List rename/trash still desk-wide
- [x] Empty vocab shows `Type to add`; no seed injection; no Task-focus; no filmstrip; no Arm; no mask
- [x] Playwright covers dark shadcn sitting, this-Frame Pick+Create for all three, chips/× vs List trash, and absence of HeroUI tables

## Answer

HeroUI is uninstalled. Dark shadcn workbench: Clip rail, contained JPEG, class → triplet → phase Pick+Create comboboxes, List rename/trash, play/slider. This-Frame writes only; interval gesture is ticket 03. Playwright 10 passed.
