# Lane well is a fixed strip; Brush is not Library Selection; Lanes paint, select, hide

The picture must not shrink when Lanes appear (ADR 0017 promised this; the in-flow band did not). Interval paint must name its identities without writing the current Frame first. ADR 0015’s paint chip (last this-Frame write) and its rejection of “selection separate from this-Frame” are superseded: **Brush** is a sitting set independent of **Library Selection**. Class and triplet Brushes may hold several identities; phase at most one. `i`/`[` and `o`/`]` stay Premiere In/Out on that Brush — they do not enter a mode.

The **Lane well** under the Ruler is a reserved ~6rem strip (scroll inside). Click a bar: seek to the Frame under the pointer. Hold Shift and click: select (multi-select); Backspace deletes those segments; drag the ends of a selected bar to trim. Drag empty track: paint that Lane’s identity. Bottom **Remove** stays the Brush + In–Out eraser. The player progress range is not a label control.

**Lane visibility** is an eye on the Library row (not trash, not ✓). Present-on-Clip identities start visible; unused start hidden. A labeled Lane may be hidden. Visibility persists in localStorage on this machine.

This supersedes ADR 0015’s paint chip as span payload, ADR 0017’s “timeline under the player only / Playhead on the lane is the seek” remainder, and ADR 0018’s “empty Clip has the Ruler only” plus “clicking a bar seeks to that interval’s start”. ADR 0008 span HTTP, ADR 0014 unique triplet, ADR 0016 Task focus, ADR 0019 exact-triple Vocab, and ADR 0020 Editor Cards still hold. No Arm. No scribble (mask). No sticky select mode.

## Considered Options

- **Overlay Lanes on the picture** — rejected; anatomy and media-chrome would be covered.
- **`i` enters a paint/select mode** — rejected; `i` is Mark from; sticky modes were already thrown out with Arm.
- **Split the Library color swatch into a Brush hit target** — rejected; too small, not a known pattern.
- **Span payload = every identity on this Frame** — still rejected; Brush is an explicit set, not Now.
- **Delete by boxing a range on the Ruler or MediaTimeRange** — rejected; those tracks are seek/progress.
- **Sticky `S` select mode; click-bar no longer seeks** — rejected; hold Shift is the multi-select, click still seeks.
- **Always show a Lane for every Vocab name** — rejected as the default; unused start hidden, eye shows an empty Lane.

## Consequences

- Playwright must drive Brush (not last this-Frame write), Shift-click on bars, and the Lane well height independent of lane count.
- Class span HTTP is still one tag per request (ADR 0008); a multi-identity Apply is several posts, not a new document shape.
- localStorage grows a Lane-visibility map; a new machine starts from the Q19 defaults.
