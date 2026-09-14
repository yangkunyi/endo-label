import { useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import {
  clipDeskPath,
  clipsPath,
  getJson,
  mePath,
  projectsPath,
  tagsPath,
  type ClipListResponse,
  type Me,
  type ProjectsResponse,
  type TagsResponse,
} from "./api";
import {
  emptyClipsNotice,
  readStoredClipFilters,
  saveStoredClipFilters,
  type ClipFilterSelection,
} from "./clipFilters";

/**
 * The Clips directory: the Clips this Account may see, narrowed by Project and
 * tag. `mine` is enforced by the server, so the page never hides a row the
 * server would have sent; `all` is the admin's own scope, and its refusal is
 * shown as the sentence the server sent.
 */
export function ClipList() {
  const [filters, setFilters] = useState<ClipFilterSelection>(readStoredClipFilters);
  const { data: me } = useSWR(mePath(), getJson<Me>);
  const { data: projects } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const { data: tags } = useSWR(tagsPath(), getJson<TagsResponse>);
  // The selection is a path's worth of filters: empty ones drop out of the URL.
  const { data, error, isLoading } = useSWR(
    clipsPath(filters),
    getJson<ClipListResponse>,
  );
  const isAdmin = Boolean(me?.roles.admin);

  function choose(patch: Partial<ClipFilterSelection>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    saveStoredClipFilters(next);
  }

  return (
    <main className="mx-auto h-full max-w-5xl overflow-auto p-6">
      <h1 className="mb-1 text-xl font-semibold">Clips</h1>
      <p className="mb-4 text-stone-600">
        Open a Clip to label phase, class, and triplet on the same Frame.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project
          <select
            aria-label="Filter by Project"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={filters.project}
            onChange={(event) => choose({ project: event.target.value })}
          >
            <option value="">All Projects</option>
            {projects?.projects.map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Clip tag
          <select
            aria-label="Filter by Clip tag"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={filters.tag}
            onChange={(event) => choose({ tag: event.target.value })}
          >
            <option value="">All tags</option>
            {tags?.tags.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              aria-label="Show every Clip"
              checked={filters.scope === "all"}
              onChange={(event) => choose({ scope: event.target.checked ? "all" : "mine" })}
            />
            Every Clip (admin)
          </label>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive">
          {error instanceof Error ? error.message : "Could not load Clips"}
        </p>
      ) : null}

      {isLoading && !error ? <p>Loading Clips…</p> : null}

      {!isLoading && !error && data?.clips.length === 0 ? (
        <p>{emptyClipsNotice(filters.scope)}</p>
      ) : null}

      {data && data.clips.length > 0 ? (
        <ul className="space-y-2">
          {data.clips.map((clip) => (
            <li key={clip.id}>
              <Link
                className="font-semibold text-emerald-800 underline"
                to={clipDeskPath(clip.id)}
              >
                {clip.id}
              </Link>
              <span className="text-stone-600"> — {clip.frame_count} Frames</span>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
