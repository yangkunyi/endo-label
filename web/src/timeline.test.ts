import { expect, test } from "vitest";
import { foldClass, foldPhase, foldTriplet, frameFromClientX, labelColor } from "./timeline";

test("phase folds one lane per phase name", () => {
  expect(foldPhase(4, { "0": "Calot", "1": "Calot", "3": "Pack" })).toEqual([
    {
      key: "Calot",
      segs: [
        { start: 0, end: 1, label: "Calot" },
        { start: 2, end: 3, label: null },
      ],
    },
    {
      key: "Pack",
      segs: [
        { start: 0, end: 2, label: null },
        { start: 3, end: 3, label: "Pack" },
      ],
    },
  ]);
});

test("class folds each flag that appears", () => {
  const lanes = foldClass(3, { "0": ["blurred", "hook"], "2": ["blurred"] });
  expect(lanes.map((lane) => lane.key)).toEqual(["blurred", "hook"]);
  expect(lanes[0].segs.filter((seg) => seg.label)).toEqual([
    { start: 0, end: 0, label: "blurred" },
    { start: 2, end: 2, label: "blurred" },
  ]);
  expect(lanes[1].segs.filter((seg) => seg.label)).toEqual([
    { start: 0, end: 0, label: "hook" },
  ]);
});

test("triplet folds each exact triple", () => {
  const lanes = foldTriplet(2, {
    "0": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
    "1": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
  });
  expect(lanes).toEqual([
    {
      key: "grasper / retract / gallbladder",
      segs: [{ start: 0, end: 1, label: "grasper / retract / gallbladder" }],
    },
  ]);
});

test("labelColor is stable, distinct, and desaturated for dark surfaces", () => {
  expect(labelColor("Calot")).toBe(labelColor("Calot"));
  expect(labelColor("Calot")).not.toBe(labelColor("Pack"));
  expect(labelColor("blurred")).not.toBe(labelColor("grasper"));
  for (const identity of ["Calot", "blurred", "grasper / retract / gallbladder"]) {
    expect(labelColor(identity)).toMatch(/^hsl\(\d+ 35% 55%\)$/);
  }
});

test("frameFromClientX maps the pointer onto inclusive 0..N-1", () => {
  expect(frameFromClientX(100, 100, 100, 4)).toBe(0);
  expect(frameFromClientX(124, 100, 100, 4)).toBe(0);
  expect(frameFromClientX(125, 100, 100, 4)).toBe(1);
  expect(frameFromClientX(199, 100, 100, 4)).toBe(3);
  expect(frameFromClientX(200, 100, 100, 4)).toBe(3);
  expect(frameFromClientX(50, 100, 100, 4)).toBe(0);
  expect(frameFromClientX(250, 100, 100, 4)).toBe(3);
});

test("frameFromClientX with no Frames is 0", () => {
  expect(frameFromClientX(150, 100, 100, 0)).toBe(0);
});

