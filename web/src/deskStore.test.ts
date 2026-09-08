import { beforeEach, expect, test } from "vitest";
import {
  DEFAULT_DESK_LAYOUT,
  DESK_LAYOUT_STORAGE_KEY,
  LANE_VISIBILITY_STORAGE_KEY,
  laneIsVisible,
  laneVisibilityKey,
  normalizeLaneVisibility,
  normalizeDeskLayout,
  useDeskStore,
} from "./deskStore";

beforeEach(() => {
  useDeskStore.setState({
    clipId: null,
    frameIndex: 0,
    frameCount: 0,
    frameIndexes: {},
    layout: { ...DEFAULT_DESK_LAYOUT, editorOrder: [...DEFAULT_DESK_LAYOUT.editorOrder] },
    spanStart: null,
    brush: { class: [], triplet: [], phase: null },
    laneVisibility: {},
  });
});

test("layout values clamp and invalid editor order falls back", () => {
  expect(normalizeDeskLayout({
    clipRailWidth: 1,
    editorRailWidth: 9999,
    bottomBarHeight: -10,
    editorOrder: ["phase", "phase", "unknown"],
  })).toEqual({
    clipRailWidth: 176,
    editorRailWidth: 420,
    bottomBarHeight: 48,
    editorOrder: ["class", "triplet", "phase"],
  });
});

test("new sitting stores editor rail at 280 under a new layout key", () => {
  expect(DEFAULT_DESK_LAYOUT.editorRailWidth).toBe(280);
  expect(normalizeDeskLayout(null).editorRailWidth).toBe(280);
  expect(normalizeDeskLayout({ editorRailWidth: 200 }).editorRailWidth).toBe(220);
  expect(DESK_LAYOUT_STORAGE_KEY).not.toBe("endo_label:desk-layout");
});

test("opening a clip starts at Frame 0", () => {
  useDeskStore.getState().openClip("CLIPA", 4);
  const s = useDeskStore.getState();
  expect(s.clipId).toBe("CLIPA");
  expect(s.frameCount).toBe(4);
  expect(s.frameIndex).toBe(0);
});

test("scrub sets the current Frame index", () => {
  useDeskStore.getState().openClip("CLIPA", 4);
  useDeskStore.getState().scrub(2);
  expect(useDeskStore.getState().frameIndex).toBe(2);
});

test("scrub clamps to 0..N-1", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().scrub(9);
  expect(useDeskStore.getState().frameIndex).toBe(2);
  useDeskStore.getState().scrub(-4);
  expect(useDeskStore.getState().frameIndex).toBe(0);
});

test("scrub does not change the Clip", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().scrub(1);
  expect(useDeskStore.getState().clipId).toBe("CLIPA");
});

test("opening another clip resets to Frame 0", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().scrub(2);
  useDeskStore.getState().openClip("CLIPB", 8);
  const s = useDeskStore.getState();
  expect(s.clipId).toBe("CLIPB");
  expect(s.frameIndex).toBe(0);
  expect(s.frameCount).toBe(8);
});

test("opening a previously visited Clip restores its Frame", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().scrub(2);
  useDeskStore.getState().openClip("CLIPB", 8);
  useDeskStore.getState().openClip("CLIPA", 3);
  expect(useDeskStore.getState().frameIndex).toBe(2);
});

test("opening the same clip again keeps the current Frame", () => {
  useDeskStore.getState().openClip("CLIPA", 4);
  useDeskStore.getState().scrub(2);
  useDeskStore.getState().openClip("CLIPA", 4);
  expect(useDeskStore.getState().frameIndex).toBe(2);
});

test("opening another clip clears span start", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().setSpanStart({ clipId: "CLIPA", frameIndex: 0 });
  useDeskStore.getState().openClip("CLIPB", 8);
  expect(useDeskStore.getState().spanStart).toBeNull();
});

test("Brush membership toggle arms then disarms the focused kind", () => {
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  expect(useDeskStore.getState().brush.class).toEqual(["grasper"]);
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  expect(useDeskStore.getState().brush.class).toEqual([]);
});

test("opening another clip keeps Brush and clears Mark from", () => {
  useDeskStore.getState().openClip("CLIPA", 3);
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  useDeskStore.getState().setSpanStart({ clipId: "CLIPA", frameIndex: 0 });
  useDeskStore.getState().openClip("CLIPB", 8);
  const s = useDeskStore.getState();
  expect(s.brush.class).toEqual(["grasper"]);
  expect(s.spanStart).toBeNull();
});

test("each Task type keeps its own Brush", () => {
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  useDeskStore.getState().toggleBrush({ kind: "phase", name: "dissection" });
  const s = useDeskStore.getState();
  expect(s.brush.class).toEqual(["grasper"]);
  expect(s.brush.phase).toBe("dissection");
});

test("class Brush can hold a second tag; toggling it again drops only that tag", () => {
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  useDeskStore.getState().toggleBrush({ kind: "class", name: "blurred" });
  expect(useDeskStore.getState().brush.class).toEqual(["grasper", "blurred"]);
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  expect(useDeskStore.getState().brush.class).toEqual(["blurred"]);
});

test("picking a second phase into the Brush replaces the first", () => {
  useDeskStore.getState().toggleBrush({ kind: "phase", name: "dissection" });
  useDeskStore.getState().toggleBrush({ kind: "phase", name: "clipping" });
  expect(useDeskStore.getState().brush.phase).toBe("clipping");
});

test("visibility key is Task type + identity", () => {
  expect(laneVisibilityKey("class", "grasper")).toBe("class:grasper");
  expect(laneVisibilityKey("phase", "dissection")).toBe("phase:dissection");
  expect(laneVisibilityKey("triplet", "grasper / pull / tissue")).toBe(
    "triplet:grasper / pull / tissue",
  );
  expect(LANE_VISIBILITY_STORAGE_KEY).not.toBe(DESK_LAYOUT_STORAGE_KEY);
});

test("missing key: present-on-Clip identity is visible, unused identity is hidden", () => {
  expect(laneIsVisible({}, "class:grasper", true)).toBe(true);
  expect(laneIsVisible({}, "class:blurred", false)).toBe(false);
});

test("stored hide wins over present-on-Clip; stored show wins over unused", () => {
  const stored = normalizeLaneVisibility({
    "class:grasper": false,
    "class:blurred": true,
    junk: "not-a-boolean",
  });
  expect(stored).toEqual({ "class:grasper": false, "class:blurred": true });
  expect(laneIsVisible(stored, "class:grasper", true)).toBe(false);
  expect(laneIsVisible(stored, "class:blurred", false)).toBe(true);
});

test("normalizeLaneVisibility rejects non-object input", () => {
  expect(normalizeLaneVisibility(null)).toEqual({});
  expect(normalizeLaneVisibility("class:grasper")).toEqual({});
  expect(normalizeLaneVisibility({ "phase:cut": 1 })).toEqual({});
});

test("setLaneVisible stores the eye choice without touching other keys", () => {
  useDeskStore.getState().setLaneVisible("class:grasper", false);
  useDeskStore.getState().setLaneVisible("class:blurred", true);
  expect(useDeskStore.getState().laneVisibility).toEqual({
    "class:grasper": false,
    "class:blurred": true,
  });
});

const vocabResponse = { phases: [], class_tags: [], triples: [] };

function armAllKinds() {
  useDeskStore.getState().toggleBrush({ kind: "class", name: "grasper" });
  useDeskStore.getState().toggleBrush({ kind: "class", name: "blurred" });
  useDeskStore.getState().toggleBrush({ kind: "phase", name: "dissection" });
  useDeskStore.getState().toggleBrush({ kind: "triplet", instrument: "grasper", verb: "pull", target: "tissue" });
  useDeskStore.getState().toggleBrush({ kind: "triplet", instrument: "scissors", verb: "cut", target: "duct" });
}

test("trashing a class tag drops it from the class Brush; other kinds stay", async () => {
  armAllKinds();
  const next = await useDeskStore.getState().trashBrush(
    { kind: "class", name: "grasper" },
    Promise.resolve(vocabResponse),
  );
  expect(next).toEqual(vocabResponse);
  const s = useDeskStore.getState();
  expect(s.brush.class).toEqual(["blurred"]);
  expect(s.brush.phase).toBe("dissection");
  expect(s.brush.triplet).toEqual([
    { instrument: "grasper", verb: "pull", target: "tissue" },
    { instrument: "scissors", verb: "cut", target: "duct" },
  ]);
});

test("trashing a phase drops it from the phase Brush; other kinds stay", async () => {
  armAllKinds();
  await useDeskStore.getState().trashBrush(
    { kind: "phase", name: "dissection" },
    Promise.resolve(vocabResponse),
  );
  const s = useDeskStore.getState();
  expect(s.brush.phase).toBeNull();
  expect(s.brush.class).toEqual(["grasper", "blurred"]);
  expect(s.brush.triplet).toEqual([
    { instrument: "grasper", verb: "pull", target: "tissue" },
    { instrument: "scissors", verb: "cut", target: "duct" },
  ]);
});

test("trashing an exact triple drops that triple from the triplet Brush; other kinds and rows stay", async () => {
  armAllKinds();
  await useDeskStore.getState().trashBrush(
    { kind: "triplet", instrument: "grasper", verb: "pull", target: "tissue" },
    Promise.resolve(vocabResponse),
  );
  const s = useDeskStore.getState();
  expect(s.brush.triplet).toEqual([{ instrument: "scissors", verb: "cut", target: "duct" }]);
  expect(s.brush.class).toEqual(["grasper", "blurred"]);
  expect(s.brush.phase).toBe("dissection");
});

test("trashing a Vocab name that is not in the Brush leaves every kind untouched", async () => {
  armAllKinds();
  await useDeskStore.getState().trashBrush({ kind: "class", name: "unused" }, Promise.resolve(vocabResponse));
  await useDeskStore.getState().trashBrush({ kind: "phase", name: "unused" }, Promise.resolve(vocabResponse));
  await useDeskStore.getState().trashBrush(
    { kind: "triplet", instrument: "irrigator", verb: "wash", target: "field" },
    Promise.resolve(vocabResponse),
  );
  const s = useDeskStore.getState();
  expect(s.brush.class).toEqual(["grasper", "blurred"]);
  expect(s.brush.phase).toBe("dissection");
  expect(s.brush.triplet).toEqual([
    { instrument: "grasper", verb: "pull", target: "tissue" },
    { instrument: "scissors", verb: "cut", target: "duct" },
  ]);
});

test("trash leaves the Lane-visibility store alone", async () => {
  armAllKinds();
  useDeskStore.setState({ laneVisibility: { "class:grasper": false, "phase:dissection": true } });
  await useDeskStore.getState().trashBrush({ kind: "class", name: "grasper" }, Promise.resolve(vocabResponse));
  await useDeskStore.getState().trashBrush({ kind: "phase", name: "dissection" }, Promise.resolve(vocabResponse));
  expect(useDeskStore.getState().laneVisibility).toEqual({
    "class:grasper": false,
    "phase:dissection": true,
  });
});

test("a failed trash request keeps the Brush exactly as it was", async () => {
  armAllKinds();
  const store = useDeskStore.getState();
  await expect(
    store.trashBrush({ kind: "class", name: "grasper" }, Promise.reject(new Error("HTTP 500"))),
  ).rejects.toThrow("HTTP 500");
  await expect(
    store.trashBrush({ kind: "phase", name: "dissection" }, Promise.reject(new Error("HTTP 500"))),
  ).rejects.toThrow("HTTP 500");
  await expect(
    store.trashBrush(
      { kind: "triplet", instrument: "grasper", verb: "pull", target: "tissue" },
      Promise.reject(new Error("HTTP 500")),
    ),
  ).rejects.toThrow("HTTP 500");
  const s = useDeskStore.getState();
  expect(s.brush.class).toEqual(["grasper", "blurred"]);
  expect(s.brush.phase).toBe("dissection");
  expect(s.brush.triplet).toEqual([
    { instrument: "grasper", verb: "pull", target: "tissue" },
    { instrument: "scissors", verb: "cut", target: "duct" },
  ]);
});
