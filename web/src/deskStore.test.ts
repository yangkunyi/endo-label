import { beforeEach, expect, test } from "vitest";
import { useDeskStore } from "./deskStore";

beforeEach(() => {
  useDeskStore.setState({ clipId: null, frameIndex: 0, frameCount: 0 });
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

test("opening the same clip again keeps the current Frame", () => {
  useDeskStore.getState().openClip("CLIPA", 4);
  useDeskStore.getState().scrub(2);
  useDeskStore.getState().openClip("CLIPA", 4);
  expect(useDeskStore.getState().frameIndex).toBe(2);
});
