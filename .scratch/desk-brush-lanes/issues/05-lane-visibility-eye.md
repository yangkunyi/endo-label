# 05 — Library eye shows or hides a Lane; unused start hidden

**What to build:** Each Library row gets an eye control, distinct from the name (this-Frame), the Brush control, and trash. Copy: `Show lane` / `Hide lane`. Identities already present on this Clip start with the eye on; unused Vocab identities start off. Turning the eye on for an unused name shows an empty Lane that can be drag-painted (ticket 04). A labeled Lane may be hidden; hide is not Vocab trash and not unlabeled. Now, Library Selection, and Brush ignore the eye. Apply/Remove of a hidden Brush identity still writes disk. Visibility persists in localStorage on this machine, keyed by Task type + identity. Missing key: visible if present on this Clip, else hidden. A stored hide wins over “present on this Clip”. A newly added Vocab name starts hidden. Do not run or edit Playwright; ticket 06 covers hide/show and unused empty-Lane paint in the browser.

**Blocked by:** 01 — Lane well is a reserved strip; picture height does not follow Lanes. 04 — Lane bars seek under the pointer, paint on empty drag, Shift-select, trim, Backspace.

Status: MERGED

- [x] Eye is a separate control from name, Brush, and trash; English `Show lane` / `Hide lane`
- [x] Present-on-Clip identities start visible; unused start hidden; `+` a new Vocab name does not dump an empty Lane
- [x] Eye on an unused identity shows an empty Lane; drag-empty paints that identity
- [x] Eye off a labeled Lane removes it from the well; GET still has those Frames; Now / Library Selection / Brush unchanged
- [x] Apply/Remove still writes a hidden Brush identity
- [x] Reload and Clip change keep the stored map; stored hide wins over present-on-Clip; a machine with no map uses the defaults
- [x] vitest: missing key + present vs unused; stored hide wins
- [x] `tsc` green. Do not run or edit Playwright (`web/e2e/desk.spec.ts` is ticket 06)

## Answer

Each Library row (class, phase list, triplet table) gains an eye button between the name and Brush (`aria-label` exactly `Hide lane` when the Lane is visible, `Show lane` when hidden; Lucide `Eye` / `EyeOff`). The deskStore holds `laneVisibility`, a machine-local `Record<string, boolean>` persisted to localStorage under `endo_label:lane-visibility-v1`, keyed `class:NAME`, `phase:NAME`, `triplet:INST / VERB / TGT` (`laneVisibilityKey`). `laneIsVisible(stored, key, presentOnClip)` is the single resolution rule: a stored boolean always wins; a missing key falls back to present-on-Clip, so present identities start visible, unused start hidden, and a freshly added Vocab name (no key, no frames) starts hidden. `presentLaneKeys` derives present identities from the Clip's phase/class/triplet docs; `visibleLanes` walks Vocab order, emits `{ key, segs: [] }` for unused-but-eye-on identities, and appends disk lanes missing from Vocab, so an eye-on unused identity is an empty Lane that drag-paints through the existing ticket 04 path. Hidden identities are dropped from the well only; Now, Library Selection, and Brush never read the map, and `applyRange` still POSTs every Brush identity, so Apply/Remove of a hidden Brush identity writes disk.

On `dev1`. `tsc` 0; vitest 43 (deskStore.test.ts 20, incl. missing key + present vs unused and stored hide wins). Playwright not run or edited. Nested `/code-review` spawn: first attempt's result was lost (`not found`), retry returned both axes with no findings.
