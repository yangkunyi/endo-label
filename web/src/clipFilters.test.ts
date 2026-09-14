import { expect, test } from "vitest";
import { clipsPath } from "./api";
import {
  CLIP_FILTERS_STORAGE_KEY,
  DEFAULT_CLIP_FILTERS,
  emptyClipsNotice,
  normalizeClipFilters,
  readStoredClipFilters,
  saveStoredClipFilters,
} from "./clipFilters";

/** A stand-in for the browser's localStorage: one map, no DOM needed. */
function fakeStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

test("no stored selection is the default: everything, no filters, mine", () => {
  expect(readStoredClipFilters(fakeStorage())).toEqual(DEFAULT_CLIP_FILTERS);
  expect(DEFAULT_CLIP_FILTERS.scope).toBe("mine");
});

test("a stored selection round-trips through storage", () => {
  const storage = fakeStorage();
  saveStoredClipFilters({ project: "West Study", tag: "west", scope: "all" }, storage);
  expect(storage.entries.get(CLIP_FILTERS_STORAGE_KEY)).toBe(
    '{"project":"West Study","tag":"west","scope":"all"}',
  );
  expect(readStoredClipFilters(storage)).toEqual({
    project: "West Study",
    tag: "west",
    scope: "all",
  });
});

test("a foreign or hand-edited entry falls back to the default field by field", () => {
  expect(normalizeClipFilters(null)).toEqual(DEFAULT_CLIP_FILTERS);
  expect(normalizeClipFilters("mine")).toEqual(DEFAULT_CLIP_FILTERS);
  expect(normalizeClipFilters({ project: 3, tag: ["west"], scope: "every" })).toEqual(
    DEFAULT_CLIP_FILTERS,
  );
  expect(normalizeClipFilters({ project: "West Study" })).toEqual({
    project: "West Study",
    tag: "",
    scope: "mine",
  });
});

test("a broken stored value is not fatal, and no storage is no filters", () => {
  expect(
    readStoredClipFilters(fakeStorage({ [CLIP_FILTERS_STORAGE_KEY]: "{not json" })),
  ).toEqual(DEFAULT_CLIP_FILTERS);
  expect(readStoredClipFilters(null)).toEqual(DEFAULT_CLIP_FILTERS);
});

test("an unfiltered selection asks for mine, and empty filters stay out of the URL", () => {
  expect(clipsPath(DEFAULT_CLIP_FILTERS)).toBe("/api/clips?scope=mine");
  expect(clipsPath({ project: "West Study", tag: "west", scope: "all" })).toBe(
    "/api/clips?project=West+Study&tag=west&scope=all",
  );
  expect(clipsPath({ project: "", tag: "", scope: "mine" })).toBe("/api/clips?scope=mine");
});

test("the empty-list sentence names whose Clips are missing", () => {
  expect(emptyClipsNotice("mine")).toBe("No Clips assigned to you.");
  expect(emptyClipsNotice("all")).toBe("No Clips on the allowlist.");
});
