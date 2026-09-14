import { expect, test } from "vitest";
import type { AnnotationSummary } from "./api";
import {
  coverageSegments,
  maskCoverageSummary,
  maskCoveredFrames,
  trackLaneKey,
  trackLanes,
  trackMaskFrames,
} from "./maskCoverage";

function summary(frames: AnnotationSummary["frames"], tracks = [1, 2]): AnnotationSummary {
  return {
    clip_id: "CLIP",
    frame_count: frames?.length ?? 0,
    frames,
    tracks: tracks.map((track_id) => ({
      track_id,
      label: `track-${track_id}`,
      color: track_id === 1 ? "#ff0000" : "#00ff00",
      score: null,
    })),
  };
}

test("the summary's covered Frames are those holding a mask row", () => {
  const doc = summary([
    { frame_stem: "0", frame_index: 0, mask_count: 1, track_ids: [1] },
    { frame_stem: "2", frame_index: 2, mask_count: 2, track_ids: [1, 2] },
  ]);
  expect(maskCoveredFrames(doc)).toEqual([0, 2]);
});

test("a payload without track_ids still covers by mask_count; no Annotation is no Frames", () => {
  const legacy = summary([
    { frame_stem: "1", frame_index: 1, mask_count: 1 },
    { frame_stem: "2", frame_index: 2, mask_count: 0 },
  ]);
  expect(maskCoveredFrames(legacy)).toEqual([1]);
  expect(maskCoveredFrames(null)).toEqual([]);
  expect(maskCoveredFrames(undefined)).toEqual([]);
  expect(trackMaskFrames(legacy).size).toBe(0);
});

test("coverage folds into filled runs and gaps, in Frame order", () => {
  expect(coverageSegments(4, [1, 2])).toEqual([
    { start: 0, end: 0, covered: false },
    { start: 1, end: 2, covered: true },
    { start: 3, end: 3, covered: false },
  ]);
  expect(coverageSegments(3, [0, 1, 2])).toEqual([{ start: 0, end: 2, covered: true }]);
  expect(coverageSegments(3, [])).toEqual([{ start: 0, end: 2, covered: false }]);
  expect(coverageSegments(1, [0])).toEqual([{ start: 0, end: 0, covered: true }]);
  expect(coverageSegments(0, [])).toEqual([]);
});

test("the strip's readout names mask and counts the covered Frames", () => {
  expect(maskCoverageSummary(2, 5)).toBe("Mask coverage: 2 of 5 Frames have a Track mask");
});

test("each Track lane spans the Frames its masks cover, and is read-only", () => {
  const doc = summary([
    { frame_stem: "0", frame_index: 0, mask_count: 1, track_ids: [1] },
    { frame_stem: "1", frame_index: 1, mask_count: 2, track_ids: [1, 2] },
    { frame_stem: "3", frame_index: 3, mask_count: 1, track_ids: [1] },
  ]);
  const lanes = trackLanes(4, doc, {});
  expect(lanes.map((lane) => lane.key)).toEqual([trackLaneKey(1), trackLaneKey(2)]);
  expect(lanes[0].label).toBe("track-1");
  expect(lanes[0].color).toBe("#ff0000");
  expect(lanes[0].readOnly).toBe(true);
  expect(lanes[0].segs).toEqual([
    { start: 0, end: 1, label: "track-1" },
    { start: 2, end: 2, label: null },
    { start: 3, end: 3, label: "track-1" },
  ]);
  expect(lanes[1].segs).toEqual([
    { start: 0, end: 0, label: null },
    { start: 1, end: 1, label: "track-2" },
    { start: 2, end: 3, label: null },
  ]);
});

test("a hidden Track lane is dropped; a Track with no mask keeps an empty lane", () => {
  const doc = summary(
    [{ frame_stem: "0", frame_index: 0, mask_count: 1, track_ids: [1] }],
    [1, 2],
  );
  expect(trackLanes(2, doc, { [trackLaneKey(1)]: false }).map((lane) => lane.key)).toEqual([
    trackLaneKey(2),
  ]);
  const [unmasked] = trackLanes(2, doc, {}).slice(1);
  expect(unmasked.segs.filter((seg) => seg.label)).toEqual([]);
});

test("a Track Label replaces the default row-head text", () => {
  const doc = summary([{ frame_stem: "0", frame_index: 0, mask_count: 1, track_ids: [1] }]);
  doc.tracks[0].label = "grasper tip";
  expect(trackLanes(1, doc, {})[0].label).toBe("grasper tip");
});
