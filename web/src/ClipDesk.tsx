import { useLayoutEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  classClipPath,
  classFramePath,
  frameClassTags,
  frameJpegPath,
  framePhaseName,
  frameTripletRows,
  getJson,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  sendJson,
  toggleClassTag,
  tripletClipPath,
  tripletFramePath,
  tripletRowPath,
  vocabListPath,
  vocabPath,
  type ClassDoc,
  type ClipMeta,
  type PhaseDoc,
  type TripletDoc,
  type TripletRow,
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
  const { data: classDoc, mutate: mutateClass } = useSWR(
    clipId ? classClipPath(clipId) : null,
    getJson<ClassDoc>,
  );
  const { data: tripletDoc, mutate: mutateTriplet } = useSWR(
    clipId ? tripletClipPath(clipId) : null,
    getJson<TripletDoc>,
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

  useLayoutEffect(() => {
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
    <main className="flex h-screen flex-col overflow-hidden bg-stone-100 text-stone-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-300 px-3 py-2">
        <Link className="text-sm text-emerald-800 underline" to="/">
          Clips
        </Link>
        <h1 className="text-sm font-semibold">{data.id}</h1>
        <p className="text-sm text-stone-600">
          Frame {frameIndex}
          {data.frame_count > 0 ? ` of ${data.frame_count}` : ""}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Frames"
          className="flex w-28 shrink-0 flex-col gap-1 overflow-y-auto border-r border-stone-300 p-1"
        >
          {/* ponytail: every thumb in the rail; virtualize when long Clips jank */}
          {data.frames.map((frame) => {
            const current = frame.index === frameIndex;
            const phaseName = framePhaseName(
              phaseDoc?.frames ?? {},
              frame.index,
            );
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
                className={`w-full rounded border bg-white p-1 text-left text-xs ${
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
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-black">
          {data.frame_count > 0 ? (
            <img
              className="h-full w-full object-contain"
              src={frameJpegPath(data.id, frameIndex)}
              alt={`Frame ${frameIndex}`}
            />
          ) : (
            <p className="text-stone-100">This Clip has no Frames.</p>
          )}
        </div>
        <div className="flex w-[26rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-stone-300 p-3">
          <ClassPanel
            key={data.id}
            clipId={data.id}
            frameIndex={frameIndex}
            frameCount={data.frame_count}
            classFrames={classDoc?.frames ?? {}}
            classTags={vocab?.class_tags ?? []}
            mutateClass={mutateClass}
            mutateVocab={mutateVocab}
          />
          <TripletPanel
            key={`${data.id}-triplet`}
            clipId={data.id}
            frameIndex={frameIndex}
            frameCount={data.frame_count}
            tripletFrames={tripletDoc?.frames ?? {}}
            instruments={vocab?.instruments ?? []}
            verbs={vocab?.verbs ?? []}
            targets={vocab?.targets ?? []}
            mutateTriplet={mutateTriplet}
            mutateVocab={mutateVocab}
          />
          <PhasePanel
            key={`${data.id}-phase`}
            clipId={data.id}
            frameIndex={frameIndex}
            frameCount={data.frame_count}
            phaseFrames={phaseDoc?.frames ?? {}}
            phases={vocab?.phases ?? []}
            mutatePhase={mutatePhase}
            mutateVocab={mutateVocab}
          />
        </div>
      </div>
    </main>
  );
}

function EditorCard({
  title,
  open,
  onToggle,
  summary,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  summary: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded border border-stone-300 bg-white p-2">
      <h2 className="mb-2 text-lg font-semibold">
        <button
          type="button"
          aria-expanded={open}
          className="flex items-center gap-1"
          onClick={onToggle}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          {title}
        </button>
      </h2>
      {summary}
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
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
  const phaseForm = useDeskStore((s) => s.phaseForm);
  const togglePhaseForm = useDeskStore((s) => s.togglePhaseForm);

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
    <EditorCard
      title="phase"
      open={phaseForm}
      onToggle={togglePhaseForm}
      summary={
        <>
          <p className="mb-2 text-stone-600">
            This Frame: {currentPhase ?? "unlabeled"}
          </p>
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
          {error ? <p className="mt-2 text-red-800">{error}</p> : null}
        </>
      }
    >
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
      </div>
      <details>
        <summary className="cursor-pointer text-sm">new phase name</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
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
            disabled={busy || !newName.trim()}
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
      </details>
    </EditorCard>
  );
}

function ClassPanel({
  clipId,
  frameIndex,
  frameCount,
  classFrames,
  classTags,
  mutateClass,
  mutateVocab,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = frameClassTags(classFrames, frameIndex);
  const classBody = useDeskStore((s) => s.classBody);
  const toggleClassBody = useDeskStore((s) => s.toggleClassBody);

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
    <EditorCard
      title="class"
      open={classBody}
      onToggle={toggleClassBody}
      summary={
        <>
          <p className="mb-2 text-stone-600">
            This Frame: {current.length ? current.join(", ") : "unlabeled"}
          </p>
          <div className="flex flex-wrap gap-2">
            {classTags.map((name) => {
              const on = current.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${
                    on
                      ? "border-emerald-700 bg-emerald-800 text-white"
                      : "border-stone-400 bg-white"
                  }`}
                  disabled={busy || frameCount <= 0}
                  onClick={() =>
                    run(async () => {
                      const doc = await sendJson<ClassDoc>(
                        classFramePath(clipId, frameIndex),
                        "PUT",
                        { tags: toggleClassTag(current, name) },
                      );
                      await mutateClass(doc, { revalidate: false });
                    })
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-2 text-red-800">{error}</p> : null}
        </>
      }
    >
      <details>
        <summary className="cursor-pointer text-sm">new class name</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            new class name
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
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(async () => {
                const created = await sendJson<Vocab>(
                  vocabListPath("class_tags"),
                  "POST",
                  { name: newName },
                );
                setNewName("");
                await mutateVocab(created, { revalidate: false });
              })
            }
          >
            Add class name
          </button>
        </div>
      </details>
    </EditorCard>
  );
}

function TripletPanel({
  clipId,
  frameIndex,
  frameCount,
  tripletFrames,
  instruments,
  verbs,
  targets,
  mutateTriplet,
  mutateVocab,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  instruments: string[];
  verbs: string[];
  targets: string[];
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [instrument, setInstrument] = useState("");
  const [verb, setVerb] = useState("");
  const [target, setTarget] = useState("");
  const [newInstrument, setNewInstrument] = useState("");
  const [newVerb, setNewVerb] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedInstrument = instruments.includes(instrument)
    ? instrument
    : (instruments[0] ?? "");
  const selectedVerb = verbs.includes(verb) ? verb : (verbs[0] ?? "");
  const selectedTarget = targets.includes(target) ? target : (targets[0] ?? "");
  const current = frameTripletRows(tripletFrames, frameIndex);
  const tripletForm = useDeskStore((s) => s.tripletForm);
  const toggleTripletForm = useDeskStore((s) => s.toggleTripletForm);

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

  function addVocabName(
    listName: "instruments" | "verbs" | "targets",
    name: string,
    clear: () => void,
    pick: (added: string) => void,
  ) {
    return run(async () => {
      const created = await sendJson<Vocab>(vocabListPath(listName), "POST", {
        name,
      });
      clear();
      await mutateVocab(created, { revalidate: false });
      const added = created[listName][created[listName].length - 1];
      if (added) {
        pick(added);
      }
    });
  }

  return (
    <EditorCard
      title="triplet"
      open={tripletForm}
      onToggle={toggleTripletForm}
      summary={
        <>
          <p className="mb-2 text-stone-600">
            This Frame:{" "}
            {current.length ? `${current.length} row(s)` : "unlabeled"}
          </p>
          <ul className="space-y-1">
            {current.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span>
                  #{row.id} {row.instrument} / {row.verb} / {row.target}
                </span>
                <button
                  type="button"
                  className="rounded border border-stone-400 bg-white px-2 py-0.5 text-sm disabled:opacity-50"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const doc = await sendJson<TripletDoc>(
                        tripletRowPath(clipId, frameIndex, row.id),
                        "DELETE",
                      );
                      await mutateTriplet(doc, { revalidate: false });
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-red-800">{error}</p> : null}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          instrument
          <select
            className="ml-1 border border-stone-300 bg-white p-1"
            value={selectedInstrument}
            onChange={(e) => setInstrument(e.target.value)}
            disabled={!instruments.length || busy}
          >
            {instruments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          verb
          <select
            className="ml-1 border border-stone-300 bg-white p-1"
            value={selectedVerb}
            onChange={(e) => setVerb(e.target.value)}
            disabled={!verbs.length || busy}
          >
            {verbs.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          target
          <select
            className="ml-1 border border-stone-300 bg-white p-1"
            value={selectedTarget}
            onChange={(e) => setTarget(e.target.value)}
            disabled={!targets.length || busy}
          >
            {targets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-emerald-800 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={
            busy ||
            frameCount <= 0 ||
            !selectedInstrument ||
            !selectedVerb ||
            !selectedTarget
          }
          onClick={() =>
            run(async () => {
              await sendJson<TripletRow>(
                tripletFramePath(clipId, frameIndex),
                "POST",
                {
                  instrument: selectedInstrument,
                  verb: selectedVerb,
                  target: selectedTarget,
                },
              );
              await mutateTriplet();
            })
          }
        >
          Add row
        </button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">new names</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            new instrument
            <input
              className="ml-1 border border-stone-300 bg-white p-1"
              value={newInstrument}
              onChange={(e) => setNewInstrument(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="rounded border border-stone-400 bg-white px-3 py-1 text-sm disabled:opacity-50"
            disabled={busy || !newInstrument.trim()}
            onClick={() =>
              addVocabName(
                "instruments",
                newInstrument,
                () => setNewInstrument(""),
                setInstrument,
              )
            }
          >
            Add instrument
          </button>
          <label className="text-sm">
            new verb
            <input
              className="ml-1 border border-stone-300 bg-white p-1"
              value={newVerb}
              onChange={(e) => setNewVerb(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="rounded border border-stone-400 bg-white px-3 py-1 text-sm disabled:opacity-50"
            disabled={busy || !newVerb.trim()}
            onClick={() =>
              addVocabName("verbs", newVerb, () => setNewVerb(""), setVerb)
            }
          >
            Add verb
          </button>
          <label className="text-sm">
            new target
            <input
              className="ml-1 border border-stone-300 bg-white p-1"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="rounded border border-stone-400 bg-white px-3 py-1 text-sm disabled:opacity-50"
            disabled={busy || !newTarget.trim()}
            onClick={() =>
              addVocabName(
                "targets",
                newTarget,
                () => setNewTarget(""),
                setTarget,
              )
            }
          >
            Add target
          </button>
        </div>
      </details>
    </EditorCard>
  );
}
