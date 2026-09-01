import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  frameClassTags,
  clipMediaPath,
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
  type TripletRow,
  type Vocab,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useDeskStore, type EditorKind, type PaintChip } from "./deskStore";
import { foldClass, foldPhase, foldTriplet, labelColor, type TimelineLane } from "./timeline";

type PlaybackRate = 0.5 | 1 | 2;

type PlaybackSettings = {
  rate: PlaybackRate;
};

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

function playerClock(frameIndex: number, frameCount: number, fps: number): string {
  const rate = fps > 0 ? fps : 25;
  return `${formatClock(frameIndex / rate)} / ${formatClock(Math.max(0, frameCount) / rate)}`;
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
  // Seek is <input type="range">. Treating every INPUT as typing swallowed i/o/[].
  if (target instanceof HTMLInputElement && target.type === "range") {
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

function chipIdentity(chip: PaintChip): string {
  if (chip.kind === "triplet") {
    return `${chip.instrument} / ${chip.verb} / ${chip.target}`;
  }
  return chip.name;
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
  const [taskFocus, setTaskFocus] = useState<EditorKind>("class");
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
  const videoRef = useRef<HTMLVideoElement>(null);

  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;

  useEffect(() => {
    savePlaybackSettings(playback);
  }, [playback]);

  const togglePlayback = useCallback(() => {
    setPlaying((current) => !current);
  }, []);

  const seekPlayhead = useCallback((index: number) => {
    scrub(index);
    const el = videoRef.current;
    if (el && data?.kind === "video") {
      const fps = data.fps > 0 ? data.fps : 25;
      el.currentTime = index / fps;
    }
  }, [data, scrub]);

  useEffect(() => {
    if (data?.kind === "video") {
      return;
    }
    if (!playing || !data || data.frame_count <= 0) {
      return;
    }
    const last = data.frame_count - 1;
    if (frameIndex >= last) {
      setPlaying(false);
      return;
    }
    const fps = data.fps > 0 ? data.fps : 25;
    const delay = Math.max(1, Math.round(1000 / (fps * playback.rate)));
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el || data?.kind !== "video") {
      return;
    }
    el.playbackRate = playback.rate;
    if (playing) {
      void el.play();
    } else {
      el.pause();
    }
  }, [data?.kind, playback.rate, playing]);

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
            ) : data?.kind === "video" && data.frame_count ? (
              <video
                ref={videoRef}
                className="h-full w-full object-contain"
                src={clipMediaPath(data.id)}
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const fps = data.fps > 0 ? data.fps : 25;
                  event.currentTarget.currentTime = frameIndex / fps;
                }}
                onTimeUpdate={(event) => {
                  const fps = data.fps > 0 ? data.fps : 25;
                  const last = Math.max(0, data.frame_count - 1);
                  const index = Math.min(last, Math.max(0, Math.round(event.currentTarget.currentTime * fps)));
                  if (index !== frameIndex) {
                    scrub(index);
                  }
                }}
                onEnded={() => setPlaying(false)}
              />
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
              {playerClock(frameIndex, data.frame_count, data.fps)}
            </p>
          ) : null}
          {data?.frame_count ? (
            <TimelineBand
              frameCount={data.frame_count}
              focus={taskFocus}
              phaseFrames={phaseDoc?.frames ?? {}}
              classFrames={classDoc?.frames ?? {}}
              tripletFrames={tripletDoc?.frames ?? {}}
              onSeek={seekPlayhead}
            />
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
          className="flex shrink-0 flex-col gap-2 overflow-hidden border-l border-border p-2"
          style={{ width: layout.editorRailWidth }}
        >
          <div role="tablist" aria-label="Task type" className="flex shrink-0 gap-1">
            {(["class", "triplet", "phase"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                role="tab"
                size="sm"
                variant={taskFocus === kind ? "default" : "ghost"}
                aria-selected={taskFocus === kind}
                onClick={() => setTaskFocus(kind)}
              >
                {kind}
              </Button>
            ))}
          </div>
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {data ? (
              taskFocus === "class" ? (
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
              ) : taskFocus === "triplet" ? (
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
              ) : (
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
              )
            ) : (
              <p className="text-sm text-muted-foreground">Choose a Clip to edit this Task type.</p>
            )}
          </div>
          {data ? (
            <OtherSummary
              focus={taskFocus}
              phase={framePhaseName(phaseDoc?.frames ?? {}, frameIndex)}
              classTags={frameClassTags(classDoc?.frames ?? {}, frameIndex)}
              triplets={frameTripletRows(tripletDoc?.frames ?? {}, frameIndex)}
              onFocus={setTaskFocus}
            />
          ) : null}
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
            onChange={(event) => seekPlayhead(Number(event.target.value))}
          />
        </div>
        <output className="shrink-0 text-sm tabular-nums" data-player-clock-bar="">
          {data ? playerClock(frameIndex, data.frame_count, data.fps) : "0:00 / 0:00"}
        </output>
        <output className="w-24 shrink-0 text-right text-xs text-muted-foreground">{data ? `Frame ${frameIndex} of ${data.frame_count}` : "No Clip"}</output>
        {markedFrom != null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rangeFrom} → {rangeTo}</span>
        ) : null}
        <span
          data-paint-chip=""
          data-label-color={paintChip ? labelColor(chipIdentity(paintChip)) : undefined}
          className="max-w-48 truncate text-xs font-medium"
          style={paintChip ? { borderLeft: `3px solid ${labelColor(chipIdentity(paintChip))}`, paddingLeft: 6 } : undefined}
        >
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

function TimelineBand({
  frameCount,
  focus,
  phaseFrames,
  classFrames,
  tripletFrames,
  onSeek,
}: {
  frameCount: number;
  focus: EditorKind;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletRow[]>;
  onSeek: (index: number) => void;
}) {
  let lanes: TimelineLane[] =
    focus === "phase"
      ? foldPhase(frameCount, phaseFrames)
      : focus === "class"
        ? foldClass(frameCount, classFrames)
        : foldTriplet(frameCount, tripletFrames);
  if (lanes.length === 0) {
    lanes = [{ key: "empty", segs: [{ start: 0, end: frameCount - 1, label: null }] }];
  }
  return (
    <div role="region" aria-label="Timeline" data-timeline="" className="shrink-0 border-t border-white/20 bg-black/80 px-2 py-1">
      {lanes.map((lane) => (
        <div key={lane.key} className="relative mb-0.5 h-5 w-full last:mb-0" data-timeline-lane={lane.key}>
          {lane.segs.map((seg) => {
            const unlabeled = seg.label == null;
            const color = unlabeled || !seg.label ? undefined : labelColor(seg.label);
            return (
              <button
                key={`${lane.key}-${seg.start}`}
                type="button"
                data-timeline-seg=""
                data-unlabeled={unlabeled ? "true" : undefined}
                data-label-color={color}
                aria-label={unlabeled ? `unlabeled ${seg.start}–${seg.end}` : `${seg.label} ${seg.start}–${seg.end}`}
                title={seg.label ?? "unlabeled"}
                className={`absolute top-0 box-border h-full overflow-hidden border-r border-black/50 px-0.5 text-left text-[10px] leading-5 text-white ${unlabeled ? "bg-white/20" : ""}`}
                style={{
                  left: `${(seg.start / frameCount) * 100}%`,
                  width: `${((seg.end - seg.start + 1) / frameCount) * 100}%`,
                  backgroundColor: color,
                }}
                onClick={() => onSeek(seg.start)}
              >
                {unlabeled ? null : seg.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OtherSummary({
  focus,
  phase,
  classTags,
  triplets,
  onFocus,
}: {
  focus: EditorKind;
  phase: string | null;
  classTags: string[];
  triplets: TripletRow[];
  onFocus: (kind: EditorKind) => void;
}) {
  const others = (["class", "triplet", "phase"] as const).filter((kind) => kind !== focus);
  return (
    <div aria-label="Other labels" className="shrink-0 border-t border-border pt-2">
      {others.map((kind) => {
        const label = kind === "phase"
          ? `phase: ${phase ?? "unlabeled"}`
          : kind === "class"
            ? `class: ${classTags.length ? classTags.join(", ") : "none"}`
            : `triplet: ${triplets.length ? triplets.map((row) => `${row.instrument}/${row.verb}/${row.target}`).join("; ") : "none"}`;
        return (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="ghost"
            className="mb-1 w-full justify-start truncate"
            onClick={() => onFocus(kind)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function LibraryList({
  names,
  onPick,
  disabled,
  label = "Library",
  colorNames = true,
}: {
  names: string[];
  onPick: (name: string) => void;
  disabled: boolean;
  label?: string;
  colorNames?: boolean;
}) {
  return (
    <ul aria-label={label} className="space-y-1">
      {names.map((name) => (
        <li key={name}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-start"
            disabled={disabled}
            data-label-color={colorNames ? labelColor(name) : undefined}
            onClick={() => onPick(name)}
          >
            {colorNames ? (
              <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: labelColor(name) }} />
            ) : null}
            {name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AddVocabRow({
  listName,
  names,
  mutateVocab,
  ariaLabel,
}: {
  listName: string;
  names: string[];
  mutateVocab: KeyedMutator<Vocab>;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addOnly() {
    const raw = draft.trim();
    if (!raw) {
      return;
    }
    setError(null);
    try {
      await ensureVocabName(listName, raw, names, mutateVocab);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1">
      <Input
        aria-label={ariaLabel}
        placeholder="Type to add"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void addOnly();
          }
        }}
      />
      <Button type="button" size="sm" aria-label={ariaLabel} onClick={() => void addOnly()}>+</Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now</p>
      <div data-now="" className="flex flex-wrap gap-1">
        {current.length === 0 ? <p className="text-sm text-muted-foreground">none</p> : null}
        {current.map((name) => (
          <span
            key={name}
            data-label-color={labelColor(name)}
            className="rounded-md bg-secondary px-2 py-1 text-sm text-secondary-foreground"
            style={{ borderLeft: `3px solid ${labelColor(name)}` }}
          >
            {name}
          </span>
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Library</p>
      <LibraryList
        names={classTags}
        disabled={frameCount <= 0}
        onPick={(name) => {
          const on = !current.includes(name);
          void writeTags(toggleClassTag(current, name), { name, on });
        }}
      />
      <AddVocabRow listName="class_tags" names={classTags} mutateVocab={mutateVocab} ariaLabel="Add class name" />
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now</p>
      <p
        data-now=""
        data-label-color={current ? labelColor(current) : undefined}
        className="text-sm"
        style={current ? { borderLeft: `3px solid ${labelColor(current)}`, paddingLeft: 6 } : undefined}
      >
        {current ?? "unlabeled"}
      </p>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Library</p>
      <LibraryList
        names={phases}
        disabled={frameCount <= 0}
        onPick={(name) => {
          void writePhase(name === current ? null : name);
        }}
      />
      <AddVocabRow listName="phases" names={phases} mutateVocab={mutateVocab} ariaLabel="Add phase name" />
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

function tripleIdentity(row: { instrument: string; verb: string; target: string }): string {
  return `${row.instrument} / ${row.verb} / ${row.target}`;
}

function distinctTriples(frames: Record<string, TripletRow[]>): { instrument: string; verb: string; target: string }[] {
  const seen = new Set<string>();
  const out: { instrument: string; verb: string; target: string }[] = [];
  for (const list of Object.values(frames)) {
    for (const row of list ?? []) {
      const key = tripleIdentity(row);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ instrument: row.instrument, verb: row.verb, target: row.target });
    }
  }
  return out;
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
  const [composed, setComposed] = useState<{ instrument: string; verb: string; target: string }[]>([]);
  const [draft, setDraft] = useState({ instrument: "", verb: "", target: "" });
  useEffect(() => {
    setComposed([]);
    setDraft({ instrument: "", verb: "", target: "" });
  }, [clipId]);
  const nowRows = frameTripletRows(tripletFrames, frameIndex);
  const onKeys = new Set(nowRows.map(tripleIdentity));
  const libraryRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: { instrument: string; verb: string; target: string }[] = [];
    for (const row of [...distinctTriples(tripletFrames), ...composed]) {
      const key = tripleIdentity(row);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push(row);
    }
    return rows;
  }, [composed, tripletFrames]);

  async function toggleRow(row: { instrument: string; verb: string; target: string }) {
    if (frameCount <= 0) {
      return;
    }
    setError(null);
    try {
      const result = await sendJson<Record<string, unknown>>(tripletFramePath(clipId, frameIndex), "POST", row);
      await mutateTriplet();
      if ("rows" in result) {
        onPaint(null);
      } else {
        onPaint({ kind: "triplet", instrument: row.instrument, verb: row.verb, target: row.target });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function addRowOnly() {
    const instrument = draft.instrument.trim();
    const verb = draft.verb.trim();
    const target = draft.target.trim();
    if (!instrument || !verb || !target) {
      return;
    }
    setError(null);
    try {
      await ensureVocabName("instruments", instrument, instruments, mutateVocab);
      await ensureVocabName("verbs", verb, verbs, mutateVocab);
      await ensureVocabName("targets", target, targets, mutateVocab);
      const row = { instrument, verb, target };
      setComposed((current) => (current.some((item) => tripleIdentity(item) === tripleIdentity(row)) ? current : [...current, row]));
      setDraft({ instrument: "", verb: "", target: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="triplet" className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now</p>
      <table aria-label="Now" data-now="" className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="font-medium">instrument</th>
            <th className="font-medium">verb</th>
            <th className="font-medium">target</th>
          </tr>
        </thead>
        <tbody>
          {nowRows.map((row) => {
            const key = tripleIdentity(row);
            return (
              <tr key={row.id} data-label-color={labelColor(key)} style={{ borderLeft: `3px solid ${labelColor(key)}` }}>
                <td className="truncate px-1">{row.instrument}</td>
                <td className="truncate px-1">{row.verb}</td>
                <td className="truncate px-1">{row.target}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Library</p>
      <table aria-label="Library" className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="font-medium">instrument</th>
            <th className="font-medium">verb</th>
            <th className="font-medium">target</th>
          </tr>
        </thead>
        <tbody>
          {libraryRows.map((row) => {
            const key = tripleIdentity(row);
            const lit = onKeys.has(key);
            return (
              <tr key={key}>
                <td colSpan={3} className="p-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={lit ? "secondary" : "ghost"}
                    className="grid h-auto w-full grid-cols-3 justify-items-start font-normal"
                    disabled={frameCount <= 0}
                    aria-label={key}
                    aria-pressed={lit}
                    data-label-color={labelColor(key)}
                    style={{ borderLeft: `3px solid ${labelColor(key)}` }}
                    onClick={() => void toggleRow(row)}
                  >
                    <span className="truncate">{row.instrument}</span>
                    <span className="truncate">{row.verb}</span>
                    <span className="truncate">{row.target}</span>
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1">
        <Input aria-label="instrument" placeholder="instrument" value={draft.instrument} onChange={(event) => setDraft((s) => ({ ...s, instrument: event.target.value }))} />
        <Input aria-label="verb" placeholder="verb" value={draft.verb} onChange={(event) => setDraft((s) => ({ ...s, verb: event.target.value }))} />
        <Input aria-label="target" placeholder="target" value={draft.target} onChange={(event) => setDraft((s) => ({ ...s, target: event.target.value }))} />
        <Button type="button" size="sm" aria-label="Add triplet row" onClick={() => void addRowOnly()}>+</Button>
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
