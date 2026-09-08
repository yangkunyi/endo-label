// Display-only Track-on-Frame state helpers for the desk rail (ticket 10).
// Copy follows CONTEXT.md Source / Protected wording; no state semantics here.

import type { PropagateDirection } from "./api";

export type TrackState = "empty" | "manual" | "refined" | "propagated";

export function trackState(source: string | null | undefined): TrackState {
  if (source === "manual" || source === "refined" || source === "propagated") {
    return source;
  }
  return "empty";
}

// Protected Mask on the desk: Source manual or refined. Review-accepted is
// out of scope here (spec: no Review UI).
export function isProtectedState(state: TrackState): boolean {
  return state === "manual" || state === "refined";
}

export function hasMaskHandoff(
  provenance: { mask_handoff?: unknown } | null | undefined,
): boolean {
  return provenance?.mask_handoff === true;
}

// Mirror of the server's _planned_frames: Frames a Propagate Job planned to
// fill — seed Frame excluded, forward then backward, clipped to the Clip.
export function propagateTargetFrames(
  job: { start: number; direction: PropagateDirection; maxFrames: number | null },
  frameCount: number,
): Set<number> {
  const limit = job.maxFrames == null ? frameCount : job.maxFrames;
  const out = new Set<number>();
  if (job.direction === "forward" || job.direction === "both") {
    for (let step = 1; step <= limit; step += 1) {
      const index = job.start + step;
      if (index >= frameCount) {
        break;
      }
      out.add(index);
    }
  }
  if (job.direction === "backward" || job.direction === "both") {
    for (let step = 1; step <= limit; step += 1) {
      const index = job.start - step;
      if (index < 0) {
        break;
      }
      out.add(index);
    }
  }
  return out;
}
