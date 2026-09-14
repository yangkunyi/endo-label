import { useCallback } from "react";
import { everyFrameLabeledNotice, nextUnlabeledFrame, type FrameCoverage } from "../timeline";
import type { DeskNotice } from "./notice";
import { usePlayback } from "./playback";

/**
 * Next unlabeled Frame: one gesture behind the `n` key and the button beside the
 * Coverage Strip. The target is read off the Strip's own folded map (ADR 0029),
 * so the jump and the band always agree, and "nothing left" is a notice rather
 * than a silent no-op.
 *
 * It lives inside the playback context because a jump is a seek: moving the
 * Playhead without the picture would be a lie the next `timeupdate` corrects.
 */
export function useUnlabeledJump({
  coverage,
  frameIndex,
  notify,
}: {
  coverage: FrameCoverage;
  frameIndex: number;
  notify: (notice: DeskNotice) => void;
}): () => void {
  const { seek } = usePlayback();

  return useCallback(() => {
    if (coverage.total <= 0) {
      return;
    }
    const next = nextUnlabeledFrame(coverage, frameIndex);
    if (next == null) {
      notify({ text: everyFrameLabeledNotice(coverage.task), error: false });
      return;
    }
    seek(next);
  }, [coverage, frameIndex, notify, seek]);
}
