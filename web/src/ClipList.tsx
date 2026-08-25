import { Link } from "react-router-dom";
import useSWR from "swr";
import { clipDeskPath, getJson, type ClipListResponse } from "./api";

export function ClipList() {
  const { data, error, isLoading } = useSWR(
    "/api/clips",
    getJson<ClipListResponse>,
  );

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-3 text-xl font-semibold">Clips</h1>
        <p>{error instanceof Error ? error.message : "Could not load Clips"}</p>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-3 text-xl font-semibold">Clips</h1>
        <p>Loading Clips…</p>
      </main>
    );
  }

  if (data.clips.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-3 text-xl font-semibold">Clips</h1>
        <p>No Clips on the allowlist.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-3 text-xl font-semibold">Clips</h1>
      <p className="mb-4 text-stone-600">
        Open a Clip to label phase, class, and triplet on the same Frame.
      </p>
      <ul className="space-y-2">
        {data.clips.map((clip) => (
          <li key={clip.id}>
            <Link
              className="font-semibold text-emerald-800 underline"
              to={clipDeskPath(clip.id)}
            >
              {clip.id}
            </Link>
            <span className="text-stone-600">
              {" "}
              — {clip.frame_count} Frames
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
