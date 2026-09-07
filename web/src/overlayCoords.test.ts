import { expect, test } from "vitest";
import {
  DRAG_EXTENT,
  PREDICT_DEBOUNCE_MS,
  clientToRelative,
  debounceDue,
  displayedImageRect,
  dropPendingOnFrameChange,
  isClick,
  pointerExtent,
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
