import { createContext, useContext } from "react";
import type { FrameAnnotations, PropagateDirection, PropagateJobPublic, TrackRow } from "../api";
import type { LeftoverPoint, PendingMark, PendingPoint, PendingStroke } from "../overlayCoords";
import type { MaskControlStates, MaskPointerGate } from "./maskControls";

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
  /** The server's sentence for a refused mask write, shown beside the controls, or
   * null when this Account may write the mask item or the read has not answered yet. */
  refusal: string | null;
  /** Which controls that permission and the writes in flight allow right now. */
  controls: MaskControlStates;
  /** What the picture canvas does with a pointer right now: open, holding a prompt
   * while `/api/me` answers, or off because a Job owns the Clip or the write is
   * refused. */
  pointerGate: MaskPointerGate;
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
  onDeleteTrack: (trackId: number) => void;
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
