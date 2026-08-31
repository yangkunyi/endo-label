# 01 — Catalog: kind + path

**What to build:** Sitting YAML lists each Clip with explicit `kind` (`jpeg` or `video`) and a `path`. The clip list HTTP returns `id`, `kind`, `frame_count`, and the fps used for mapping. Existing JPEG Clips still open. A single bad path is skipped (sitting still starts). The process never writes into the Frame Pool.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] YAML Clips declare `kind` and `path`; unknown kind or unreadable path does not take down the whole sitting
- [x] `GET` clip list includes `id`, `kind`, `frame_count`, `fps` (jpeg clock fps is 25 this pass)
- [x] JPEG folders still serve Frames; Frame Pool mtime unchanged after list/desk traffic
- [x] Video kind is accepted in the catalog even if the player cannot play it until ticket 05
- [x] Compose covers a jpeg Clip, a missing path skip, and list payload shape

## Answer

`clips:` YAML entries (`id`, `kind`, `path`) load into the catalog. List/meta include `kind` and `fps` (25). Missing path and unknown kind are skipped. Video files list with `frame_count: 0` until ticket 05. `frames_root` + `clip_allowlist` still synthesize jpeg entries for existing tests.

Commit after review.
