/**
 * The stored Clips selection's decisions, pinned in-process: node, no DOM.
 *
 * `useClipFilters` cannot be rendered here — this suite has no jsdom, so no render
 * and no effect runs — so the hook's wiring (its `choose` call and the effect that
 * writes the browser's entry) is hand-verified. What is pinned below is every
 * decision that wiring is built from: `clipFiltersChange`, the pure step whose
 * answer is the next state *and* the entry to write, and `clipFiltersView`, the
 * read's correction. The step's `entry` is written here through a stand-in
 * storage, modelling the effect; the effect itself is the part no node test can
 * run.
 *
 * One pin reads `useClipFilters.ts`'s source instead: the seam between the hook
 * and the step is a call, not a value, and nothing else here can see it. It fails
 * if `choose` goes back to a fold that drops the write — the regression that hid
 * behind 206 green tests before this ticket — and if the effect that writes the
 * entry loses the key that makes it run. What is still hand-verified is named
 * in the hook's header and in
 * `.scratch/pilot-ux/notes/27-the-write-path-says-one-thing.md`.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { clipsPath } from "./api";
import {
  CLIP_FILTERS_STORAGE_KEY,
  DEFAULT_CLIP_FILTERS,
  chooseClipFilters,
  clipFiltersChange,
  clipFiltersEntryToWrite,
  clipFiltersView,
  emptyClipsNotice,
  normalizeClipFilters,
  readStoredClipFilters,
  resolveClipFilters,
  saveStoredClipFilters,
  scopeForCaller,
  type ClipFilterSelection,
  type ClipFiltersState,
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

/** The hook's state before any change: a stored value and no entry to write. */
function held(stored: ClipFilterSelection): ClipFiltersState {
  return { stored, entry: null };
}

/**
 * The write the hook's effect performs after a change commits: the entry the step
 * answered with, handed to the real writer. The effect itself needs a DOM (see
 * this file's header), so a test models its write at the seam the suite can hold.
 */
function writeEntry(step: ClipFiltersState, storage: ReturnType<typeof fakeStorage>): void {
  if (step.entry !== null) {
    saveStoredClipFilters(step.entry, storage);
  }
}

/** The names `useClipFilters.ts` imports from `./clipFilters` — the seam that decides
 * whether a change is ever written. Read from the source because the import is a value
 * this DOM-less suite cannot reach through a render. */
function hookImports(): string[] {
  const source = readFileSync(new URL("./useClipFilters.ts", import.meta.url), "utf8");
  const clause = /import\s*\{([^}]*)\}\s*from\s*"\.\/clipFilters"/.exec(source)?.[1] ?? "";
  return clause.split(",").map((name) => name.trim().replace(/^type\s+/, ""));
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
  // The stored value is named to the read that finds it stale; a reader whose
  // entry is already the corrected selection has nothing left to be told.
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

test("a pick while /api/me is unanswered does not write the read's narrowing back", () => {
  const storage = fakeStorage({
    [CLIP_FILTERS_STORAGE_KEY]: JSON.stringify(WEST_ALL),
  });
  const options = { projects: ["West Study", "East Study"], tags: ["west", "chole"] };
  const unknown = { isAdmin: null };

  // The caller not yet known: the read narrows the request — `all` cannot be
  // proved without the flag, so it asks as `mine` — and corrects nothing, so the
  // stored value is still the reader's, whole.
  const view = clipFiltersView(readStoredClipFilters(storage), unknown, options);
  expect(view.filters).toEqual({ project: "West Study", tag: "west", scope: "mine" });
  expect(view.entry).toBeNull();
  expect(view.notice).toBeNull();

  // The pick patches the value in force — the reader's own stored selection, not
  // the read's narrowing of the request. Only the Project changes, so the admin's
  // `all` is still there to be read again; a tag pick in the same window leaves it
  // there too. A base of the resolution's `filters` alone fails right here: its
  // scope is the unproved `mine`.
  const pickedProject = clipFiltersChange(
    held(readStoredClipFilters(storage)),
    unknown,
    options,
    { project: "East Study" },
  );
  expect(pickedProject.stored).toEqual({ project: "East Study", tag: "west", scope: "all" });
  // The step answers with the entry to write as well as the state to hold: this is
  // the value the hook's effect writes once the change has committed, and it is
  // what the next read — the admin's own, without any narrowing — gets.
  expect(pickedProject.entry).toEqual(pickedProject.stored);
  writeEntry(pickedProject, storage);
  expect(readStoredClipFilters(storage)).toEqual(pickedProject.stored);

  const pickedTag = clipFiltersChange(pickedProject, unknown, options, { tag: "chole" });
  expect(pickedTag.stored).toEqual({ project: "East Study", tag: "chole", scope: "all" });
  expect(pickedTag.entry).toEqual(pickedTag.stored);
  writeEntry(pickedTag, storage);
  expect(readStoredClipFilters(storage)).toEqual(pickedTag.stored);

  // The flag answers admin: the browser kept a selection it may hold, and asks
  // with it as it stands — nothing left to correct and nothing left to say.
  expect(clipFiltersView(readStoredClipFilters(storage), { isAdmin: true }, options)).toEqual({
    filters: { project: "East Study", tag: "chole", scope: "all" },
    notice: null,
    entry: null,
  });
});

test("a change by a caller the read has answered patches the correction, so a dropped value cannot come back", () => {
  const caller = { isAdmin: false };
  const options = { projects: ["West Study"], tags: ["west", "east"] };

  // The read has answered: the stored `all` reads as `mine` and is named, and a
  // pick patches that selection — not the stored value the read passed over — so
  // the scope the correction dropped is not written back.
  const chosen = chooseClipFilters(WEST_ALL, caller, options, { tag: "east" });
  expect(chosen).toEqual({ project: "West Study", tag: "east", scope: "mine" });
  expect(clipFiltersView(chosen, caller, options)).toEqual({
    filters: { project: "West Study", tag: "east", scope: "mine" },
    notice: null,
    entry: null,
  });
});

test("a change while the read is unanswered leaves behind a value a loaded list proved dead", () => {
  const unknown = { isAdmin: null };
  const options = { projects: ["East Study"], tags: ["chole"] };

  // A Project the loaded list does not carry: the surface asks every Project —
  // the read left the dead name out of the request — so a tag pick made from
  // that surface must not keep it. A base of `stored` alone fails here.
  const deadProject: ClipFilterSelection = {
    project: "West Study",
    tag: "chole",
    scope: "mine",
  };
  expect(clipFiltersView(deadProject, unknown, options).filters.project).toBe("");
  expect(chooseClipFilters(deadProject, unknown, options, { tag: "chole" })).toEqual({
    project: "",
    tag: "chole",
    scope: "mine",
  });
  // Through the step the hook applies: neither the state nor the entry the hook
  // would write carries the dead Project back.
  const deadProjectStep = clipFiltersChange(held(deadProject), unknown, options, { tag: "chole" });
  expect(deadProjectStep.stored).toEqual({ project: "", tag: "chole", scope: "mine" });
  expect(deadProjectStep.entry).toEqual(deadProjectStep.stored);

  // The same for a tag no loaded list carries, on a Project pick.
  const deadTag: ClipFilterSelection = { project: "East Study", tag: "west", scope: "mine" };
  expect(chooseClipFilters(deadTag, unknown, options, { project: "East Study" })).toEqual({
    project: "East Study",
    tag: "",
    scope: "mine",
  });
  const deadTagStep = clipFiltersChange(held(deadTag), unknown, options, { project: "East Study" });
  expect(deadTagStep.stored).toEqual({ project: "East Study", tag: "", scope: "mine" });
  expect(deadTagStep.entry).toEqual(deadTagStep.stored);
});

test("a change while the read is unanswered leaves nothing for the answer to name", () => {
  const storage = fakeStorage({
    [CLIP_FILTERS_STORAGE_KEY]: JSON.stringify({
      project: "West Study",
      tag: "",
      scope: "mine",
    }),
  });
  const options = { projects: ["East Study"], tags: ["east"] };

  // The surface shows every Project; the reader changes the tag, and that is what
  // the change and the entry hold.
  const picked = clipFiltersChange(
    held(readStoredClipFilters(storage)),
    { isAdmin: null },
    options,
    { tag: "east" },
  );
  expect(picked.stored).toEqual({ project: "", tag: "east", scope: "mine" });
  writeEntry(picked, storage);
  expect(readStoredClipFilters(storage)).toEqual(picked.stored);

  // When the read answers it has no sentence about a Project the surface never
  // showed: the dead value did not survive the change, so there is nothing left
  // to name and nothing left to correct.
  const answered = clipFiltersView(readStoredClipFilters(storage), { isAdmin: true }, options);
  expect(answered.notice).toBeNull();
  expect(answered.entry).toBeNull();
});

test("a browser whose reader never chose a filter gains no stored entry", () => {
  const storage = fakeStorage();
  const stored = readStoredClipFilters(storage);

  // Every read a render makes of an untouched default, with nothing to correct:
  // the entry effect has nothing to write, so localStorage stays empty. (The
  // effect itself needs a DOM — hand-verified, see this file's header.)
  expect(clipFiltersView(stored, { isAdmin: null }, {}).entry).toBeNull();
  expect(clipFiltersView(stored, { isAdmin: false }, {}).entry).toBeNull();
  expect(clipFiltersView(stored, { isAdmin: true }, { projects: [], tags: [] }).entry).toBeNull();
  expect(storage.entries.size).toBe(0);

  // A change is the one thing that writes, and it writes what it produced: the
  // step's answer carries the entry, and the effect writes it once committed.
  const chosen = clipFiltersChange(held(stored), { isAdmin: true }, {}, { tag: "east" });
  expect(chosen.entry).toEqual(chosen.stored);
  writeEntry(chosen, storage);
  expect(storage.entries.size).toBe(1);
  expect(readStoredClipFilters(storage)).toEqual(chosen.stored);
});

test("an event's two changes are folded over the value in force, not one snapshot", () => {
  const storage = fakeStorage();
  const caller = { isAdmin: null };
  const options = { projects: ["E2E"], tags: ["east"] };
  const change = (state: ClipFiltersState, patch: Partial<ClipFilterSelection>) =>
    clipFiltersChange(state, caller, options, patch);

  // The hook's `choose` is this step over the state the change lands on
  // (`setState((current) => ...)`), so an event's changes are folded in order,
  // each over the value the previous one produced, and both land — including in
  // the entry, which the step answers with and the effect writes last. (The
  // `setState` that supplies `current` is React's and the hook's body needs a DOM;
  // the fold is what is pinned.)
  const folded = [{ tag: "east" }, { project: "E2E" }].reduce(
    change,
    held(DEFAULT_CLIP_FILTERS),
  );
  expect(folded.stored).toEqual({ project: "E2E", tag: "east", scope: "mine" });
  expect(folded.entry).toEqual(folded.stored);
  writeEntry(folded, storage);
  expect(readStoredClipFilters(storage)).toEqual(folded.stored);

  // A snapshot base — the value the callback captured — applies both to the same
  // value and loses the first change.
  const snapshot = change(held(DEFAULT_CLIP_FILTERS), { project: "E2E" });
  expect(snapshot.stored).toEqual({ project: "E2E", tag: "", scope: "mine" });
  expect(folded.stored).not.toEqual(snapshot.stored);
});

test("the sentence outlives the entry's correction, and a change ends it", () => {
  const storage = fakeStorage({
    [CLIP_FILTERS_STORAGE_KEY]: JSON.stringify(WEST_ALL),
  });
  const caller = { isAdmin: false };
  const options = { projects: ["West Study"], tags: ["west", "east"] };

  // The hook's state: the reader's stored value, which only their own change
  // replaces. The render corrects the request and says why.
  const first = clipFiltersView(readStoredClipFilters(storage), caller, options);
  expect(first.filters).toEqual({ project: "West Study", tag: "west", scope: "mine" });
  expect(first.notice).toContain("showing your own Clips");

  // The correction is the browser's entry, not the value in hand: writing it
  // does not take the stored value out of the render, so the sentence the reader
  // has not read yet is still there on the next one.
  saveStoredClipFilters(first.entry!, storage);
  expect(readStoredClipFilters(storage).scope).toBe("mine");
  const again = clipFiltersView(WEST_ALL, caller, options);
  expect(again.notice).toBe(first.notice);
  expect(again.entry).not.toBeNull();

  // Changing a filter patches the selection in force — the correction — and
  // replaces the stored value with it, so there is nothing left to correct and
  // nothing left to say.
  const chosen = chooseClipFilters(WEST_ALL, caller, options, { tag: "east" });
  saveStoredClipFilters(chosen, storage);
  const after = clipFiltersView(chosen, caller, options);
  expect(after.notice).toBeNull();
  expect(after.entry).toBeNull();
  expect(readStoredClipFilters(storage)).toEqual({
    project: "West Study",
    tag: "east",
    scope: "mine",
  });
});

test("the entry a render leaves is the correction when there is one, and the change's entry otherwise", () => {
  // The read's correction wins: it is what a later read must find, and it carries the
  // reader's change already (the change is part of `stored`, and the correction is
  // resolved from `stored`), so the precedence can drop neither.
  const change: ClipFilterSelection = { project: "West Study", tag: "east", scope: "mine" };
  const correction: ClipFilterSelection = { project: "", tag: "", scope: "mine" };
  expect(clipFiltersEntryToWrite(correction, change)).toEqual(correction);
  // With no correction, the entry the last change produced is what the browser keeps.
  expect(clipFiltersEntryToWrite(null, change)).toEqual(change);
  // With neither — a reader who never chose a filter, and a read that corrected
  // nothing — there is nothing to write, and the browser gains no entry.
  expect(clipFiltersEntryToWrite(null, null)).toBeNull();
});

test("a correction that goes away leaves the reader's change in the entry, not nothing", () => {
  // A read that answers after a change can correct the value that change committed ...
  const stored: ClipFilterSelection = { project: "West Study", tag: "", scope: "mine" };
  const changed = clipFiltersChange(held(stored), { isAdmin: true }, { projects: ["West Study"] }, {
    tag: "east",
  });
  const corrected = clipFiltersView(changed.stored, { isAdmin: true }, { projects: [] });
  expect(corrected.entry).not.toBeNull();
  expect(clipFiltersEntryToWrite(corrected.entry, changed.entry)).toEqual(corrected.entry);
  // ... and a read that answers again with the Project back in its list drops the
  // correction: the entry falls back to the change, rather than leaving the browser
  // holding a correction that no longer holds.
  const back = clipFiltersView(changed.stored, { isAdmin: true }, { projects: ["West Study"] });
  expect(back.entry).toBeNull();
  expect(clipFiltersEntryToWrite(back.entry, changed.entry)).toEqual(changed.entry);
});

test("the hook writes through the step that carries the entry, in an effect keyed on the value", () => {
  // Nothing here can run the hook: no DOM, so no render and no effect. The seam
  // between the hook and the step is a call rather than a value, so this is the
  // one place a node test can pin it — by reading the file. It fails if `choose`
  // goes back to `setState((current) => chooseClipFilters(...))`, the fold that
  // drops the write and left 206 tests green.
  const source = readFileSync(new URL("./useClipFilters.ts", import.meta.url), "utf8");
  const names = hookImports();
  // `clipFiltersChange` is the step whose answer is the next state *and* the entry;
  // `clipFiltersEntryToWrite` is the decision the effect writes by. A hook that went
  // back to the selection-only fold would import `chooseClipFilters` instead — that is
  // the tell of a change that is decided but never persisted. Imports rather than a call
  // site so that a rename or a reflow in the hook is not read as a behaviour change.
  expect(names).toContain("clipFiltersChange");
  expect(names).toContain("clipFiltersEntryToWrite");
  expect(names).not.toContain("chooseClipFilters");
  // The effect is keyed on the value it writes. Dropping the key, or narrowing it to the
  // read's correction alone, stops it running after a change commits and leaves the
  // reader's own value unwritten — a regression no pure test can see, since the step's
  // answer is unchanged and `writeEntry` above models the effect's write, not its trigger.
  expect(source).toContain("const entryToWrite = clipFiltersEntryToWrite(correction, state.entry);");
  expect(source).toContain("saveStoredClipFilters(entryToWrite)");
  expect(source).toContain("}, [entryToWrite]);");
});
