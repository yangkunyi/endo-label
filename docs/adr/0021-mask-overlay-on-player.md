# Mask tools overlay the sitting player; do not replace it with the old FrameCanvas

The source mask desk paints on a JPEG canvas (`FrameCanvas`). This sitting’s picture is the media-chrome `<video>` (JPEG Clips play via transcoded mp4). Mask Geometric / Scribble Prompts overlay that player as a canvas, pause while painting, and map through the displayed image rect into relative `[0,1]` coords. Session HTTP stays the ported contract (fill Geometric Memory / leftover-point delete / Undo). The old `ClipDesk.tsx` / `FrameCanvas.tsx` are not copied in. Binding class / triplet to a Track is out of this slice.

Rejected: swapping the picture to a JPEG canvas when the point tool is armed; swapping the whole sitting for the old workbench page.
