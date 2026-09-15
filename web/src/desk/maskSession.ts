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
   * null when this Account may write the mask item, the read has not answered yet, or
   * the read failed. The failed read's own line rides on `readFailure`, because the
   * server sent no sentence for it. */
  refusal: string | null;
  /** The desk's own line for a `/api/me` read that never answered — the 404 for an item
   * that does not exist, or a request that failed — or null when there is no such
   * failure. Shown beside the controls, where a refusal's sentence would go. */
  readFailure: string | null;
  /** Which controls that permission and the writes in flight allow right now. */
  controls: MaskControlStates;
  /** What the picture canvas does with a pointer right now: open, holding a prompt
   * while `/api/me` answers, or off because a Job owns the Clip, the write is
   * refused, or the read never answered. */
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
