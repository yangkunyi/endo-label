import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  frameJpegPath,
  framePhaseName,
  getJson,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  sendJson,
  vocabListPath,
  vocabPath,
  type ClipMeta,
  type PhaseDoc,
  type Vocab,
} from "./api";
import { useDeskStore } from "./deskStore";

export function ClipDesk() {
  const { clipId } = useParams();
  const { data, error, isLoading } = useSWR(
    clipId ? `/api/clips/${encodeURIComponent(clipId)}` : null,
    getJson<ClipMeta>,
  );
  const { data: phaseDoc, mutate: mutatePhase } = useSWR(
    clipId ? phaseClipPath(clipId) : null,
    getJson<PhaseDoc>,
  );
  const { data: vocab, mutate: mutateVocab } = useSWR(
    vocabPath(),
    getJson<Vocab>,
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
          const phaseName = framePhaseName(phaseDoc?.frames ?? {}, frame.index);
          return (
            <button
              key={frame.index}
              type="button"
              aria-current={current ? "true" : undefined}
              aria-label={
                phaseName
                  ? `Frame ${frame.index} ${phaseName}`
                  : `Frame ${frame.index} unlabeled`
              }
              className={`min-w-20 shrink-0 rounded border bg-white p-1 text-left text-xs ${
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
              <span className="block">{frame.index}</span>
              <span className="block truncate text-stone-600">
                {phaseName ?? ""}
              </span>
            </button>
          );
        })}
      </div>
      <PhasePanel
        key={data.id}
        clipId={data.id}
        frameIndex={frameIndex}
        frameCount={data.frame_count}
        phaseFrames={phaseDoc?.frames ?? {}}
        phases={vocab?.phases ?? []}
        mutatePhase={mutatePhase}
        mutateVocab={mutateVocab}
      />
    </main>
  );
}

function PhasePanel({
  clipId,
  frameIndex,
  frameCount,
  phaseFrames,
  phases,
  mutatePhase,
  mutateVocab,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [phaseName, setPhaseName] = useState("");
  const [fromText, setFromText] = useState("0");
  const [toText, setToText] = useState("0");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = phases.includes(phaseName) ? phaseName : (phases[0] ?? "");
  const currentPhase = framePhaseName(phaseFrames, frameIndex);

  async function run(op: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">phase</h2>
      <p className="mb-3 text-stone-600">
        This Frame: {currentPhase ?? "unlabeled"}
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          phase
          <select
            className="ml-1 border border-stone-300 bg-white p-1"
            value={selected}
            onChange={(e) => setPhaseName(e.target.value)}
            disabled={!phases.length || busy}
          >
            {phases.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          from
          <input
            className="ml-1 w-16 border border-stone-300 bg-white p-1"
            type="number"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={fromText}
            onChange={(e) => setFromText(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="text-sm">
          to
          <input
            className="ml-1 w-16 border border-stone-300 bg-white p-1"
            type="number"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={toText}
            onChange={(e) => setToText(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="rounded bg-emerald-800 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={busy || !selected || frameCount <= 0}
          onClick={() =>
            run(async () => {
              const doc = await sendJson<PhaseDoc>(
                phaseSpanPath(clipId),
                "POST",
                {
                  phase: selected,
                  from: Number(fromText),
                  to: Number(toText),
                },
              );
              await mutatePhase(doc, { revalidate: false });
            })
          }
        >
          Write span
        </button>
        <button
          type="button"
          className="rounded border border-stone-400 bg-white px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy || frameCount <= 0}
          onClick={() =>
            run(async () => {
              const doc = await sendJson<PhaseDoc>(
                phaseFramePath(clipId, frameIndex),
                "PUT",
                { phase: null },
              );
              await mutatePhase(doc, { revalidate: false });
            })
          }
        >
          Clear this Frame&apos;s phase
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          new phase name
          <input
            className="ml-1 border border-stone-300 bg-white p-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="rounded border border-stone-400 bg-white px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const created = await sendJson<Vocab>(
                vocabListPath("phases"),
                "POST",
                { name: newName },
              );
              setNewName("");
              await mutateVocab(created, { revalidate: false });
              const added = created.phases[created.phases.length - 1];
              if (added) {
                setPhaseName(added);
              }
            })
          }
        >
          Add phase name
        </button>
      </div>
      {error ? <p className="mt-2 text-red-800">{error}</p> : null}
    </section>
  );
}
