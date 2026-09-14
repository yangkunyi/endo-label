import { expect, test } from "vitest";
import {
  coverageSummary,
  everyFrameLabeledNotice,
  foldClass,
  foldCoverage,
  foldCovered,
  foldPhase,
  foldTriplet,
  frameFromClientX,
  labelColor,
  nextUnlabeledFrame,
  submitGapNotice,
  taskColor,
  type FrameCoverage,
} from "./timeline";

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

test("foldCovered folds maximal runs of covered and Unlabeled Frames", () => {
  const covered: number[] = [0, 1, 4];
  expect(foldCovered(6, (index) => covered.includes(index))).toEqual([
    { start: 0, end: 1, covered: true },
    { start: 2, end: 3, covered: false },
    { start: 4, end: 4, covered: true },
    { start: 5, end: 5, covered: false },
  ]);
  // A covered tail closes the last run instead of leaving it open.
  expect(foldCovered(3, (index) => index < 2)).toEqual([
    { start: 0, end: 1, covered: true },
    { start: 2, end: 2, covered: false },
  ]);
  expect(foldCovered(0, () => true)).toEqual([]);
});

test("no labels of the asked type at all is one gap, not an error", () => {
  const coverage = foldCoverage({
    task: "class",
    frameCount: 4,
    phaseFrames: {},
    classFrames: {},
    tripletFrames: {},
  });
  expect(coverage.segs).toEqual([{ start: 0, end: 3, covered: false }]);
  expect(coverage).toMatchObject({ task: "class", covered: 0, unlabeled: 4, total: 4 });
  expect(coverageSummary(coverage)).toBe("Coverage: class, 0 of 4 frames labeled");
});

test("coverage is per Task type, read off the same frame maps the Lanes fold", () => {
  const phaseFrames = { "0": "Calot", "1": "Calot" };
  const classFrames = { "1": ["blurred"], "3": ["hook", "blurred"] };
  const tripletFrames = { "0": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }] };
  const args = { frameCount: 4, phaseFrames, classFrames, tripletFrames };

  const phase = foldCoverage({ task: "phase", ...args });
  expect(phase.segs).toEqual([
    { start: 0, end: 1, covered: true },
    { start: 2, end: 3, covered: false },
  ]);
  expect(coverageSummary(phase)).toBe("Coverage: phase, 2 of 4 frames labeled");

  const klass = foldCoverage({ task: "class", ...args });
  expect(klass.segs).toEqual([
    { start: 0, end: 0, covered: false },
    { start: 1, end: 1, covered: true },
    { start: 2, end: 2, covered: false },
    { start: 3, end: 3, covered: true },
  ]);
  expect(klass).toMatchObject({ covered: 2, unlabeled: 2, total: 4 });

  const triplet = foldCoverage({ task: "triplet", ...args });
  expect(triplet.segs).toEqual([
    { start: 0, end: 0, covered: true },
    { start: 1, end: 3, covered: false },
  ]);
  expect(triplet).toMatchObject({ covered: 1, unlabeled: 3, total: 4 });
});

// A Frame counts only for entries that hold an identity: an empty list, an empty
// tag, a blank phase or an all-blank triplet row is not a label (ADR 0029 keeps no
// "looked at" bit).
test("empty entries do not count as covered", () => {
  const coverage = foldCoverage({
    task: "class",
    frameCount: 3,
    phaseFrames: { "0": "" },
    classFrames: { "0": [], "1": [""], "2": ["blurred"] },
    tripletFrames: {},
  });
  expect(coverage.segs).toEqual([
    { start: 0, end: 1, covered: false },
    { start: 2, end: 2, covered: true },
  ]);

  const triplet = foldCoverage({
    task: "triplet",
    frameCount: 3,
    phaseFrames: {},
    classFrames: {},
    tripletFrames: {
      "0": [],
      "1": [{ instrument: "", verb: "", target: "" }],
      "2": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
    },
  });
  expect(triplet.segs).toEqual([
    { start: 0, end: 1, covered: false },
    { start: 2, end: 2, covered: true },
  ]);
});

test("passing the Frames beyond the Clip does not extend coverage", () => {
  const coverage = foldCoverage({
    task: "phase",
    frameCount: 2,
    phaseFrames: { "0": "Calot", "1": "Calot", "2": "Pack" },
    classFrames: {},
    tripletFrames: {},
  });
  expect(coverage.segs).toEqual([{ start: 0, end: 1, covered: true }]);
  expect(coverage).toMatchObject({ covered: 2, unlabeled: 0, total: 2 });
});

test("taskColor is per Task type, distinct, and desaturated for dark surfaces", () => {
  const colors = [taskColor("class"), taskColor("phase"), taskColor("triplet")];
  expect(new Set(colors).size).toBe(3);
  expect(taskColor("class")).toBe(taskColor("class"));
  for (const color of colors) {
    expect(color).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  }
});

/** `n`'s map: 6 Frames, class on 0-1 and 4, so the gaps are 2-3 and 5. */
function gapCoverage(overrides: Partial<FrameCoverage> = {}): FrameCoverage {
  return {
    task: "class",
    segs: [
      { start: 0, end: 1, covered: true },
      { start: 2, end: 3, covered: false },
      { start: 4, end: 4, covered: true },
      { start: 5, end: 5, covered: false },
    ],
    covered: 3,
    unlabeled: 3,
    total: 6,
    ...overrides,
  };
}

test("the next unlabeled Frame is the first gap ahead of the Playhead", () => {
  const coverage = gapCoverage();
  expect(nextUnlabeledFrame(coverage, 0)).toBe(2);
  expect(nextUnlabeledFrame(coverage, 1)).toBe(2);
  // Standing inside a gap, the walk moves on rather than staying put.
  expect(nextUnlabeledFrame(coverage, 2)).toBe(3);
  expect(nextUnlabeledFrame(coverage, 3)).toBe(5);
  expect(nextUnlabeledFrame(coverage, 4)).toBe(5);
});

test("the next unlabeled Frame wraps once through the Clip", () => {
  expect(nextUnlabeledFrame(gapCoverage(), 5)).toBe(2);
  // A gap that lies entirely behind the Playhead is reached by the wrap, not
  // by a second search: 4 Frames, class on 2-3, so frames 0-1 are the only gap.
  const behind = foldCoverage({
    task: "class",
    frameCount: 4,
    phaseFrames: {},
    classFrames: { "2": ["blurred"], "3": ["blurred"] },
    tripletFrames: {},
  });
  expect(behind.segs).toEqual([
    { start: 0, end: 1, covered: false },
    { start: 2, end: 3, covered: true },
  ]);
  expect(nextUnlabeledFrame(behind, 2)).toBe(0);
  expect(nextUnlabeledFrame(behind, 3)).toBe(0);
});

test("a covered Clip has no next unlabeled Frame, and an empty one has none either", () => {
  const covered = foldCoverage({
    task: "phase",
    frameCount: 3,
    phaseFrames: { "0": "Calot", "1": "Calot", "2": "Pack" },
    classFrames: {},
    tripletFrames: {},
  });
  expect(covered.unlabeled).toBe(0);
  expect(nextUnlabeledFrame(covered, 0)).toBeNull();
  expect(nextUnlabeledFrame(covered, 2)).toBeNull();

  const emptyClip = foldCoverage({
    task: "class",
    frameCount: 0,
    phaseFrames: {},
    classFrames: {},
    tripletFrames: {},
  });
  expect(nextUnlabeledFrame(emptyClip, 0)).toBeNull();
});

test("the only unlabeled Frame left is found from either side of it", () => {
  const coverage = foldCoverage({
    task: "triplet",
    frameCount: 4,
    phaseFrames: {},
    classFrames: {},
    tripletFrames: {
      "0": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
      "2": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
      "3": [{ instrument: "grasper", verb: "retract", target: "gallbladder" }],
    },
  });
  expect(coverage).toMatchObject({ covered: 3, unlabeled: 1, total: 4 });
  expect(nextUnlabeledFrame(coverage, 0)).toBe(1);
  expect(nextUnlabeledFrame(coverage, 1)).toBe(1);
  expect(nextUnlabeledFrame(coverage, 3)).toBe(1);
});

test("the Submit hint names the gap count for the Task type being submitted", () => {
  const counts = { task: "class", unlabeled: 32, total: 120 };
  expect(submitGapNotice(counts)).toBe("Submitting with 32 of 120 frames unlabeled for class");
  expect(submitGapNotice({ ...counts, task: "triplet", unlabeled: 1 })).toBe(
    "Submitting with 1 of 120 frames unlabeled for triplet",
  );
  // A fully covered Clip has nothing to say, and nothing to refuse either.
  expect(submitGapNotice({ ...counts, unlabeled: 0 })).toBeNull();
  expect(submitGapNotice({ task: "mask", unlabeled: 0, total: 0 })).toBeNull();
});

test("the nothing-left notice names the Task type and never reads as an error", () => {
  expect(everyFrameLabeledNotice("class")).toBe("Every Frame has a class label");
  expect(everyFrameLabeledNotice("phase")).toBe("Every Frame has a phase label");
});
