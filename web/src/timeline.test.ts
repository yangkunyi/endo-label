import { expect, test } from "vitest";
import { foldClass, foldPhase, foldTriplet } from "./timeline";

test("phase folds consecutive names and unlabeled gaps", () => {
  expect(foldPhase(4, { "0": "Calot", "1": "Calot", "3": "Pack" })).toEqual([
    {
      key: "phase",
      segs: [
        { start: 0, end: 1, label: "Calot" },
        { start: 2, end: 2, label: null },
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
