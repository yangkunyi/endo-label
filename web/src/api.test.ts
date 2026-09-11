import { expect, test } from "vitest";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  errorDetail,
  frameClassTags,
  clipMediaPath,
  frameJpegPath,
  framePhaseName,
  frameTripletRows,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  jobPath,
  sessionFrameMaskPath,
  sessionPath,
  sessionPointPath,
  sessionPredictPath,
  sessionPropagatePath,
  sessionTrackPath,
  toggleClassTag,
  tripletClipPath,
  tripletFramePath,
  tripletRowPath,
  tripletSpanPath,
  registryArchivePath,
  registryCandidatePath,
  registryCandidatesPath,
  registryDisablePath,
  registryEnablePath,
  registryLabel,
  registryPath,
  registryPromotePath,
  registryRenamePath,
  registryRestorePath,
  registryVisiblePath,
  vocabDeletePath,
  vocabListPath,
  vocabRenamePath,
  vocabTripleDeletePath,
  vocabTripleRenamePath,
  vocabTriplesPath,
} from "./api";

test("session and annotation paths match compose HTTP", () => {
  expect(sessionPath()).toBe("/api/session");
  expect(sessionPredictPath()).toBe("/api/session/predict");
  expect(sessionPath(0)).toBe("/api/session?frame_index=0");
  expect(sessionPath(undefined, "CLIPA")).toBe("/api/session?clip_id=CLIPA");
  expect(sessionPath(0, "CLIPA")).toBe(
    "/api/session?frame_index=0&clip_id=CLIPA",
  );
  expect(sessionPointPath(1, 0, 2)).toBe("/api/session/tracks/1/frames/0/points/2");
  expect(sessionPointPath(1, 0, 2, "CLIPA")).toBe(
    "/api/session/tracks/1/frames/0/points/2?clip_id=CLIPA",
  );
  expect(sessionFrameMaskPath(1, 0, "CLIPA")).toBe(
    "/api/session/tracks/1/frames/0?clip_id=CLIPA",
  );
  expect(sessionTrackPath(1, "CLIPA")).toBe(
    "/api/session/tracks/1?clip_id=CLIPA",
  );
  expect(sessionPropagatePath()).toBe("/api/session/propagate");
  expect(jobPath("job-9")).toBe("/api/jobs/job-9");
  expect(annotationSummaryPath("CLIPA")).toBe("/api/clips/CLIPA/annotations");
  expect(annotationFramePath("CLIPA", 0)).toBe("/api/clips/CLIPA/annotations/frames/0");
});

test("registry paths match compose HTTP", () => {
  expect(registryPath()).toBe("/api/registry");
  expect(registryVisiblePath(3)).toBe("/api/registry/visible?project_id=3");
  expect(registryRenamePath(1)).toBe("/api/registry/1/rename");
  expect(registryArchivePath(1)).toBe("/api/registry/1/archive");
  expect(registryRestorePath(1)).toBe("/api/registry/1/restore");
  expect(registryEnablePath(1)).toBe("/api/registry/1/enable");
  expect(registryDisablePath(1)).toBe("/api/registry/1/disable");
  expect(registryCandidatesPath()).toBe("/api/registry/candidates");
  expect(registryCandidatePath(8)).toBe("/api/registry/candidates/8");
  expect(registryPromotePath(8)).toBe("/api/registry/candidates/8/promote");
  expect(
    registryLabel({
      kind: "phase",
      name: "Prep",
      instrument: "",
      verb: "",
      target: "",
    }),
  ).toBe("Prep");
  expect(
    registryLabel({
      kind: "triplet",
      name: "",
      instrument: "grasper",
      verb: "retract",
      target: "gallbladder",
    }),
  ).toBe("grasper / retract / gallbladder");
});

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

test("video media path is catalog media URL", () => {
  expect(clipMediaPath("VID")).toBe("/api/clips/VID/media");
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
  expect(vocabDeletePath("phases", "Preparation")).toBe("/api/vocab/phases/Preparation");
  expect(vocabDeletePath("class_tags", "grasper")).toBe("/api/vocab/class_tags/grasper");
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
  expect(vocabTriplesPath()).toBe("/api/vocab/triples");
  expect(vocabTripleRenamePath()).toBe("/api/vocab/triples/rename");
  expect(vocabTripleDeletePath("grasper", "retract", "gallbladder")).toBe(
    "/api/vocab/triples?instrument=grasper&verb=retract&target=gallbladder",
  );
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
