import { useMemo } from "react";
import type { AnnotationSummary } from "../api";
import { useDeskStore } from "../deskStore";
import { trackLaneKey, trackLaneVisible, trackLanes } from "../maskCoverage";
import type { TimelineLane } from "../timeline";

/** The eye toggles of the Track Lanes: shown unless the labeler hid them. */
export function useTrackLaneVisibility() {
  const laneVisibility = useDeskStore((s) => s.laneVisibility);
  const setLaneVisible = useDeskStore((s) => s.setLaneVisible);
  return useMemo(
    () => ({
      trackLaneVisibleFor: (trackId: number) => trackLaneVisible(laneVisibility, trackId),
      toggleTrackLane: (trackId: number) =>
        setLaneVisible(trackLaneKey(trackId), !trackLaneVisible(laneVisibility, trackId)),
    }),
    [laneVisibility, setLaneVisible],
  );
}

/** The Track Lanes of the open Clip: they join the Lane well next to the Vocab Lanes. */
export function useTrackLanes({
  frameCount,
  summary,
}: {
  frameCount: number | undefined;
  summary: AnnotationSummary | null | undefined;
}): TimelineLane[] {
  const laneVisibility = useDeskStore((s) => s.laneVisibility);
  return useMemo(
    () => (frameCount ? trackLanes(frameCount, summary, laneVisibility) : []),
    [frameCount, laneVisibility, summary],
  );
}
