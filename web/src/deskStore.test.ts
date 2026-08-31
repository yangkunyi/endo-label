import { beforeEach, expect, test } from "vitest";
import {
  DEFAULT_DESK_LAYOUT,
  DESK_LAYOUT_STORAGE_KEY,
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
    paintChip: null,
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
