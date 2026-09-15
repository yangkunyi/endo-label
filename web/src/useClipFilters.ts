/**
 * The one stored selection the Clips page and the desk's Clip rail both read.
 *
 * The list page and the rail never build their own read of `localStorage`, so
 * they cannot disagree about the list — including about the stored values that
 * would strand it: a scope the server refuses this Account, and a `project`/`tag`
 * no option list carries any more. `resolveClipFilters` is the whole of that
 * reading; this hook feeds it the Account and the option lists and shows the
 * reader what it left behind.
 *
 * The selection in force is the resolution's `filters`: it is what the surfaces
 * render, what a control changes (`chooseClipFilters`) and what the browser's
 * entry gets, so a value the correction dropped is not in hand anywhere and
 * cannot come back through a Project or tag pick. The reader's stored value
 * stays in state — the sentence is a fact about it, and a fact a human reads has
 * to outlive the commit that writes the entry — so the sentence is still on the
 * render after the correction, and it goes when the reader changes a filter.
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
  chooseClipFilters,
  clipFiltersView,
  readStoredClipFilters,
  saveStoredClipFilters,
  type ClipFilterSelection,
} from "./clipFilters";

/** The selection to ask the server with, and how to change what is in force. */
export type ClipFiltersHandle = {
  /** The selection in force: ask for the Clips with this, and patch this. */
  filters: ClipFilterSelection;
  /**
   * The sentence about a stored value that was not used; `null` when there is
   * none. It belongs to the stored value, so it stays until the reader changes a
   * filter — `choose` replaces that value and ends the sentence.
   */
  notice: string | null;
  /** Whether this caller may choose the scope at all — `all` is the admin's. */
  canChooseScope: boolean;
  /** Store a change to the selection in force, for a control that offers one. */
  choose(patch: Partial<ClipFilterSelection>): void;
};

export function useClipFilters(): ClipFiltersHandle {
  const { data: me } = useSWR(mePath(), getJson<Me>);
  const { data: projects } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const { data: tags } = useSWR(tagsPath(), getJson<TagsResponse>);
  // The reader's own value, as the browser holds it: the sentence is about this,
  // and only a change of theirs replaces it.
  const [stored, setStored] = useState<ClipFilterSelection>(readStoredClipFilters);

  const view = useMemo(
    () =>
      clipFiltersView(
        stored,
        { isAdmin: me ? me.roles.admin : null },
        {
          projects: projects?.projects.map((row) => row.name),
          tags: tags?.tags,
        },
      ),
    [me, projects, stored, tags],
  );
  const { entry, filters, notice } = view;

  // The correction goes into the browser's entry and never back into the state:
  // the stored value the sentence is about stays in hand, so the sentence is
  // still there on the render after this one. A change is what replaces it
  // (see `choose`), and that is what ends the sentence.
  useEffect(() => {
    if (entry) {
      saveStoredClipFilters(entry);
    }
  }, [entry]);

  const choose = useCallback(
    (patch: Partial<ClipFilterSelection>) => {
      // A control changes the selection in force — `filters`, not the stored
      // value a correction read past — so a pick cannot carry a refused scope or
      // a dead Project back into the browser's entry, whether the caller is
      // known or `/api/me` has not answered yet.
      const next = chooseClipFilters(filters, patch);
      saveStoredClipFilters(next);
      setStored(next);
    },
    [filters],
  );

  return {
    filters,
    notice,
    canChooseScope: me ? me.roles.admin : false,
    choose,
  };
}
