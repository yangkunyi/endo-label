# 02 — Click a point, see a Track, Annotation is on disk

**What to build:** On the sitting player, a left click is a positive Geometric Prompt. After debounce (800 ms) or the rail Predict control, a Track appears as a silhouette on the overlay and in the right-rail Track list (visible even when Task focus is class). First Predict opens a Session with saved Annotation loaded; opening the Clip and painting phase still does not. Click on the picture does not play; Space / player button / Ruler still play. Successful Predict replaces Annotation immediately — reload the desk, no Save, silhouette still there. Non-empty boxes are rejected. Fake backends.

**Blocked by:** 01 — This worktree uses its own ports

Status: MERGED

- [x] Picture overlay maps through the displayed image rect to relative `[0,1]`; playback pauses while marking
- [x] Left click → Predict → overlay silhouette + Track row; default Track Label `track-N`
- [x] Session stays inactive until that Predict; phase/class/triplet writes still do not open it
- [x] Click on the picture does not toggle play; Space plays when not typing
- [x] Track list stays on the right rail across Task focus; rail scrolls
- [x] GET Annotation with no Session returns the new Track-on-Frame; no Save control
- [x] Boxes payload is 4xx; at most 16 Tracks; negatives alone do not create a Track
- [x] Compose pytest (fake) + Vitest cover the loop. No Playwright here — desk e2e is ticket 07.

## Answer

Sitting overlay maps clicks through the displayed image rect into `[0,1]`. Left click is a pending positive Geometric Prompt; 800 ms debounce or rail Predict opens Session (`load_annotations: true`) then Predict. Track silhouette + `track-N` row on the right rail (rail scrolls; Task focus unchanged). Picture click does not play; Space / play button / Ruler still do; pointer-down pauses. Successful Predict replaces Annotation immediately — GET with no Session still returns the Track-on-Frame. Boxes 4xx; cap 16; negatives alone do not create. Fake backends. Covered by compose pytest + Vitest; no Playwright (ticket 07).
