import { expect, test } from "vitest";
import {
  hasMaskHandoff,
  isProtectedState,
  propagateTargetFrames,
  trackState,
} from "./trackState";

test("trackState maps the Source words; anything else reads empty", () => {
  expect(trackState("manual")).toBe("manual");
  expect(trackState("refined")).toBe("refined");
  expect(trackState("propagated")).toBe("propagated");
  expect(trackState(undefined)).toBe("empty");
  expect(trackState(null)).toBe("empty");
  expect(trackState("")).toBe("empty");
  expect(trackState("accepted")).toBe("empty");
});

test("Protected is manual or refined", () => {
  expect(isProtectedState("manual")).toBe(true);
  expect(isProtectedState("refined")).toBe(true);
  expect(isProtectedState("propagated")).toBe(false);
  expect(isProtectedState("empty")).toBe(false);
});

test("mask_handoff provenance drives the handoff tag", () => {
  expect(hasMaskHandoff({ mask_handoff: true })).toBe(true);
  expect(hasMaskHandoff({ mask_handoff: false })).toBe(false);
  expect(hasMaskHandoff({})).toBe(false);
  expect(hasMaskHandoff(null)).toBe(false);
  expect(hasMaskHandoff(undefined)).toBe(false);
});

test("propagateTargetFrames mirrors the server plan: seed excluded, both directions, max frames", () => {
  expect(propagateTargetFrames({ start: 0, direction: "forward", maxFrames: null }, 4)).toEqual(
    new Set([1, 2, 3]),
  );
  expect(propagateTargetFrames({ start: 2, direction: "backward", maxFrames: null }, 4)).toEqual(
    new Set([1, 0]),
  );
  expect(propagateTargetFrames({ start: 1, direction: "both", maxFrames: 2 }, 10)).toEqual(
    new Set([2, 3, 0]),
  );
  expect(propagateTargetFrames({ start: 3, direction: "forward", maxFrames: 0 }, 4)).toEqual(
    new Set(),
  );
  expect(propagateTargetFrames({ start: 0, direction: "forward", maxFrames: 5 }, 3)).toEqual(
    new Set([1, 2]),
  );
});
