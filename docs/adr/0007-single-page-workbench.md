# One workbench page: Clip rail, JPEG, editors, slider; no Frame filmstrip

Picking a Clip must not unload the desk. `/` and `/clips/:clipId` render the same workbench. The left rail lists allowlisted Clips (scroll). The URL still becomes `/clips/:clipId` when a Clip is open; Frame index stays in Zustand. The left Frame thumbnail strip from ADR 0005 goes away. Frames move on a bottom **slider** plus **play** (timed scrub of JPEGs). The three editors stay on the right, reorderable, with collapsible forms. The labeler can drag the Clip-rail width, the editor-rail width, and the bottom-bar height. Order and those sizes persist in **localStorage** on this machine — not on the server, not in the URL. Mask tools stay off this page. Task-focus stays banned.

## Considered Options

- **Keep `/` as a separate list page** — rejected; that is a jump.
- **Clip id only in Zustand, always `/`** — rejected; refresh loses the Clip.
- **Keep the left Frame filmstrip** — rejected; the Clip list owns the left rail.
- **Filmstrip under the JPEG plus a slider** — rejected; duplicate Frame transport.

## Consequences

- Playwright must open a Clip from the left rail, not via a standalone list page as the only path.
- Long Clips no longer mount one thumb per Frame on the left; the slider does not show every JPEG.
- Playback fps is a sitting control (JPEG pool has no fps metadata). It does not change the per-Frame JSON.
