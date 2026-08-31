import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Pause, Play, Trash2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
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
  tripletSpanPath,
  vocabDeletePath,
  vocabListPath,
  vocabPath,
  vocabRenamePath,
  type ClassDoc,
  type ClipListResponse,
  type ClipMeta,
  type PhaseDoc,
  type TripletDoc,
  type Vocab,
} from "./api";
import { Button } from "./components/ui/button";
import { Combobox } from "./components/ui/combobox";
import { Input } from "./components/ui/input";
import { useDeskStore, type PaintChip } from "./deskStore";

type PlaybackRate = 0.5 | 1 | 2;

type PlaybackSettings = {
  rate: PlaybackRate;
};

const CLOCK_FPS = 25;
const PLAYBACK_STORAGE_KEY = "endo_label:desk-player-rate";
const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = { rate: 1 };

function readPlaybackSettings(): PlaybackSettings {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(PLAYBACK_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PLAYBACK_SETTINGS;
    }
    const value = JSON.parse(raw) as Partial<PlaybackSettings>;
    const rate = value.rate === 0.5 || value.rate === 2 ? value.rate : 1;
    return { rate };
  } catch {
    return DEFAULT_PLAYBACK_SETTINGS;
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function jpegClock(frameIndex: number, frameCount: number): string {
  return `${formatClock(frameIndex / CLOCK_FPS)} / ${formatClock(Math.max(0, frameCount) / CLOCK_FPS)}`;
}

function savePlaybackSettings(settings: PlaybackSettings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PLAYBACK_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
    return true;
  }
  return Boolean(target.closest('[role="textbox"], [role="combobox"], [role="searchbox"]'));
}

function chipLabel(chip: PaintChip): string {
  if (chip.kind === "class") {
    return `class: ${chip.name}`;
  }
  if (chip.kind === "phase") {
    return `phase: ${chip.name}`;
  }
  return `triplet: ${chip.instrument} / ${chip.verb} / ${chip.target}`;
}

function rangeEnds(fromIndex: number | null, currentIndex: number): { from: number; to: number } {
  const start = fromIndex == null ? currentIndex : fromIndex;
  return { from: Math.min(start, currentIndex), to: Math.max(start, currentIndex) };
}

function sliderFillStyle(fromIndex: number | null, currentIndex: number, lastIndex: number): { left: string; width: string } {
  if (fromIndex == null || lastIndex <= 0) {
    return { left: "0%", width: "0%" };
  }
  const { from, to } = rangeEnds(fromIndex, currentIndex);
  return {
    left: `${(from / lastIndex) * 100}%`,
    width: `${Math.max(((to - from) / lastIndex) * 100, 2)}%`,
  };
}

async function ensureVocabName(
  listName: string,
  raw: string,
  names: string[],
  mutateVocab: KeyedMutator<Vocab>,
): Promise<string | null> {
  const name = raw.trim();
  if (!name) {
    return null;
  }
  if (names.includes(name)) {
    return name;
  }
  const next = await sendJson<Vocab>(vocabListPath(listName), "POST", { name });
  await mutateVocab(next, { revalidate: false });
  return name;
}

function ResizeHandle({
  label,
  direction,
  value,
  onResize,
  reverse = false,
}: {
  label: string;
  direction: "horizontal" | "vertical";
  value: number;
  onResize: (value: number) => void;
  reverse?: boolean;
}) {
  const start = useRef<{ coordinate: number; value: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    start.current = {
      coordinate: direction === "horizontal" ? event.clientX : event.clientY,
      value,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) {
      return;
    }
    const coordinate = direction === "horizontal" ? event.clientX : event.clientY;
    const delta = coordinate - start.current.coordinate;
    onResize(start.current.value + (reverse ? -delta : delta));
  }

  function stopResize() {
    start.current = null;
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={direction}
      className={direction === "horizontal" ? "w-1 shrink-0 cursor-col-resize bg-border hover:bg-ring" : "h-1 shrink-0 cursor-row-resize bg-border hover:bg-ring"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
    />
  );
}

export function ClipDesk() {
  const { clipId } = useParams();
  const {
    data: clipList,
    error: clipListError,
    isLoading: clipsLoading,
  } = useSWR("/api/clips", getJson<ClipListResponse>);
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
  const { data: vocab, mutate: mutateVocab } = useSWR(vocabPath(), getJson<Vocab>);
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const paintChip = useDeskStore((s) => s.paintChip);
  const setPaintChip = useDeskStore((s) => s.setPaintChip);
  const [playing, setPlaying] = useState(false);
  const [playback, setPlayback] = useState<PlaybackSettings>(() => readPlaybackSettings());
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [sliderFlash, setSliderFlash] = useState<{ from: number; to: number } | null>(null);
  const spanBusy = useRef(false);

  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;

  useEffect(() => {
    savePlaybackSettings(playback);
  }, [playback]);

  const togglePlayback = useCallback(() => {
    setPlaying((current) => !current);
  }, []);

  useEffect(() => {
    if (!playing || !data || data.frame_count <= 0) {
      return;
    }
    const last = data.frame_count - 1;
    if (frameIndex >= last) {
      setPlaying(false);
      return;
    }
    const delay = Math.max(1, Math.round(1000 / (CLOCK_FPS * playback.rate)));
    const id = window.setTimeout(() => {
      const next = frameIndex + 1;
      if (next >= last) {
        scrub(last);
        setPlaying(false);
        return;
      }
      scrub(next);
    }, delay);
    return () => window.clearTimeout(id);
  }, [data, frameIndex, playback.rate, playing, scrub]);

  const markedFrom = spanStart && spanStart.clipId === clipId ? spanStart.frameIndex : null;
  const { from: rangeFrom, to: rangeTo } = rangeEnds(markedFrom, frameIndex);
  const hasChip = Boolean(paintChip);

  const applyRange = useCallback(async (remove: boolean) => {
    if (!clipId || !data || !paintChip || spanBusy.current) {
      return;
    }
    spanBusy.current = true;
    setToast(null);
    try {
      if (paintChip.kind === "phase") {
        const doc = await sendJson<PhaseDoc>(phaseSpanPath(clipId), "POST", {
          phase: remove ? null : paintChip.name,
          from: rangeFrom,
          to: rangeTo,
        });
        await mutatePhase(doc, { revalidate: false });
      } else if (paintChip.kind === "class") {
        const doc = await sendJson<ClassDoc>(classSpanPath(clipId), "POST", {
          tag: paintChip.name,
          from: rangeFrom,
          to: rangeTo,
          on: !remove,
        });
        await mutateClass(doc, { revalidate: false });
      } else {
        const doc = await sendJson<TripletDoc>(tripletSpanPath(clipId), "POST", {
          instrument: paintChip.instrument,
          verb: paintChip.verb,
          target: paintChip.target,
          from: rangeFrom,
          to: rangeTo,
          op: remove ? "remove" : "add",
        });
        await mutateTriplet(doc, { revalidate: false });
      }
      setPlaying(false);
      setSliderFlash({ from: rangeFrom, to: rangeTo });
      setSpanStart(null);
      window.setTimeout(() => setSliderFlash(null), 700);
      setToast({
        text: `${remove ? "Removed" : "Wrote"} ${chipLabel(paintChip)} on frames ${rangeFrom}–${rangeTo}`,
        error: false,
      });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    } finally {
      spanBusy.current = false;
    }
  }, [clipId, data, mutateClass, mutatePhase, mutateTriplet, paintChip, rangeFrom, rangeTo, setSpanStart]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === " " && clipId && data && data.frame_count > 0) {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (!clipId || !data || data.frame_count <= 0 || !paintChip) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "[" || key === "i") {
        event.preventDefault();
        setSpanStart({ clipId, frameIndex });
        return;
      }
      if (key === "]" || key === "o") {
        event.preventDefault();
        void applyRange(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [applyRange, clipId, data, frameIndex, paintChip, setSpanStart, togglePlayback]);

  useLayoutEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-wide">endo_label</span>
        <span className="text-muted-foreground" aria-hidden="true">/</span>
        <h1 className="text-sm font-semibold">{data?.id ?? "Workbench"}</h1>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Clips"
          className="flex shrink-0 flex-col overflow-y-auto border-r border-border bg-card"
          style={{ width: layout.clipRailWidth }}
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clips</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {clipsLoading ? <p className="p-2 text-sm text-muted-foreground">Loading Clips…</p> : null}
            {clipListError ? <p className="p-2 text-sm text-destructive">Could not load Clips</p> : null}
            {!clipsLoading && !clipListError && clipList?.clips.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No Clips on the allowlist.</p> : null}
            {clipList?.clips.map((clip) => (
              <Link
                key={clip.id}
                to={clipDeskPath(clip.id)}
                aria-current={clip.id === clipId ? "page" : undefined}
                className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm ${clip.id === clipId ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-secondary"}`}
              >
                <span className="truncate">{clip.id}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{clip.frame_count} Frames</span>
              </Link>
            ))}
          </div>
        </nav>
        <ResizeHandle
          label="Resize Clip rail"
          direction="horizontal"
          value={layout.clipRailWidth}
          onResize={(value) => setLayout({ clipRailWidth: value })}
        />
        <section aria-label="Player" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {error ? (
              <div className="p-6 text-center"><h2 className="mb-2 text-lg font-semibold">{clipId}</h2><p>{error instanceof Error ? error.message : "Clip not found"}</p></div>
            ) : isLoading ? (
              <p>Loading Clip…</p>
            ) : data?.frame_count ? (
              <img
                className="h-full w-full object-contain"
                src={frameJpegPath(data.id, frameIndex)}
                alt={`Frame ${frameIndex}`}
              />
            ) : data ? (
              <p>This Clip has no Frames.</p>
            ) : (
              <div className="p-6 text-center"><h2 className="mb-2 text-xl font-semibold">Choose a Clip</h2><p className="text-muted-foreground">Select a Clip from the left rail to begin labeling.</p></div>
            )}
          </div>
          {data?.frame_count ? (
            <p data-player-clock="" className="pointer-events-none absolute right-3 top-3 text-sm tabular-nums text-white">
              {jpegClock(frameIndex, data.frame_count)}
            </p>
          ) : null}
        </section>
        <ResizeHandle
          label="Resize editor rail"
          direction="horizontal"
          value={layout.editorRailWidth}
          reverse
          onResize={(value) => setLayout({ editorRailWidth: value })}
        />
        <div
          role="region"
          aria-label="Editors"
          className="flex shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-l border-border p-2"
          style={{ width: layout.editorRailWidth }}
        >
          {data ? (
            <>
              <ClassEditor
                clipId={data.id}
                frameIndex={frameIndex}
                frameCount={data.frame_count}
                classFrames={classDoc?.frames ?? {}}
                classTags={vocab?.class_tags ?? []}
                mutateClass={mutateClass}
                mutateVocab={mutateVocab}
                onPaint={setPaintChip}
              />
              <TripletEditor
                clipId={data.id}
                frameIndex={frameIndex}
                frameCount={data.frame_count}
                tripletFrames={tripletDoc?.frames ?? {}}
                instruments={vocab?.instruments ?? []}
                verbs={vocab?.verbs ?? []}
                targets={vocab?.targets ?? []}
                mutateTriplet={mutateTriplet}
                mutateVocab={mutateVocab}
                onPaint={setPaintChip}
              />
              <PhaseEditor
                clipId={data.id}
                frameIndex={frameIndex}
                frameCount={data.frame_count}
                phaseFrames={phaseDoc?.frames ?? {}}
                phases={vocab?.phases ?? []}
                mutatePhase={mutatePhase}
                mutateVocab={mutateVocab}
                onPaint={setPaintChip}
              />
            </>
          ) : (
            (["class", "triplet", "phase"] as const).map((title) => (
              <div key={title} data-editor-card={title}>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">Choose a Clip to edit this Task type.</p>
              </div>
            ))
          )}
        </div>
      </div>
      <ResizeHandle
        label="Resize Frame controls"
        direction="vertical"
        value={layout.bottomBarHeight}
        reverse
        onResize={(value) => setLayout({ bottomBarHeight: value })}
      />
      <footer aria-label="Player controls" className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-border bg-card px-4 py-2" style={{ height: layout.bottomBarHeight }}>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={playing ? "Pause" : "Play"}
          disabled={!data || data.frame_count <= 0 || (!playing && frameIndex >= data.frame_count - 1)}
          onClick={togglePlayback}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <label className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">rate</span>
          <select
            aria-label="Playback rate"
            className="h-8 rounded-md border border-input bg-background px-1 text-sm"
            value={playback.rate}
            onChange={(event) => {
              const rate = Number(event.target.value);
              if (rate === 0.5 || rate === 1 || rate === 2) {
                setPlayback({ rate });
              }
            }}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <div className="relative min-w-40 flex-1">
          {(markedFrom != null || sliderFlash) && data && data.frame_count > 1 ? (
            <span
              aria-hidden
              data-span-fill=""
              data-span-flash={sliderFlash ? "true" : undefined}
              className={`pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${sliderFlash ? "bg-primary" : "bg-primary/40"}`}
              style={sliderFillStyle(
                sliderFlash ? sliderFlash.from : markedFrom,
                sliderFlash ? sliderFlash.to : frameIndex,
                Math.max(0, data.frame_count - 1),
              )}
            />
          ) : null}
          <input
            type="range"
            aria-label="Seek"
            className="relative w-full accent-primary"
            min={0}
            max={Math.max(0, (data?.frame_count ?? 0) - 1)}
            step={1}
            value={data?.frame_count ? frameIndex : 0}
            disabled={!data || data.frame_count <= 0}
            onChange={(event) => scrub(Number(event.target.value))}
          />
        </div>
        <output className="shrink-0 text-sm tabular-nums" data-player-clock-bar="">
          {data ? jpegClock(frameIndex, data.frame_count) : "0:00 / 0:00"}
        </output>
        <output className="w-24 shrink-0 text-right text-xs text-muted-foreground">{data ? `Frame ${frameIndex} of ${data.frame_count}` : "No Clip"}</output>
        {markedFrom != null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rangeFrom} → {rangeTo}</span>
        ) : null}
        <span data-paint-chip="" className="max-w-48 truncate text-xs font-medium">
          {paintChip ? chipLabel(paintChip) : "No paint chip"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasChip || !clipId}
          onClick={() => {
            if (clipId && paintChip) {
              setSpanStart({ clipId, frameIndex });
            }
          }}
        >
          Mark from
        </Button>
        <Button type="button" size="sm" disabled={!hasChip} onClick={() => void applyRange(false)}>
          Apply to frames {rangeFrom}–{rangeTo}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!hasChip} onClick={() => void applyRange(true)}>
          Remove from frames {rangeFrom}–{rangeTo}
        </Button>
        {toast ? (
          <span role={toast.error ? "alert" : "status"} className={toast.error ? "text-xs text-destructive" : "text-xs text-foreground"}>
            {toast.text}
          </span>
        ) : null}
      </footer>
    </main>
  );
}

function VocabList({
  title,
  names,
  listName,
  renameLabel,
  deleteLabel,
  canRename,
  mutateVocab,
  onAfterChange,
  alwaysOpen = false,
}: {
  title: string;
  names: string[];
  listName: string;
  renameLabel: string;
  deleteLabel: (name: string) => string;
  canRename: boolean;
  mutateVocab: KeyedMutator<Vocab>;
  onAfterChange?: () => Promise<void>;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(op: () => Promise<void>) {
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  const shown = alwaysOpen || open;
  return (
    <div className={alwaysOpen ? "" : "mt-2"}>
      {alwaysOpen ? null : (
        <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          List
        </Button>
      )}
      {shown ? (
        <ul aria-label={title} className="mt-1 space-y-1">
          {names.map((name) => (
            <li key={name} className="flex items-center gap-1 text-sm">
              {renameFrom === name ? (
                <Input
                  aria-label={renameLabel}
                  value={renameDraft}
                  autoFocus
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => setRenameFrom(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const from = renameFrom;
                      const to = renameDraft.trim();
                      setRenameFrom(null);
                      if (!from || to === from) {
                        return;
                      }
                      void run(async () => {
                        const next = await sendJson<Vocab>(vocabRenamePath(listName), "POST", { from, to });
                        await mutateVocab(next, { revalidate: false });
                        await onAfterChange?.();
                      });
                    }
                    if (event.key === "Escape") {
                      setRenameFrom(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onDoubleClick={() => {
                    if (!canRename) {
                      return;
                    }
                    setRenameFrom(name);
                    setRenameDraft(name);
                  }}
                >
                  {name}
                </button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={deleteLabel(name)}
                onClick={() => {
                  void run(async () => {
                    const next = await sendJson<Vocab>(vocabDeletePath(listName, name), "DELETE");
                    await mutateVocab(next, { revalidate: false });
                    await onAfterChange?.();
                  });
                }}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function TripletVocabLists({
  instruments,
  verbs,
  targets,
  mutateVocab,
}: {
  instruments: string[];
  verbs: string[];
  targets: string[];
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        List
      </Button>
      {open ? (
        <div className="mt-1 space-y-2">
          <VocabList
            title="instrument names"
            names={instruments}
            listName="instruments"
            renameLabel="Rename instrument"
            deleteLabel={(name) => `Delete instrument ${name}`}
            canRename={false}
            mutateVocab={mutateVocab}
            alwaysOpen
          />
          <VocabList
            title="verb names"
            names={verbs}
            listName="verbs"
            renameLabel="Rename verb"
            deleteLabel={(name) => `Delete verb ${name}`}
            canRename={false}
            mutateVocab={mutateVocab}
            alwaysOpen
          />
          <VocabList
            title="target names"
            names={targets}
            listName="targets"
            renameLabel="Rename target"
            deleteLabel={(name) => `Delete target ${name}`}
            canRename={false}
            mutateVocab={mutateVocab}
            alwaysOpen
          />
        </div>
      ) : null}
    </div>
  );
}

function ClassEditor({
  clipId,
  frameIndex,
  frameCount,
  classFrames,
  classTags,
  mutateClass,
  mutateVocab,
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = frameClassTags(classFrames, frameIndex);

  async function writeTags(tags: string[], painted?: { name: string; on: boolean }) {
    setError(null);
    try {
      const doc = await sendJson<ClassDoc>(classFramePath(clipId, frameIndex), "PUT", { tags });
      await mutateClass(doc, { revalidate: false });
      if (painted) {
        onPaint(painted.on ? { kind: "class", name: painted.name } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="class" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">class</h2>
      <Combobox
        ariaLabel="class"
        names={classTags}
        disabled={frameCount <= 0}
        onCommit={async (raw) => {
          const name = await ensureVocabName("class_tags", raw, classTags, mutateVocab);
          if (!name || frameCount <= 0) {
            return;
          }
          const on = !current.includes(name);
          await writeTags(toggleClassTag(current, name), { name, on });
        }}
      />
      <div className="flex flex-wrap gap-1">
        {current.map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant="secondary"
            aria-label={`Turn off ${name}`}
            onClick={() => void writeTags(current.filter((tag) => tag !== name))}
          >
            {name}
            <X size={12} />
          </Button>
        ))}
      </div>
      <VocabList
        title="class names"
        names={classTags}
        listName="class_tags"
        renameLabel="Rename class tag"
        deleteLabel={(name) => `Delete class tag ${name}`}
        canRename
        mutateVocab={mutateVocab}
        onAfterChange={async () => {
          await mutateClass();
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function PhaseEditor({
  clipId,
  frameIndex,
  frameCount,
  phaseFrames,
  phases,
  mutatePhase,
  mutateVocab,
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = framePhaseName(phaseFrames, frameIndex);

  async function writePhase(phase: string | null) {
    setError(null);
    try {
      const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase });
      await mutatePhase(doc, { revalidate: false });
      onPaint(phase ? { kind: "phase", name: phase } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="phase" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">phase</h2>
      <p className="text-sm text-muted-foreground">{current ?? "unlabeled"}</p>
      <Combobox
        ariaLabel="phase"
        names={phases}
        disabled={frameCount <= 0}
        onCommit={async (raw) => {
          const name = await ensureVocabName("phases", raw, phases, mutateVocab);
          if (!name || frameCount <= 0) {
            return;
          }
          await writePhase(name === current ? null : name);
        }}
      />
      <VocabList
        title="phase names"
        names={phases}
        listName="phases"
        renameLabel="Rename phase"
        deleteLabel={(name) => `Delete phase ${name}`}
        canRename
        mutateVocab={mutateVocab}
        onAfterChange={async () => {
          await mutatePhase();
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function TripletEditor({
  clipId,
  frameIndex,
  frameCount,
  tripletFrames,
  instruments,
  verbs,
  targets,
  mutateTriplet,
  mutateVocab,
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, import("./api").TripletRow[]>;
  instruments: string[];
  verbs: string[];
  targets: string[];
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef({ instrument: "", verb: "", target: "" });
  const rows = frameTripletRows(tripletFrames, frameIndex);

  async function refresh() {
    await mutateTriplet();
  }

  async function commitIfComplete(patch: Partial<{ instrument: string; verb: string; target: string }>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    if (!next.instrument || !next.verb || !next.target || frameCount <= 0) {
      return;
    }
    setError(null);
    try {
      const result = await sendJson<Record<string, unknown>>(tripletFramePath(clipId, frameIndex), "POST", next);
      draftRef.current = { instrument: "", verb: "", target: "" };
      await refresh();
      if ("rows" in result) {
        onPaint(null);
      } else {
        onPaint({ kind: "triplet", instrument: next.instrument, verb: next.verb, target: next.target });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="triplet" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">triplet</h2>
      <ul aria-label="triplet">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate">{row.instrument} / {row.verb} / {row.target}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Delete row ${row.instrument} / ${row.verb} / ${row.target}`}
              onClick={() => {
                void (async () => {
                  setError(null);
                  try {
                    await sendJson(tripletRowPath(clipId, frameIndex, row.id), "DELETE");
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Write failed");
                  }
                })();
              }}
            >
              <X size={12} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-1">
        <Combobox
          ariaLabel="instrument"
          names={instruments}
          disabled={frameCount <= 0}
          onCommit={async (raw) => {
            const name = await ensureVocabName("instruments", raw, instruments, mutateVocab);
            if (!name) {
              return;
            }
            await commitIfComplete({ instrument: name });
          }}
        />
        <Combobox
          ariaLabel="verb"
          names={verbs}
          disabled={frameCount <= 0}
          onCommit={async (raw) => {
            const name = await ensureVocabName("verbs", raw, verbs, mutateVocab);
            if (!name) {
              return;
            }
            await commitIfComplete({ verb: name });
          }}
        />
        <Combobox
          ariaLabel="target"
          names={targets}
          disabled={frameCount <= 0}
          onCommit={async (raw) => {
            const name = await ensureVocabName("targets", raw, targets, mutateVocab);
            if (!name) {
              return;
            }
            await commitIfComplete({ target: name });
          }}
        />
      </div>
      <TripletVocabLists
        instruments={instruments}
        verbs={verbs}
        targets={targets}
        mutateVocab={mutateVocab}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
