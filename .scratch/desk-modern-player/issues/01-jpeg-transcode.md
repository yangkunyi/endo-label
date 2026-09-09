# 01 — JPEG Clip lazily transcodes to mp4 with cache

**What to build:** First open of a JPEG Clip transcodes its frames to mp4 (ffmpeg CLI, 25 fps, h264, yuv420p, faststart, no audio) into `data/video-cache/<clipId>.mp4`. Cache hit when the source folder mtime is unchanged. Missing ffmpeg fails with a clear error. The Frame Pool stays read-only. Frame indexes stay `0..N-1` (`round(t × 25)`). Compose: cache file created, mtime reuse, missing-ffmpeg path, pool untouched.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] Opening a JPEG Clip produces a playable mp4 cache file; label JSON still uses frame indexes
- [x] Re-open uses the cache when the source folder mtime is unchanged
- [x] Missing ffmpeg gives a clear error, not a silent fallback
- [x] The Frame Pool file mtimes are unchanged by desk traffic
- [x] Compose covers cache build, mtime reuse, and the missing-ffmpeg error path

## Answer

JPEG Clips lazily transcode to `data/video-cache/<clipId>.mp4` (ffmpeg concat, 25 fps, h264, yuv420p, faststart, no audio). Cache reused when the source folder mtime is unchanged; ffmpeg check runs after the freshness check so a fresh cache does not need ffmpeg. Frame Pool untouched; indexes stay `round(t × 25)`.

Commits: child work captured via `e57e6f2` (child t01 died in its own review; independent diff-review found one P1, reordered before commit).