import { expect, test } from "vitest";
import { clipsPath } from "./api";
import {
  CLIP_FILTERS_STORAGE_KEY,
  DEFAULT_CLIP_FILTERS,
  chooseClipFilters,
  emptyClipsNotice,
  normalizeClipFilters,
  readStoredClipFilters,
  resolveClipFilters,
  saveStoredClipFilters,
  scopeForCaller,
  type ClipFilterSelection,
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

const WEST_ALL: ClipFilterSelection = { project: "West Study", tag: "west", scope: "all" };

test("only an admin holds all, and a caller not yet known does not", () => {
  expect(scopeForCaller("all", true)).toBe("all");
  expect(scopeForCaller("all", false)).toBe("mine");
  expect(scopeForCaller("all", null)).toBe("mine");
  expect(scopeForCaller("mine", false)).toBe("mine");
});

test("a scope the server would refuse this caller is read as mine, and named", () => {
  const refused = resolveClipFilters(WEST_ALL, { isAdmin: false }, {});
  expect(refused.filters).toEqual({ project: "West Study", tag: "west", scope: "mine" });
  expect(refused.corrected).toBe(true);
  expect(refused.notice).toContain("showing your own Clips");

  // The admin's own scope is theirs: nothing is read past it and nothing is said.
  const admin = resolveClipFilters(WEST_ALL, { isAdmin: true }, {});
  expect(admin.filters).toEqual(WEST_ALL);
  expect(admin.corrected).toBe(false);
  expect(admin.notice).toBeNull();
});

test("a caller not yet known is narrowed for the request but corrects nothing", () => {
  // /api/me is still in flight: an admin's stored all is not the browser's to
  // lose before the flag is known, so the narrow request is made silently.
  const unknown = resolveClipFilters(WEST_ALL, { isAdmin: null }, {});
  expect(unknown.filters.scope).toBe("mine");
  expect(unknown.corrected).toBe(false);
  expect(unknown.notice).toBeNull();

  // The same holds field by field for a Project or tag a loaded list does not
  // carry: the request leaves it out — never ask for what cannot be proved —
  // while nothing is corrected, named or written back. The stored value is found
  // dead again once the flag answers.
  const deadValues = resolveClipFilters(
    WEST_ALL,
    { isAdmin: null },
    { projects: ["East Study"], tags: ["chole"] },
  );
  expect(deadValues.filters).toEqual({ project: "", tag: "", scope: "mine" });
  expect(deadValues.corrected).toBe(false);
  expect(deadValues.notice).toBeNull();
});

test("a Project or tag no option list carries any more is dropped and named", () => {
  const dropped = resolveClipFilters(
    WEST_ALL,
    { isAdmin: true },
    { projects: ["East Study"], tags: ["chole"] },
  );
  expect(dropped.filters).toEqual({ project: "", tag: "", scope: "all" });
  expect(dropped.corrected).toBe(true);
  expect(dropped.notice).toContain('The stored Project "West Study"');
  expect(dropped.notice).toContain('The stored tag "west"');

  // A list not loaded yet cannot call a value dead: the filter still holds.
  const unloaded = resolveClipFilters(WEST_ALL, { isAdmin: true }, {});
  expect(unloaded.filters).toEqual(WEST_ALL);
  expect(unloaded.corrected).toBe(false);
  expect(unloaded.notice).toBeNull();

  // A loaded list that does carry the values keeps them.
  const carried = resolveClipFilters(
    WEST_ALL,
    { isAdmin: true },
    { projects: ["West Study"], tags: ["west"] },
  );
  expect(carried).toEqual({ filters: WEST_ALL, notice: null, corrected: false });
});

test("an empty option list is a loaded one: any filter value is dead", () => {
  const dropped = resolveClipFilters(
    { project: "West Study", tag: "", scope: "mine" },
    { isAdmin: false },
    { projects: [], tags: [] },
  );
  expect(dropped.filters.project).toBe("");
  expect(dropped.corrected).toBe(true);

  // No filter is not a filter: an empty value survives every list.
  const none = resolveClipFilters(
    DEFAULT_CLIP_FILTERS,
    { isAdmin: false },
    { projects: [], tags: [] },
  );
  expect(none).toEqual({ filters: DEFAULT_CLIP_FILTERS, notice: null, corrected: false });
});

test("the corrected selection is the one a later read gets", () => {
  const storage = fakeStorage({
    [CLIP_FILTERS_STORAGE_KEY]: JSON.stringify(WEST_ALL),
  });
  const first = resolveClipFilters(readStoredClipFilters(storage), { isAdmin: false }, {});
  expect(first.corrected).toBe(true);
  // The stored value is named once, to the read that finds it stale.
  expect(first.notice).toContain("showing your own Clips");
  saveStoredClipFilters(first.filters, storage);

  // The corrected entry lists Clips for the next reader too, and for the
  // corrected value there is nothing left to say: the sentence does not return.
  const next = resolveClipFilters(readStoredClipFilters(storage), { isAdmin: false }, {});
  expect(next.filters).toEqual({ project: "West Study", tag: "west", scope: "mine" });
  expect(next.corrected).toBe(false);
  expect(next.notice).toBeNull();
  expect(clipsPath(next.filters)).toBe("/api/clips?project=West+Study&tag=west&scope=mine");
});

test("a choice is a patch of the corrected selection, so a dropped value cannot come back", () => {
  const storage = fakeStorage({
    [CLIP_FILTERS_STORAGE_KEY]: JSON.stringify(WEST_ALL),
  });
  const caller = { isAdmin: false };
  const options = { projects: ["West Study"], tags: ["west", "east"] };

  // One source of truth: the corrected selection is what the state holds and
  // what the entry gets, so the reader is no longer looking at `scope: "all"`.
  const shown = resolveClipFilters(readStoredClipFilters(storage), caller, options).filters;
  saveStoredClipFilters(shown, storage);
  expect(shown).toEqual({ project: "West Study", tag: "west", scope: "mine" });

  // Picking a tag changes one field of that selection. The scope the correction
  // dropped is not in hand, so it is not written back to the browser's entry.
  const chosen = chooseClipFilters(shown, { tag: "east" });
  saveStoredClipFilters(chosen, storage);
  expect(readStoredClipFilters(storage)).toEqual({
    project: "West Study",
    tag: "east",
    scope: "mine",
  });
  // Where a patch of the stored value — the resurrection this replaces — writes
  // the refused scope straight back into the entry.
  expect(chooseClipFilters(WEST_ALL, { tag: "east" })).toEqual({
    project: "West Study",
    tag: "east",
    scope: "all",
  });

  // And the next read of what was stored has nothing left to correct.
  expect(resolveClipFilters(readStoredClipFilters(storage), caller, options)).toEqual({
    filters: { project: "West Study", tag: "east", scope: "mine" },
    notice: null,
    corrected: false,
  });
});
