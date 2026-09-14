# pilot-ux/03 — Ruler progress and the transport above it

**What to build:** the picture's under-strip should read as progress, and the playback controls
belong directly under the picture. Trial feedback: "进度条没有颜色，只有点…把进度条和播放控制条交换
一下".

Before: the Ruler was a 1 px hairline plus an 8 px Playhead dot, with the transport row *below*
it and the Lane well below that.

Code:
- `web/src/desk/TimelineBand.tsx` — new `[data-ruler-progress]` fill (`#5e6ad2` at 20%) behind the
  hairline, `width` = the Playhead's position, so the seek track shows how far the Playhead has
  come; the Playhead dot and the 35% range preview stay. The transport row moved above the Ruler,
  giving picture → transport → Ruler → Lane well.
- `web/e2e/desk.spec.ts` — the three order assertions updated to the new stacking.

`CONTEXT.md`'s Ruler entry still says "directly under the picture" and still avoids the word
"progress bar"; 11 fixes the wording (the decision was to keep the Ruler a seek track that
*shows* progress, not to turn it into a completion meter).

- [x] the Ruler shows the played span, keeping dot and range preview
- [x] the transport sits between the picture and the Ruler
- [x] Lane well ordering and the reserved strip height are unchanged
- [x] glossary wording updated — tracked in 11
