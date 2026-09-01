# Sitting is a media player with Task-focus editors; Clip source is jpeg or video; labels stay Frames

The combobox workbench (ADR 0015) still feels like three forms plus a frame slider. The sitting becomes an in-page **player** (play/pause/progress/rate). JPEG Clips play as a timed sequence; video Clips use `<video>`. Catalog entries in YAML are explicit `kind: jpeg | video` plus a path (not guessed from extensions). The durable key remains Frame index `0..N-1` (video: `currentTime × fps`, container fps or 25). Playback rate does not change labels. Sparse per-Frame JSON stays; the timeline **displays** folded intervals for the focused Task type only. Right rail: Now (this Frame) / Library (vocab) / other-kinds summary. Task focus is sitting chrome only ([CONTEXT.md](../../CONTEXT.md)). No transcode into the Frame Pool. No seconds in label JSON (ADR 0008 still holds).

## Considered Options

- **Keep three editors + frame slider** — rejected; the labeler asked for a player and tabs.
- **Store seconds / write mp4** — rejected; JPEG has no camera clock; the pool is read-only; rate would corrupt timestamps.
- **Guess jpeg vs video from the filesystem** — rejected; `CASE/` and `CASE.mp4` collide.

## Consequences

- ADR 0007’s “Task-focus stays banned” is superseded for sitting chrome. Stores stay independent.
- ADR 0015’s three-combobox rail is superseded when this sitting ships.
- `config.yaml` grows per-Clip `kind` and path. Old `frames_root` + allowlist lists must be rewritten or mapped.
- Playwright drives a player and one visible editor, not three tables.
