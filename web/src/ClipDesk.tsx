import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { frameJpegPath, getJson, type ClipMeta } from "./api";
import { useDeskStore } from "./deskStore";

export function ClipDesk() {
  const { clipId } = useParams();
  const { data, error, isLoading } = useSWR(
    clipId ? `/api/clips/${encodeURIComponent(clipId)}` : null,
    getJson<ClipMeta>,
  );
  const storedClipId = useDeskStore((s) => s.clipId);
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const frameIndex = storedClipId === clipId ? storedIndex : 0;

  useEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  if (!clipId) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>
          <Link className="text-emerald-800 underline" to="/">
            Clips
          </Link>
        </p>
        <p>Clip not found.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>
          <Link className="text-emerald-800 underline" to="/">
            Clips
          </Link>
        </p>
        <h1 className="mb-3 mt-3 text-xl font-semibold">{clipId}</h1>
        <p>{error instanceof Error ? error.message : "Clip not found"}</p>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>
          <Link className="text-emerald-800 underline" to="/">
            Clips
          </Link>
        </p>
        <p>Loading Clip…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <p>
        <Link className="text-emerald-800 underline" to="/">
          Clips
        </Link>
      </p>
      <h1 className="mb-1 mt-3 text-xl font-semibold">{data.id}</h1>
      <p className="mb-4 text-stone-600">
        Frame {frameIndex}
        {data.frame_count > 0 ? ` of ${data.frame_count}` : ""}
      </p>
      {data.frame_count > 0 ? (
        <img
          className="mb-4 max-h-[70vh] w-auto max-w-full border border-stone-300 bg-black"
          src={frameJpegPath(data.id, frameIndex)}
          alt={`Frame ${frameIndex}`}
        />
      ) : (
        <p className="mb-4">This Clip has no Frames.</p>
      )}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {data.frames.map((frame) => {
          const current = frame.index === frameIndex;
          return (
            <button
              key={frame.index}
              type="button"
              aria-current={current ? "true" : undefined}
              aria-label={`Frame ${frame.index}`}
              className={`min-w-16 shrink-0 rounded border bg-white p-1 text-left text-xs ${
                current
                  ? "border-emerald-700 ring-2 ring-emerald-700"
                  : "border-stone-300"
              }`}
              onClick={() => scrub(frame.index)}
            >
              <img
                className="mb-1 h-12 w-full object-cover"
                src={frameJpegPath(data.id, frame.index)}
                alt=""
              />
              {frame.index}
            </button>
          );
        })}
      </div>
    </main>
  );
}
