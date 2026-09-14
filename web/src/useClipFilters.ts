/**
 * The one stored selection the Clips page and the desk's Clip rail both read.
 *
 * The list page and the rail never build their own read of `localStorage`, so
 * they cannot disagree about the list — including about the two stored values
 * that would strand it: a scope the server refuses this Account, and a
 * `project`/`tag` no option list carries any more. `resolveClipFilters` is the
 * whole of that reading; this hook feeds it the Account and the option lists,
 * shows the reader what it left behind, and writes the corrected value back so
 * the next reader — the other surface, a reload — starts from it.
 *
 * A browser leaves a stale entry behind every time; a list nobody can fix from
 * the UI is the defect this exists to prevent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  getJson,
  mePath,
  projectsPath,
  tagsPath,
  type Me,
  type ProjectsResponse,
  type TagsResponse,
} from "./api";
import {
  readStoredClipFilters,
  resolveClipFilters,
  saveStoredClipFilters,
  type ClipFilterSelection,
} from "./clipFilters";

/** The selection to ask the server with, and how to change what is stored. */
export type ClipFiltersHandle = {
  /** The selection the server will answer: ask for the Clips with this. */
  filters: ClipFilterSelection;
  /** The sentence about a stored value that was not used; `null` when there is none. */
  notice: string | null;
  /** Whether this caller may choose the scope at all — `all` is the admin's. */
  canChooseScope: boolean;
  /** Store a change, for a control that offers one. */
  choose(patch: Partial<ClipFilterSelection>): void;
};

export function useClipFilters(): ClipFiltersHandle {
  const { data: me } = useSWR(mePath(), getJson<Me>);
  const { data: projects } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const { data: tags } = useSWR(tagsPath(), getJson<TagsResponse>);
  const [stored, setStored] = useState<ClipFilterSelection>(readStoredClipFilters);

  const resolution = useMemo(
    () =>
      resolveClipFilters(
        stored,
        { isAdmin: me ? me.roles.admin : null },
        {
          projects: projects?.projects.map((row) => row.name),
          tags: tags?.tags,
        },
      ),
    [me, projects, stored, tags],
  );

  // The reader's own browser outlived the value: put the entry right once, so
  // the other surface and the next reload read a selection that still lists
  // Clips. Without options loaded the resolution corrects nothing.
  const { corrected, filters } = resolution;
  useEffect(() => {
    if (corrected) {
      saveStoredClipFilters(filters);
    }
  }, [corrected, filters]);

  const choose = useCallback((patch: Partial<ClipFilterSelection>) => {
    setStored((previous) => {
      const next = { ...previous, ...patch };
      saveStoredClipFilters(next);
      return next;
    });
  }, []);

  return {
    filters: resolution.filters,
    notice: resolution.notice,
    canChooseScope: me ? me.roles.admin : false,
    choose,
  };
}
