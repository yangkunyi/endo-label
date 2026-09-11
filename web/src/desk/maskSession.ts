import { createContext, useContext } from "react";
import type { FrameAnnotations, PropagateDirection, PropagateJobPublic, TrackRow } from "../api";
import type { LeftoverPoint, PendingMark, PendingPoint, PendingStroke } from "../overlayCoords";

/** Mask working state and controls for the focused Clip and Frame, shared by the
 * Track rail and the picture overlay so neither owns the other. */
export type MaskSession = {
  tracks: TrackRow[];
  frameMasks: FrameAnnotations["masks"];
  leftover: LeftoverPoint[];
  pending: PendingMark[];
  pendingCount: number;
  scribbleWidth: number;
  activeTrackId: number | null;
  canUndo: boolean;
  busy: boolean;
  predicting: boolean;
  canPropagate: boolean;
  frameKept: boolean;
  propagateJob: PropagateJobPublic | null;
  propagateElapsed: number;
  propagateDirection: PropagateDirection;
  propagateMaxFrames: string;
  onPropagateDirection: (direction: PropagateDirection) => void;
  onPropagateMaxFrames: (value: string) => void;
  onPropagate: () => void;
  onScribbleWidth: (width: number) => void;
  onPredict: () => void;
  onUndo: () => void;
  onSelectTrack: (trackId: number) => void;
  onNewTrack: () => void;
  onRenameTrack: (trackId: number, label: string) => Promise<void> | void;
  onClearMask: () => void;
  onClickPoint: (point: PendingPoint) => void;
  onClickStroke: (stroke: PendingStroke) => void;
  onDeletePin: (index: number) => void;
};

export const MaskSessionContext = createContext<MaskSession | null>(null);

export function useMaskSession(): MaskSession {
  const session = useContext(MaskSessionContext);
  if (!session) {
    throw new Error("useMaskSession must be used inside MaskSessionProvider");
  }
  return session;
}
