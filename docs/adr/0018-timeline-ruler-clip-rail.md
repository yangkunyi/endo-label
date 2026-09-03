# Timeline spans the Clips rail; a Ruler under the picture replaces the player progress bar

The interval track must line up with the picture, not with media-chrome's inset `MediaTimeRange`. The timeline is one full-width row under Clips+Player: lane-head column width follows `clipRailWidth`, colored bars occupy only the Player column. Bars do not paint into the Clips list (that would make the Playhead miss the picture). The chrome progress bar is hidden. Seek is an always-on **Ruler** flush under the picture; label lanes sit below it. An empty Clip has the Ruler only — no unnamed dim lane. The **Playhead** drags on the Ruler (frame-snapped); its stem may cross lanes but does not capture pointer; clicking a bar still seeks to that interval's start. Rate stays media-chrome (menu `0.25 0.5 1 1.5 2`), not a custom control.

This supersedes ADR 0017's "timeline full-width under the player only" and "the Playhead on the lane band is the seek". Tokens, transcode, and Video Player transport in 0017 still hold.

## Considered Options

- **Extend colored bars into the Clips column** — rejected; the Playhead would not match the picture.
- **Keep `MediaTimeRange` and align the band to it** — rejected; the chrome range is inset (play/time/rate eat width) and is the wrong ruler.
- **Show `MediaTimeRange` only when there are no labels** — rejected; seek chrome must not appear and vanish.
- **Unlabeled dim lane as the empty-Clip seek** — rejected; a dedicated Ruler is the seek in every Clip.
- **Playhead stem also drags** — rejected; it would steal click-to-interval-start on bars.
