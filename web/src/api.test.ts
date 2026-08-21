import { expect, test } from "vitest";
import {
  clipDeskPath,
  errorDetail,
  frameJpegPath,
  framePhaseName,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  vocabListPath,
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
