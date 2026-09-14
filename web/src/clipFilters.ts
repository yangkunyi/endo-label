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
 * the caller is known, which selection the browser keeps.
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
 * is read into the browser's own entry (see `resolveClipFilters`).
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
   * The stored entry is stale: `filters` is what should replace it — in the
   * selection the surfaces hold and in the browser's entry alike. Never true for
   * a caller not yet known, whose stored selection is nobody's to correct yet.
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
 * value found dead in that window is found dead again once the flag answers.
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
 * The selection a control's change produces.
 *
 * `shown` is the selection the surfaces render, which is the corrected one: what
 * the state holds and what the browser's entry gets, so the two agree about the
 * same value. A change is a patch of that and of nothing else — a scope or a
 * filter the resolution has already read past is not in hand to bring back, and
 * nothing here decides who may hold what: `resolveClipFilters` reads the result
 * on the next render, options and caller unchanged.
 */
export function chooseClipFilters(
  shown: ClipFilterSelection,
  patch: Partial<ClipFilterSelection>,
): ClipFilterSelection {
  return { ...shown, ...patch };
}
