import { Link } from "react-router-dom";
import useSWR from "swr";
import { clipDeskPath, clipsPath, getJson, type ClipListResponse } from "../api";
import { emptyClipsNotice } from "../clipFilters";
import { useClipFilters } from "../useClipFilters";

/**
 * The left rail: the Clips this Account may see, the focused one marked as
 * current.
 *
 * It reads the Clips page's own selection (Project, tag, scope) instead of a
 * second one, so the rail and the page can never disagree about the list; a
 * refusal the server really does send still shows its sentence here.
 *
 * The rail is a surface of that selection, not only a reader of it: a stored
 * scope this Account may not hold is corrected here — the same read the page
 * makes, on the one screen a labeler stays on — and an admin may change it here
 * rather than go back to the Clips directory for the toggle. A change is a patch
 * of the corrected selection the rail renders, so the scope the correction just
 * dropped cannot come back through the toggle; the sentence about that stored
 * scope stays above the list until the change is made.
 */
export function ClipRail({ activeClipId, width }: { activeClipId: string | undefined; width: number }) {
  const { filters, notice, canChooseScope, choose } = useClipFilters();
  const { data, error, isLoading } = useSWR(
    clipsPath(filters),
    getJson<ClipListResponse>,
  );

  return (
    <nav
      aria-label="Clips"
      className="flex shrink-0 flex-col overflow-y-auto border-r border-border bg-card"
      style={{ width }}
    >
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clips</p>
        {canChooseScope ? (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
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
      {notice ? (
        <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{notice}</p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {isLoading ? <p className="p-2 text-sm text-muted-foreground">Loading Clips…</p> : null}
        {error ? (
          <p className="p-2 text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load Clips"}
          </p>
        ) : null}
        {!isLoading && !error && data?.clips.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">{emptyClipsNotice(filters.scope)}</p>
        ) : null}
        {data?.clips.map((clip) => (
          <Link
            key={clip.id}
            to={clipDeskPath(clip.id)}
            aria-current={clip.id === activeClipId ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${clip.id === activeClipId ? "bg-primary/15 font-semibold text-foreground" : "text-foreground hover:bg-secondary"}`}
          >
            <span className="truncate">{clip.id}</span>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">{clip.frame_count} Frames</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
