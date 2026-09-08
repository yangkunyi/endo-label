# 01 — Lane well is a reserved strip; picture height does not follow Lanes

**What to build:** Under the Ruler, reserve a fixed-height **Lane well** (~6rem / `h-24`) that always sits on an open Clip with Frames, even when no Lane is visible. Picture height does not change when the first Lane appears or when many Lanes exist. Extra Lanes scroll inside the well. The well does not overlay the picture. The Ruler stays flush under the picture, above the well. Lane-head names keep the Clips-rail width; colored bars stay under the picture. JPEG and video Clips share this geometry. This supersedes “empty Clip is Ruler only”.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] An open Clip with Frames always shows the Lane well under the Ruler, including when zero Lanes are visible
- [x] Player picture height is the same before and after a Lane appears
- [x] Adding more Lanes does not grow the well; extra rows scroll inside it
- [x] Ruler stays unlabeled seek, flush under the picture, above the well
- [x] Lane-head column width follows the Clips rail; bars align with the picture, not the Clips list
- [x] JPEG and video Clips share this geometry
- [x] Playwright: empty Clip still has the well (rewrite the old “Ruler only” case); picture height stays put when a Lane appears

## Answer

Lane well is always on for an open Clip with Frames: `h-24 shrink-0 overflow-y-auto` under the Ruler (`aria-label="Lane well"`). Picture height does not follow Lane count. Extra Lanes scroll inside. JPEG and video share the geometry.

Commit `7c39a9c` on `dev1`. typecheck 0; vitest 31; Playwright grep for the well case 0. Full suite is ticket 06.
