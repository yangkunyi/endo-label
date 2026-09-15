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
 * The selection in force is the resolution's `filters` once the read has an
 * answer, and the reader's own stored value until then: a control changes that
 * value (`chooseClipFilters`, applied to the state the change lands on), and the
 * browser's entry gets it, so a value the correction dropped is not in hand
 * anywhere and cannot come back through a Project or tag pick, while a read
 * still in flight cannot write its narrowing over what the reader stored. The
 * reader's stored value stays in state — the sentence is a fact about it, and a
 * fact a human reads has to outlive the commit that writes the entry — so the
 * sentence is still on the render after the correction, and it goes when the
 * reader changes a filter.
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
  type ClipFilterCaller,
  type ClipFilterOptions,
  type ClipFilterSelection,
} from "./clipFilters";

/** The selection to ask the server with, and how to change what is in force. */
export type ClipFiltersHandle = {
  /** The selection in force: ask for the Clips with this. */
  filters: ClipFilterSelection;
  /**
   * The sentence about a stored value that was not used; `null` when there is
   * none. It belongs to the stored value, so it stays until the reader changes a
   * filter — `choose` replaces that value and ends the sentence.
   */
  notice: string | null;
  /** Whether this caller may choose the scope at all — `all` is the admin's. */
  canChooseScope: boolean;
  /**
   * Store a change to the selection in force, for a control that offers one. The
   * change is applied to the value in force at the moment it is applied, so a
   * second change in the same event does not lose the first.
   */
  choose(patch: Partial<ClipFilterSelection>): void;
};

export function useClipFilters(): ClipFiltersHandle {
  const { data: me } = useSWR(mePath(), getJson<Me>);
  const { data: projects } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const { data: tags } = useSWR(tagsPath(), getJson<TagsResponse>);
  const caller = useMemo<ClipFilterCaller>(
    () => ({ isAdmin: me ? me.roles.admin : null }),
    [me],
  );
  const options = useMemo<ClipFilterOptions>(
    () => ({
      projects: projects?.projects.map((row) => row.name),
      tags: tags?.tags,
    }),
    [projects, tags],
  );
  // The reader's own value, as the browser holds it: the sentence is about this,
  // and a change of theirs is what replaces it.
  const [stored, setStored] = useState<ClipFilterSelection>(readStoredClipFilters);
  const view = useMemo(
    () => clipFiltersView(stored, caller, options),
    [caller, options, stored],
  );
  const { entry, filters, notice } = view;

  // The browser's entry: the correction when the resolution has one, and the
  // selection in force otherwise — which is how a change reaches the entry. The
  // state is not touched here, so the sentence is still there on the render after
  // this one, and a change is what replaces the value it is about.
  useEffect(() => {
    saveStoredClipFilters(entry ?? stored);
  }, [entry, stored]);

  const choose = useCallback(
    (patch: Partial<ClipFilterSelection>) => {
      // The change is a function of the value in force at the moment it is
      // applied — the state the change lands on, not the `filters` this render
      // captured — so an event's second change lands on what the first produced,
      // and a read still in flight cannot write its narrowing over what the
      // reader stored.
      setStored((current) => chooseClipFilters(current, caller, options, patch));
    },
    [caller, options],
  );

  return {
    filters,
    notice,
    canChooseScope: me ? me.roles.admin : false,
    choose,
  };
}
