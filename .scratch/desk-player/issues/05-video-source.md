# 05 — Video Clip in the same player

**What to build:** A `kind: video` Clip plays in the same player chrome via in-page `<video>`. Media is served read-only from the declared path. Frame index is `round(currentTime × fps)` with container fps, else 25. Seek sets `currentTime = index / fps`. Now and labels use that index. No transcode, no write into the Frame Pool, no seconds in JSON.

**Blocked by:** 01 — Catalog: kind + path; 02 — JPEG player chrome

**Status:** resolved

- [x] Video Clip uses `<video>`; jpeg Clip still uses the JPEG sequence path
- [x] Missing fps → 25; frame_count comes from duration × fps; mapping is reversible enough to seek
- [x] Media GET does not copy or mutate the source file
- [x] Playwright with a tiny fixture: video element present, seek updates Now
- [x] Compose: catalog video Clip, read-only media, labels HTTP unchanged

## Answer

`kind: video` Clips play via in-page `<video>` from read-only `GET /api/clips/{id}/media`. Catalog maps container duration × fps (else 25) to Frame indexes. JPEG Clips still use the sequence player. Labels HTTP unchanged.

Commit `f63548b` on `main`.

## Comments
