import type { AnnotationSummary, AnnotationSummaryFrame } from "./api";
import { laneIsVisible, laneVisibilityKey, type LaneKind } from "./deskStore";
import { foldValues, type TimelineLane } from "./timeline";

/**
 * The mask answer to "标到哪了", folded from the Annotation summary
 * (`GET /api/clips/{clip_id}/annotations`): which Frames carry any Track's mask,
 * and which Frames each Track covers. mask has no Task focus tab, so it never
 * rides the focused Task type's coverage strip (05) — it is its own row.
 */

/** A maximal run of covered Frames or of gaps, the strip's drawing unit. */
export type CoverageSeg = {
  start: number;
  end: number;
  covered: boolean;
};

/** The mask row's own hue: mask is not a Task type, so it takes no `taskColor`. */
export const MASK_STRIP_COLOR = "hsl(28 60% 56%)";

/** The mask strip's accessible sentence, in the shape of the Task strip's. */
export function maskCoverageSummary(covered: number, total: number): string {
  return `Mask coverage: ${covered} of ${total} Frames have a Track mask`;
}

const TRACK_LANE_KIND: LaneKind = "track";

/** Stable Lane key of a Track: `track:<id>`, distinct from any Vocab Lane key. */
export function trackLaneKey(trackId: number): string {
  return laneVisibilityKey(TRACK_LANE_KIND, String(trackId));
}

/** A Track Lane is shown unless the labeler hid it; a Clip with no Tracks has none. */
export function trackLaneVisible(stored: Record<string, boolean>, trackId: number): boolean {
  return laneIsVisible(stored, trackLaneKey(trackId), true);
}

/** A Frame counts as covered when its entry holds at least one mask row. */
function frameCovered(frame: AnnotationSummaryFrame): boolean {
  // The summary always carries track_ids; mask_count keeps an older payload honest.
  return (frame.track_ids?.length ?? 0) > 0 || frame.mask_count > 0;
}

/** Covered Frame indexes, ascending: the strip's input. */
export function maskCoveredFrames(summary: AnnotationSummary | null | undefined): number[] {
  const indexes = new Set<number>();
  for (const frame of summary?.frames ?? []) {
    if (frame.frame_index == null || !frameCovered(frame)) {
      continue;
    }
    indexes.add(frame.frame_index);
  }
  return [...indexes].sort((a, b) => a - b);
}

/** Which Frames each Track covers: a Track Lane's spans before they are folded. */
export function trackMaskFrames(
  summary: AnnotationSummary | null | undefined,
): Map<number, number[]> {
  const byTrack = new Map<number, number[]>();
  for (const frame of summary?.frames ?? []) {
    if (frame.frame_index == null) {
      continue;
    }
    for (const trackId of frame.track_ids ?? []) {
      const frames = byTrack.get(trackId);
      if (frames) {
        frames.push(frame.frame_index);
      } else {
        byTrack.set(trackId, [frame.frame_index]);
      }
    }
  }
  for (const frames of byTrack.values()) {
    frames.sort((a, b) => a - b);
  }
  return byTrack;
}

/** Every covered Frame as a filled run, every other Frame as a gap, in Frame order. */
export function coverageSegments(frameCount: number, covered: Iterable<number>): CoverageSeg[] {
  if (frameCount <= 0) {
    return [];
  }
  const coveredSet = new Set(covered);
  const segs: CoverageSeg[] = [];
  let start = 0;
  let current = coveredSet.has(0);
  for (let index = 1; index <= frameCount; index += 1) {
    const next = index < frameCount ? coveredSet.has(index) : !current;
    if (next !== current) {
      segs.push({ start, end: index - 1, covered: current });
      start = index;
      current = next;
    }
  }
  return segs;
}

/**
 * One read-only Lane per Track the Clip has, in Track id order. A Track Lane
 * seeks on click and is never painted or trimmed: mask is written with the mask
 * tools, never by a span write, so the Lane carries no identity to write.
 */
export function trackLanes(
  frameCount: number,
  summary: AnnotationSummary | null | undefined,
  stored: Record<string, boolean>,
): TimelineLane[] {
  const framesByTrack = trackMaskFrames(summary);
  return [...(summary?.tracks ?? [])]
    .sort((a, b) => a.track_id - b.track_id)
    .filter((track) => trackLaneVisible(stored, track.track_id))
    .map((track) => {
      const key = trackLaneKey(track.track_id);
      const label = track.label || `track-${track.track_id}`;
      const frames = new Set(framesByTrack.get(track.track_id) ?? []);
      return {
        key,
        label,
        color: track.color ?? null,
        readOnly: true,
        segs: foldValues(frameCount, (index) => (frames.has(index) ? label : null)),
      };
    });
}
