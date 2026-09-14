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
 * The corrected selection is the one source of truth: what the state holds is
 * what the surfaces render, what a later control changes (`chooseClipFilters`)
 * and what the browser's entry gets, so a value the correction dropped is not in
 * hand anywhere and cannot come back through a Project or tag pick. A reader is
 * told once: the sentence belongs to the read that finds the stored value stale,
 * and the resolution over the corrected selection has nothing left to say.
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
  const [selection, setSelection] = useState<ClipFilterSelection>(readStoredClipFilters);

  const resolution = useMemo(
    () =>
      resolveClipFilters(
        selection,
        { isAdmin: me ? me.roles.admin : null },
        {
          projects: projects?.projects.map((row) => row.name),
          tags: tags?.tags,
        },
      ),
    [me, projects, selection, tags],
  );

  // The reader's own browser outlived the value: the corrected selection becomes
  // the state — and the entry — in the commit the correction is found in, so the
  // other surface and the next reload read a selection that still lists Clips.
  // Every read after this one is a read of the corrected value: nothing left to
  // correct, and nothing left to say.
  const { corrected, filters, notice } = resolution;
  useEffect(() => {
    if (!corrected) {
      return;
    }
    setSelection(filters);
    saveStoredClipFilters(filters);
  }, [corrected, filters]);

  const choose = useCallback((patch: Partial<ClipFilterSelection>) => {
    setSelection((previous) => {
      // A control changes what the surface shows, and the surface shows the
      // corrected selection: patching that value is what keeps a scope or filter
      // the correction read past out of the browser's entry for good.
      const next = chooseClipFilters(previous, patch);
      saveStoredClipFilters(next);
      return next;
    });
  }, []);

  return {
    filters,
    notice,
    canChooseScope: me ? me.roles.admin : false,
    choose,
  };
}
