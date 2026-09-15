/**
 * The Clips directory's own selection: which Project, which tag, and whose Clips.
 *
 * The list page and the desk's Clip rail read this one stored selection, so the
 * two can never show different Clips. The scope is a server decision — an
 * Account asking for `all` without being an admin gets a 403 — so a stored
 * selection is never asked with as stored: `resolveClipFilters` reads it for
 * the caller who is asking. The browser outlives an admin flag and a Project's
 * name, and a value the server would refuse (or no longer knows) would strand
 * the list with a sentence instead of Clips.
 *
 * The server's rule is not softened here: a non-admin asking for `all` is still
 * refused. What changes is which selection the browser asks with — and, once
 * the caller is known, which selection the browser's entry keeps.
 *
 * A change of the reader's patches the selection in force at the moment it is
 * applied, field by field, and only in the fields it names. A field the read has
 * answered for is the resolution's: a Project or tag is narrowed only against a
 * loaded option list, so the read has answered for it whenever its answer can
 * differ from the reader's value, and a value such a list proved dead cannot
 * survive the change. A field the read has not answered for stays the reader's:
 * while `/api/me` is in flight, `scope` is narrowed to `mine` for the request and
 * never proved, so a Project or tag pick keeps the stored `scope`, and an admin's
 * `all` is not the browser's to lose. The change is also what writes the
 * browser's entry, so a browser whose reader never chooses a filter gains none;
 * the read's own correction is all the render after it has left to write
 * (`clipFiltersView`'s `entry`).
 */

import type { ClipScope } from "./api";

export const CLIP_FILTERS_STORAGE_KEY = "endo_label:clip-filters-v1";

/** What the selects hold: an empty string is "no filter", and `mine` is default. */
export type ClipFilterSelection = {
  project: string;
  tag: string;
  scope: ClipScope;
};

export const DEFAULT_CLIP_FILTERS: ClipFilterSelection = {
  project: "",
  tag: "",
  scope: "mine",
};

export function isClipScope(value: unknown): value is ClipScope {
  return value === "mine" || value === "all";
}

/** Just enough of `Storage` to read and write one entry, so a test can stand in. */
type ReadableStorage = { getItem(key: string): string | null };
type WritableStorage = { setItem(key: string, value: string): void };

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** Only the shape we wrote survives: anything else falls back to the default. */
export function normalizeClipFilters(value: unknown): ClipFilterSelection {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CLIP_FILTERS };
  }
  const candidate = value as Partial<ClipFilterSelection>;
  return {
    project: typeof candidate.project === "string" ? candidate.project : "",
    tag: typeof candidate.tag === "string" ? candidate.tag : "",
    scope: isClipScope(candidate.scope) ? candidate.scope : "mine",
  };
}

export function readStoredClipFilters(
  storage: ReadableStorage | null = browserStorage(),
): ClipFilterSelection {
  if (!storage) {
    return { ...DEFAULT_CLIP_FILTERS };
  }
  try {
    const raw = storage.getItem(CLIP_FILTERS_STORAGE_KEY);
    return normalizeClipFilters(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CLIP_FILTERS };
  }
}

export function saveStoredClipFilters(
  filters: ClipFilterSelection,
  storage: WritableStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(CLIP_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // localStorage can be unavailable in private browsing or a restricted iframe.
  }
}

/** The empty-list sentence, which one depends on whose Clips are on screen. */
export function emptyClipsNotice(scope: ClipScope): string {
  return scope === "all" ? "No Clips on the allowlist." : "No Clips assigned to you.";
}

/**
 * Who is asking, as the admin flag the server judges.
 *
 * `null` is a caller not yet known: `/api/me` has not answered, so no admin
 * flag can be claimed and none denied — the safe request is made, and nothing
 * the reader stored is corrected yet (see `resolveClipFilters`).
 */
export type ClipFilterCaller = { isAdmin: boolean | null };

/**
 * The options the selects hold, field by field: `undefined` is a list that has
 * not loaded, and a list that has loaded may be empty.
 */
export type ClipFilterOptions = { projects?: readonly string[]; tags?: readonly string[] };

/** The stored selection, read for one caller. */
export type ClipFilterResolution = {
  /** The selection to ask the server with: always one it will answer. */
  filters: ClipFilterSelection;
  /** What the reader must be told about the stored value, or `null` for nothing. */
  notice: string | null;
  /**
   * The stored selection is stale: `filters` is what the browser must ask with,
   * and what its entry should become. The correction is not written back over
   * the stored value in the reader's hands — it goes to the entry, and a change
   * of the reader's is what replaces that value — so the sentence about it can
   * be read after the correction. Never true for a caller not yet known, whose
   * stored selection is nobody's to correct yet.
   */
  corrected: boolean;
};

/** Only an admin may hold `all`; anybody else, and a caller not yet known, is `mine`. */
export function scopeForCaller(scope: ClipScope, isAdmin: boolean | null): ClipScope {
  return scope === "all" && isAdmin !== true ? "mine" : scope;
}

/** Whether a filter value is one the loaded list no longer carries. */
function isDeadValue(value: string, options: readonly string[] | undefined): boolean {
  return value !== "" && options !== undefined && !options.includes(value);
}

/** Small enough to quote, long enough to name: one filter value in a sentence. */
function quoted(value: string): string {
  return `"${value}"`;
}

/**
 * The stored selection as this caller may use it, plus what was left behind.
 *
 * Field by field, for a caller who is *known*:
 *
 * - `scope`: a value the server would refuse this caller — the browser is
 *   shared, or an admin flag was taken away — reads as `mine`, so the caller
 *   ends up with its own Clips instead of the refusal sentence over an empty
 *   list. It is said in this module's own words, never as the server's refusal.
 * - `project`, `tag`: a value no *loaded* option list carries any more (a
 *   renamed or deleted Project, a tag no Clip carries) is left out and named.
 *   A list that has not loaded cannot call a value dead — `undefined` options
 *   are a list that has not answered, `[]` is one that answered nothing — and
 *   the empty value is no filter, so it survives every list.
 *
 * A caller not yet known is narrowed the same way and corrected in no field: the
 * request leaves out what cannot be proved (`mine` for `all`, or a value no loaded
 * list carries), while `corrected` stays false and `notice` stays null. An admin's
 * own stored `all` is not the browser's to lose while `/api/me` is in flight, and a
 * value found dead in that window is found dead again once the flag answers. A pick
 * made in that window is a patch of the stored value and not of this read (see
 * `chooseClipFilters`), so the window cannot turn this narrowing into a loss.
 */
export function resolveClipFilters(
  stored: ClipFilterSelection,
  caller: ClipFilterCaller,
  options: ClipFilterOptions = {},
): ClipFilterResolution {
  const known = caller.isAdmin !== null;
  const scope = scopeForCaller(stored.scope, caller.isAdmin);
  const project = isDeadValue(stored.project, options.projects) ? "" : stored.project;
  const tag = isDeadValue(stored.tag, options.tags) ? "" : stored.tag;

  // Every field is corrected together or not at all: a known caller's stored
  // selection is the one that may be replaced, and a caller not yet known can
  // claim nothing about it.
  const scopeDropped = known && scope !== stored.scope;
  const projectDropped = known && project !== stored.project;
  const tagDropped = known && tag !== stored.tag;
  const sentences = [
    scopeDropped ? "Every Clip is the admin's scope; showing your own Clips." : "",
    projectDropped
      ? `The stored Project ${quoted(stored.project)} is not registered; showing every Project.`
      : "",
    tagDropped ? `The stored tag ${quoted(stored.tag)} is on no Clip; showing every tag.` : "",
  ].filter((sentence) => sentence !== "");

  return {
    filters: { project, tag, scope },
    notice: sentences.length > 0 ? sentences.join(" ") : null,
    corrected: scopeDropped || projectDropped || tagDropped,
  };
}

/**
 * One render of the stored selection, as the hook hands it to its surfaces.
 *
 * `filters` is the selection the surfaces ask with — the stored value as this
 * caller may use it — and the value a control patches in every field the read has
 * answered for; the one field it may not have answered for yet, `scope`, stays
 * the reader's own (see `chooseClipFilters`). `notice` is the sentence about the
 * stored value, and reading it does not use it up — the stored value is still in
 * the reader's hands, so the render after the correction says the same thing.
 * `entry` is the browser's correction: the selection the entry should become, or
 * `null` when it is already the one in force. Writing it changes nothing the
 * reader sees, which is what lets the sentence outlive it.
 */
export type ClipFiltersView = {
  /** The selection the server will answer: ask for the Clips with this. */
  filters: ClipFilterSelection;
  /** The sentence about the stored value, or `null` when there is none. */
  notice: string | null;
  /** What the browser's entry must become, or `null` when it is already right. */
  entry: ClipFilterSelection | null;
};

export function clipFiltersView(
  stored: ClipFilterSelection,
  caller: ClipFilterCaller,
  options: ClipFilterOptions = {},
): ClipFiltersView {
  const { corrected, filters, notice } = resolveClipFilters(stored, caller, options);
  return { filters, notice, entry: corrected ? filters : null };
}

/**
 * The stored selection a control's change produces.
 *
 * The change patches the selection in force at the moment it is applied, field
 * by field, and only the fields in `patch` change. Which selection that is, the
 * read answers per field:
 *
 * - `project`, `tag`: a value is called dead only against a *loaded* option
 *   list, so this field is proved or left alone — the read has answered for it
 *   whenever `filters` can differ from the reader's value. The change patches
 *   the resolution's value, so a value a loaded list proved dead is left out and
 *   stays out, and the sentence the read would have said about it cannot come
 *   back over a change the surface made silently.
 * - `scope`: answered only by `/api/me`. Until the Account is known, the request
 *   narrows `all` to `mine` without proving anything, so the reader's own stored
 *   value is in force and a Project or tag pick leaves an admin's `all` alone; a
 *   non-admin's stale `all` is corrected by the read's own answer, never by a
 *   change. Once the flag is known, the resolution's scope is in force and a
 *   value the server would refuse cannot be carried back by a pick.
 *
 * Pure and total — writing is `applyClipFilterChange`'s — so it is the decision
 * the hook is built from: the next stored selection is a function of the value in
 * force and the patch, and of nothing a render happened to hold.
 */
export function chooseClipFilters(
  stored: ClipFilterSelection,
  caller: ClipFilterCaller,
  options: ClipFilterOptions,
  patch: Partial<ClipFilterSelection>,
): ClipFilterSelection {
  const { filters } = resolveClipFilters(stored, caller, options);
  const inForce: ClipFilterSelection = {
    project: filters.project,
    tag: filters.tag,
    // The one field the read may not have answered for: the request's narrowing
    // of an unproved `all` is not a value to patch from.
    scope: caller.isAdmin === null ? stored.scope : filters.scope,
  };
  return { ...inForce, ...patch };
}

/**
 * The reader's change, applied to the value in force and written where the
 * reader's value lives.
 *
 * This is the hook's `choose` in one call: `chooseClipFilters` decides the next
 * selection and `saveStoredClipFilters` writes it, so a change persists what it
 * produced — and the render effect has only the read's correction left to write,
 * which is what keeps a browser whose reader never chose a filter from gaining
 * an entry. Takes a storage so a test can stand in for `localStorage`, like the
 * readers around it.
 */
export function applyClipFilterChange(
  stored: ClipFilterSelection,
  caller: ClipFilterCaller,
  options: ClipFilterOptions,
  patch: Partial<ClipFilterSelection>,
  storage: WritableStorage | null = browserStorage(),
): ClipFilterSelection {
  const next = chooseClipFilters(stored, caller, options, patch);
  saveStoredClipFilters(next, storage);
  return next;
}
