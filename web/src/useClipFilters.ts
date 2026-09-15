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
 * The selection in force is the resolution's field by field, taking each field as
 * the read has answered for it: every `project`/`tag` a loaded option list has
 * proved or left alone, and the reader's own `scope` until `/api/me` answers for
 * it. The surfaces show `filters`, and a control changes the value in force
 * (`applyClipFilterChange`, one call over the state the change lands on), so a
 * value the correction dropped is not in hand anywhere and cannot come back
 * through a Project or tag pick, while a read still in flight cannot write its
 * unproved narrowing of `scope` over what the reader stored. That change is what
 * writes the browser's entry; the effect behind a render writes the read's
 * correction and nothing else, so a browser whose reader never chooses a filter
 * gains no entry. The reader's stored value stays in state — the sentence is a
 * fact about it, and a fact a human reads has to outlive the commit that writes
 * the entry — so the sentence is still on the render after the correction, and
 * it goes when the reader changes a filter.
 *
 * A browser leaves a stale entry behind every time; a list nobody can fix from
 * the UI is the defect this exists to prevent.
 *
 * The wiring this file owns is hand-verified: this suite has no DOM, so no render
 * here runs `choose` or the effect. `clipFilters.test.ts` says so where it pins
 * the decisions underneath, and the owner's list in
 * `.scratch/pilot-ux/notes/24-a-change-does-not-decide-an-unanswered-field.md`
 * carries the behaviour.
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
  applyClipFilterChange,
  clipFiltersView,
  readStoredClipFilters,
  saveStoredClipFilters,
  type ClipFilterCaller,
  type ClipFilterOptions,
  type ClipFilterSelection,
} from "./clipFilters";

/** The selection to ask the server with, and how to change what is in force. */
export type ClipFiltersHandle = {
  /**
   * The selection to ask the server with and to show: the stored value as the
   * read has answered for it. A change patches this selection field by field,
   * except for a `scope` the read has not answered for yet — that one stays the
   * reader's own (see `chooseClipFilters`).
   */
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
   * Store a change to the selection in force, for a control that offers one, and
   * write it to the browser's entry. The change is applied to the value in force
   * at the moment it is applied, so a second change in the same event does not
   * lose the first. Hand-verified: this needs a DOM to run.
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

  // The browser's entry: the read's correction, and nothing else. A change of the
  // reader's is written by `choose` itself, so this effect cannot put the value a
  // render holds over what a change just stored, and a browser whose reader never
  // chose a filter gains no entry from a read. The state is not touched here, so
  // the sentence is still there on the render after this one, and a change is what
  // replaces the value it is about. Hand-verified: no render in the node suite
  // runs an effect.
  useEffect(() => {
    if (entry) {
      saveStoredClipFilters(entry);
    }
  }, [entry]);

  const choose = useCallback(
    (patch: Partial<ClipFilterSelection>) => {
      // The change is a function of the value in force at the moment it is
      // applied — the state the change lands on, not the `filters` this render
      // captured — so an event's second change lands on what the first produced,
      // and a field the read has not answered for cannot be narrowed over. The
      // write is inside the same call, so the entry holds what this fold produced.
      setStored((current) => applyClipFilterChange(current, caller, options, patch));
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
