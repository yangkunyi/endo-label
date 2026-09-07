import { expect, test } from "vitest";
import {
  DRAG_EXTENT,
  PIN_HIT_RADIUS_PX,
  PREDICT_DEBOUNCE_MS,
  SCRIBBLE_LETTERBOX,
  SCRIBBLE_WIDTH_DEFAULT,
  SCRIBBLE_WIDTH_MAX,
  SCRIBBLE_WIDTH_MIN,
  clampScribbleWidth,
  clientToRelative,
  debounceDue,
  displayedImageRect,
  dragCommit,
  dropPendingOnFrameChange,
  hitLeftoverPin,
  isClick,
  isPendingStroke,
  leftoverPinsForActive,
  nextActiveTrack,
  overlayPins,
  pointerExtent,
  splitPendingMarks,
  strokeInkWidthPx,
  type PendingMark,
} from "./overlayCoords";

test("object-contain letterbox maps the image rect, not the player box", () => {
  const rect = displayedImageRect(
    { left: 0, top: 0, width: 200, height: 100 },
    { width: 100, height: 100 },
  );
  expect(rect).toEqual({ left: 50, top: 0, width: 100, height: 100 });
});

test("taller player letterboxes top and bottom", () => {
  const rect = displayedImageRect(
    { left: 10, top: 20, width: 100, height: 200 },
    { width: 100, height: 100 },
  );
  expect(rect).toEqual({ left: 10, top: 70, width: 100, height: 100 });
});

test("click on the displayed image is relative [0,1] from the top-left", () => {
  const rect = displayedImageRect(
    { left: 0, top: 0, width: 200, height: 100 },
    { width: 100, height: 100 },
  );
  expect(rect).not.toBeNull();
  expect(clientToRelative(50, 0, rect!)).toEqual({ x: 0, y: 0 });
  expect(clientToRelative(150, 100, rect!)).toEqual({ x: 1, y: 1 });
  expect(clientToRelative(100, 50, rect!)).toEqual({ x: 0.5, y: 0.5 });
});

test("click in the letterbox is not a Geometric Prompt", () => {
  const rect = displayedImageRect(
    { left: 0, top: 0, width: 200, height: 100 },
    { width: 100, height: 100 },
  );
  expect(clientToRelative(25, 50, rect!)).toBeNull();
  expect(clientToRelative(175, 50, rect!)).toBeNull();
});

test("missing media size has no image rect", () => {
  expect(
    displayedImageRect(
      { left: 0, top: 0, width: 200, height: 100 },
      { width: 0, height: 0 },
    ),
  ).toBeNull();
});

test("click vs drag splits at relative extent 0.005", () => {
  expect(DRAG_EXTENT).toBe(0.005);
  const start = { x: 0.5, y: 0.5 };
  expect(pointerExtent(start, { x: 0.504, y: 0.5 })).toBeCloseTo(0.004, 8);
  expect(isClick(start, { x: 0.504, y: 0.5 })).toBe(true);
  expect(isClick(start, { x: 0.506, y: 0.5 })).toBe(false);
});

test("pending marks drop when the Frame changes and stay on the same Frame", () => {
  const pending = [{ x: 0.2, y: 0.3, label: 1 as const }];
  expect(dropPendingOnFrameChange(pending, 0, 1)).toEqual([]);
  expect(dropPendingOnFrameChange(pending, 2, 2)).toEqual(pending);
});

test("auto-Predict is due 800 ms after the last mark", () => {
  expect(PREDICT_DEBOUNCE_MS).toBe(800);
  expect(debounceDue(null, 800)).toBe(false);
  expect(debounceDue(0, 799)).toBe(false);
  expect(debounceDue(0, 800)).toBe(true);
  expect(debounceDue(100, 900)).toBe(true);
});

test("leftover pins are only the Active Track; overlay stacks pending after leftover", () => {
  const tracks = [
    { track_id: 1, geometric_memory: [{ x: 0.2, y: 0.3, positive: true }] },
    { track_id: 2, geometric_memory: [{ x: 0.8, y: 0.1, positive: false }] },
  ];
  expect(leftoverPinsForActive(tracks, 1)).toEqual([{ x: 0.2, y: 0.3, positive: true }]);
  expect(leftoverPinsForActive(tracks, null)).toEqual([]);
  expect(
    overlayPins([{ x: 0.2, y: 0.3, positive: true }], [{ x: 0.5, y: 0.5, label: 1 }]),
  ).toEqual([
    { x: 0.2, y: 0.3, label: 1 },
    { x: 0.5, y: 0.5, label: 1 },
  ]);
});

test("click on a leftover pin is a 10 CSS-pixel hit; drag is not delete", () => {
  expect(PIN_HIT_RADIUS_PX).toBe(10);
  const pin = { x: 0.5, y: 0.5, positive: true };
  expect(hitLeftoverPin({ x: 0.53, y: 0.5 }, [pin], { width: 200, height: 200 })).toBe(0);
  expect(hitLeftoverPin({ x: 0.53, y: 0.5 }, [pin], { width: 1000, height: 1000 })).toBeNull();
  expect(isClick({ x: 0.5, y: 0.5 }, { x: 0.504, y: 0.5 })).toBe(true);
  expect(isClick({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 })).toBe(false);
});

test("Active Track comes from the rail; New Track clears; picture click does not select", () => {
  expect(nextActiveTrack(null, { kind: "rail", trackId: 2 })).toBe(2);
  expect(nextActiveTrack(2, { kind: "new" })).toBeNull();
  expect(nextActiveTrack(null, { kind: "created", trackId: 1 })).toBe(1);
  expect(nextActiveTrack(3, { kind: "created", trackId: 4 })).toBe(3);
  expect(nextActiveTrack(2, { kind: "picture" })).toBe(2);
  expect(nextActiveTrack(null, { kind: "picture" })).toBeNull();
});

test("a click commits a point; a drag commits a stroke with the current width", () => {
  const start = { x: 0.5, y: 0.5 };
  const click = dragCommit(start, { x: 0.501, y: 0.5 }, [start, { x: 0.501, y: 0.5 }], 1, 8);
  expect(click).toEqual({ x: 0.5, y: 0.5, label: 1 });

  const samples = [start, { x: 0.55, y: 0.5 }, { x: 0.6, y: 0.52 }];
  const stroke = dragCommit(start, { x: 0.6, y: 0.52 }, samples, 0, 24);
  expect(isPendingStroke(stroke!)).toBe(true);
  expect(stroke).toEqual({ points: samples, label: 0, width: 24 });
});

test("a drag with no samples still commits start and last as the polyline", () => {
  const start = { x: 0.2, y: 0.3 };
  const last = { x: 0.4, y: 0.3 };
  const stroke = dragCommit(start, last, [], 1, 8);
  expect(isPendingStroke(stroke!)).toBe(true);
  expect(stroke).toEqual({ points: [start, last], label: 1, width: 8 });
});

test("pending strokes keep the width they were drawn with; points stay points", () => {
  const marks: PendingMark[] = [
    { x: 0.1, y: 0.1, label: 1 },
    { points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.3 }], label: 1, width: 24 },
    { points: [{ x: 0.7, y: 0.7 }], label: 0, width: 3 },
  ];
  const split = splitPendingMarks(marks);
  expect(split.points).toEqual([[0.1, 0.1]]);
  expect(split.point_labels).toEqual([1]);
  expect(split.scribbles).toEqual([
    [
      [0.3, 0.3],
      [0.4, 0.3],
    ],
    [[0.7, 0.7]],
  ]);
  expect(split.scribble_labels).toEqual([1, 0]);
  // A later slider move must not rewrite strokes already drawn.
  expect(split.scribble_widths).toEqual([24, 3]);
});

test("stroke ink is full diameter scaled from the 1024 letterbox to the displayed rect", () => {
  expect(SCRIBBLE_LETTERBOX).toBe(1024);
  expect(strokeInkWidthPx(8, 1024)).toBe(8);
  expect(strokeInkWidthPx(12, 512)).toBe(6);
  expect(strokeInkWidthPx(40, 2048)).toBe(80);
});

test("slider width clamps to 1–40 with default 8", () => {
  expect(SCRIBBLE_WIDTH_DEFAULT).toBe(8);
  expect(SCRIBBLE_WIDTH_MIN).toBe(1);
  expect(SCRIBBLE_WIDTH_MAX).toBe(40);
  expect(clampScribbleWidth(8)).toBe(8);
  expect(clampScribbleWidth(0)).toBe(1);
  expect(clampScribbleWidth(41)).toBe(40);
  expect(clampScribbleWidth(8.4)).toBe(8);
});
