import { expect, test } from "vitest";
import {
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  errorDetail,
  frameClassTags,
  frameJpegPath,
  framePhaseName,
  frameTripletRows,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  toggleClassTag,
  tripletClipPath,
  tripletFramePath,
  tripletRowPath,
  tripletSpanPath,
  vocabListPath,
  vocabRenamePath,
} from "./api";

test("clip desk path is /clips/:clipId", () => {
  expect(clipDeskPath("CLIPA")).toBe("/clips/CLIPA");
  expect(clipDeskPath("CASE001_step06_clip002")).toBe(
    "/clips/CASE001_step06_clip002",
  );
});

test("frame JPEG path is catalog Frame URL", () => {
  expect(frameJpegPath("CLIPA", 0)).toBe("/api/clips/CLIPA/frames/0");
  expect(frameJpegPath("CLIPA", 3)).toBe("/api/clips/CLIPA/frames/3");
});

test("error detail uses FastAPI detail string", () => {
  expect(errorDetail({ detail: "Clip not found: NOPE" }, "fallback")).toBe(
    "Clip not found: NOPE",
  );
  expect(errorDetail(null, "Clip not found")).toBe("Clip not found");
  expect(errorDetail({}, "Clip not found")).toBe("Clip not found");
});

test("phase and vocab paths match compose HTTP", () => {
  expect(phaseClipPath("CLIPA")).toBe("/api/phase/CLIPA");
  expect(phaseSpanPath("CLIPA")).toBe("/api/phase/CLIPA/span");
  expect(phaseFramePath("CLIPA", 0)).toBe("/api/phase/CLIPA/frames/0");
  expect(vocabListPath("phases")).toBe("/api/vocab/phases");
  expect(vocabRenamePath("phases")).toBe("/api/vocab/phases/rename");
  expect(vocabRenamePath("class_tags")).toBe("/api/vocab/class_tags/rename");
});

test("missing Frame phase is unlabeled", () => {
  expect(framePhaseName({}, 0)).toBeNull();
  expect(framePhaseName({ "1": "Preparation" }, 0)).toBeNull();
});

test("labeled Frame phase is the exclusive name", () => {
  expect(
    framePhaseName({ "0": "Preparation", "1": "Clipping and cutting" }, 1),
  ).toBe("Clipping and cutting");
});

test("class paths match compose HTTP", () => {
  expect(classClipPath("CLIPA")).toBe("/api/class/CLIPA");
  expect(classFramePath("CLIPA", 0)).toBe("/api/class/CLIPA/frames/0");
  expect(classSpanPath("CLIPA")).toBe("/api/class/CLIPA/span");
  expect(vocabListPath("class_tags")).toBe("/api/vocab/class_tags");
});

test("missing Frame class is unlabeled", () => {
  expect(frameClassTags({}, 0)).toEqual([]);
  expect(frameClassTags({ "1": ["grasper"] }, 0)).toEqual([]);
});

test("toggle class tag turns a name on then off", () => {
  expect(toggleClassTag([], "grasper")).toEqual(["grasper"]);
  expect(toggleClassTag(["grasper"], "blurred")).toEqual(["grasper", "blurred"]);
  expect(toggleClassTag(["grasper", "blurred"], "grasper")).toEqual(["blurred"]);
  expect(toggleClassTag(["blurred"], "blurred")).toEqual([]);
});

test("toggle class tag does not duplicate a name", () => {
  expect(toggleClassTag(["grasper"], "grasper")).toEqual([]);
  expect(toggleClassTag(["grasper", "blurred"], "blurred")).toEqual(["grasper"]);
});

test("triplet paths match compose HTTP", () => {
  expect(tripletClipPath("CLIPA")).toBe("/api/triplet/CLIPA");
  expect(tripletFramePath("CLIPA", 0)).toBe("/api/triplet/CLIPA/frames/0");
  expect(tripletSpanPath("CLIPA")).toBe("/api/triplet/CLIPA/span");
  expect(tripletRowPath("CLIPA", 0, 2)).toBe("/api/triplet/CLIPA/frames/0/2");
  expect(vocabListPath("instruments")).toBe("/api/vocab/instruments");
  expect(vocabListPath("verbs")).toBe("/api/vocab/verbs");
  expect(vocabListPath("targets")).toBe("/api/vocab/targets");
});

test("missing Frame triplet is unlabeled", () => {
  expect(frameTripletRows({}, 0)).toEqual([]);
  expect(
    frameTripletRows(
      {
        "1": [
          {
            id: 1,
            instrument: "grasper",
            verb: "retract",
            target: "gallbladder",
          },
        ],
      },
      0,
    ),
  ).toEqual([]);
});

test("labeled Frame triplet lists rows on that Frame", () => {
  expect(
    frameTripletRows(
      {
        "0": [
          {
            id: 1,
            instrument: "grasper",
            verb: "retract",
            target: "gallbladder",
          },
          {
            id: 2,
            instrument: "grasper",
            verb: "retract",
            target: "gallbladder",
          },
        ],
      },
      0,
    ),
  ).toEqual([
    {
      id: 1,
      instrument: "grasper",
      verb: "retract",
      target: "gallbladder",
    },
    {
      id: 2,
      instrument: "grasper",
      verb: "retract",
      target: "gallbladder",
    },
  ]);
});
