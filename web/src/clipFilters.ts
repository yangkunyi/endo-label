/**
 * The Clips directory's own selection: which Project, which tag, and whose Clips.
 *
 * The list page and the desk's Clip rail read this one stored selection, so the
 * two can never show different Clips. The scope is a server decision — an
 * Account asking for `all` without being an admin gets a 403, and that refusal
 * is shown rather than worked around here.
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
