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
 * The selection in force is the resolution's field by field, by the module's one
 * rule: a field the read has answered for is the resolution's, and a field it has
 * not is the reader's. So `project` and `tag` are always the resolution's — a
 * value a loaded option list proved dead is not in hand anywhere and cannot come
 * back through a pick — while the reader's own `scope` holds until `/api/me`
 * answers for it, so a read still in flight cannot narrow an admin's stored `all`
 * away. The surfaces show `filters`, and a control changes the value in force
 * through `clipFiltersChange`, the pure step over the state the change lands on,
 * which answers with the next state *and* the entry to write.
 *
 * That write happens in the effect below, once the value has committed: never in
 * a state updater, which must be pure and which React may run more than once or
 * never commit. The effect writes the read's correction when there is one and
 * otherwise the entry the last change produced, so either way the browser's entry
 * holds a value that was committed and shown — and a browser whose reader never
 * chooses a filter has neither and gains no entry. The reader's stored value
 * stays in state — the sentence is a fact about it, and a fact a human reads has
 * to outlive the commit that writes the entry — so the sentence is still on the
 * render after the correction, and it goes when the reader changes a filter.
 *
 * A browser leaves a stale entry behind every time; a list nobody can fix from
 * the UI is the defect this exists to prevent.
 *
 * What the node suite does not reach: there is no DOM here, so no render in
 * `clipFilters.test.ts` runs this hook. `choose` and the entry effect below are
 * this file's wiring and are hand-verified; the suite pins the pure decisions
 * they are built from (`clipFiltersChange`, `clipFiltersView`) and reads this
 * file's source to pin that `choose` is that step and not a fold that drops the
 * write. Everything a render alone could get wrong is the owner's to check by
 * hand; `.scratch/pilot-ux/notes/27-the-write-path-says-one-thing.md` carries
 * the behaviour. The entry effect's own decision — which of the two entries a
 * render leaves in the browser — is `clipFiltersEntryToWrite`, and it is pinned.
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
  clipFiltersChange,
  clipFiltersEntryToWrite,
  clipFiltersView,
  readStoredClipFilters,
  saveStoredClipFilters,
  type ClipFilterCaller,
  type ClipFilterOptions,
  type ClipFilterSelection,
  type ClipFiltersState,
} from "./clipFilters";

/** The selection to ask the server with, and how to change what is in force. */
export type ClipFiltersHandle = {
  /**
   * The selection to ask the server with and to show: the stored value as the
   * read has answered for it, patched by a change in every field the read has
   * answered for — `project` and `tag` always, `scope` once the caller is known.
   * The one field the read may not have answered for yet, `scope` while
   * `/api/me` is in flight, stays the reader's own (see `chooseClipFilters`).
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
   * Store a change to the selection in force, for a control that offers one. The
   * change is the pure step `clipFiltersChange` over the state it lands on, so a
   * second change in the same event folds over what the first produced; the
   * browser's entry is written by the effect above, once that state has
   * committed. Hand-verified: this needs a DOM to run.
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
  // The reader's own value, as the browser holds it, and the entry the last
  // change produced: the sentence is about `stored`, and a change of theirs is
  // what replaces it.
  const [state, setState] = useState<ClipFiltersState>(() => ({
    stored: readStoredClipFilters(),
    entry: null,
  }));
  const view = useMemo(
    () => clipFiltersView(state.stored, caller, options),
    [caller, options, state.stored],
  );
  const { entry: correction, filters, notice } = view;

  // The browser's entry, written here rather than in the updater that produced
  // the value: this runs after React has committed and shown it, so the entry can
  // only ever hold a value that was committed. `clipFiltersEntryToWrite` decides
  // which — the read's correction when there is one, it being what a later read
  // must find, and otherwise the entry the last change committed; a browser whose
  // reader never chose a filter has neither and gains no entry. The state is not
  // touched here, so the sentence is still there on the render after this one, and
  // a change is what replaces the value it is about.
  //
  // The effect is keyed on that decision rather than on the state object: what makes
  // this run is the entry changing — a change committing a new one, or the read
  // answering with a correction — and the value is one of the two this render already
  // holds, so the key is stable across re-renders with the same answer. Keying it on
  // a narrower expression (`correction` alone) would stop the effect running after a
  // change commits, leaving the reader's own change unwritten. Hand-verified: no
  // render in the node suite runs an effect; the decision itself is pinned.
  const entryToWrite = clipFiltersEntryToWrite(correction, state.entry);
  useEffect(() => {
    if (entryToWrite !== null) {
      saveStoredClipFilters(entryToWrite);
    }
  }, [entryToWrite]);

  const choose = useCallback(
    (patch: Partial<ClipFilterSelection>) => {
      // The change is the pure step over the state it lands on — the state the
      // change lands on, not the `filters` this render captured — so an event's
      // second change folds over what the first produced, and a field the read
      // has not answered for cannot be narrowed over. The step's answer carries
      // the entry to write, and the effect above writes it once this state has
      // committed; nothing here writes.
      setState((current) => clipFiltersChange(current, caller, options, patch));
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
