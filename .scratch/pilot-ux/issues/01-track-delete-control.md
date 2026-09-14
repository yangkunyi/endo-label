# pilot-ux/01 — Track delete control

**What to build:** a way to drop a Track from the desk. `DELETE /api/session/tracks/{track_id}`
has existed since the port, but the ClipDesk decomposition carried no control for it, so a Track —
and every mask under it — could only be removed by hand against the API. Trial feedback: "现在好像
没办法删掉 track".

Code:
- `web/src/desk/MaskPanel.tsx` — the Track rail row gains a trash `Button` (`aria-label` =
  `Delete <Track Label>`), disabled while `busy || predicting`, and a `window.confirm` that names
  the Track and says its masks go with it. The panel calls the session's `onDeleteTrack`.
- `web/src/desk/maskSession.ts` — `MaskSession` gains `onDeleteTrack(trackId)`.
- The provider's handler sends `DELETE sessionTrackPath(trackId, clipId)`, clears `activeTrackId`
  when it was the deleted Track, then reloads the Session Frame, the Annotation summary and the
  Frame annotations.

Verified on the real pilot: session drops the Track immediately, the Track's masks leave the
persisted Annotation, and reopening the Session does not resurrect it. `mask-desk.spec.ts` 17
passed.

- [x] the rail row deletes a Track (with confirm) and its masks
- [x] the deleted Track stops being the Active Track
- [x] deleting is refused while a Predict or Propagate is running
- [x] no e2e for the trash button yet — see 12
