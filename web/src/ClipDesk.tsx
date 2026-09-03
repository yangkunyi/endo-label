import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  frameClassTags,
  clipMediaPath,
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
import { VideoPlayer } from "./components/ui/video-player";
import { useDeskStore, type EditorKind, type PaintChip } from "./deskStore";
import { foldClass, foldPhase, foldTriplet, labelColor, type TimelineLane } from "./timeline";

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

function chipIdentity(chip: PaintChip): string {
  if (chip.kind === "triplet") {
    return `${chip.instrument} / ${chip.verb} / ${chip.target}`;
  }
  return chip.name;
}

function nowFillStyle(identity: string) {
  return { backgroundColor: labelColor(identity), color: "var(--color-background)" };
}

function rangeEnds(fromIndex: number | null, currentIndex: number): { from: number; to: number } {
  const start = fromIndex == null ? currentIndex : fromIndex;
  return { from: Math.min(start, currentIndex), to: Math.max(start, currentIndex) };
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
  const [composedTriples, setComposedTriples] = useState<{ instrument: string; verb: string; target: string }[]>([]);
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const paintChip = useDeskStore((s) => s.paintChip);
  const setPaintChip = useDeskStore((s) => s.setPaintChip);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const spanBusy = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;

  const togglePlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, []);

  const seekPlayhead = useCallback((index: number) => {
    scrub(index);
    const el = videoRef.current;
    if (el) {
      const fps = data?.fps && data.fps > 0 ? data.fps : 25;
      el.currentTime = index / fps;
    }
  }, [data, scrub]);


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
      setSpanStart(null);
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
        // media-chrome handles Space when its controller has focus; only handle
        // the body/default focus case so the two never double-toggle.
        const inController = event.target instanceof Element && event.target.closest("media-controller");
        if (inController) {
          return;
        }
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

  useEffect(() => {
    setComposedTriples([]);
  }, [data?.id]);

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
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${clip.id === clipId ? "bg-primary/15 font-semibold text-foreground" : "text-foreground hover:bg-secondary"}`}
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <section aria-label="Player" className="relative flex min-h-48 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-black">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {error ? (
                <div className="p-6 text-center"><h2 className="mb-2 text-lg font-semibold">{clipId}</h2><p>{error instanceof Error ? error.message : "Clip not found"}</p></div>
              ) : isLoading ? (
                <p>Loading Clip…</p>
              ) : data?.frame_count ? (
                <VideoPlayer
                  src={clipMediaPath(data.id)}
                  videoRef={videoRef}
                  frameLabel={`Frame ${frameIndex}`}
                  onLoadedMetadata={() => {
                    const fps = data.fps > 0 ? data.fps : 25;
                    const el = videoRef.current;
                    if (el) {
                      el.currentTime = frameIndex / fps;
                    }
                  }}
                  onTimeUpdate={(currentTime) => {
                    const fps = data.fps > 0 ? data.fps : 25;
                    const last = Math.max(0, data.frame_count - 1);
                    const index = Math.min(last, Math.max(0, Math.round(currentTime * fps)));
                    if (index !== frameIndex) {
                      scrub(index);
                    }
                  }}
                />
              ) : data ? (
                <p>This Clip has no Frames.</p>
              ) : (
                <div className="p-6 text-center"><h2 className="mb-2 text-xl font-semibold">Choose a Clip</h2><p className="text-muted-foreground">Select a Clip from the left rail to begin labeling.</p></div>
              )}
            </div>
          </section>
          {data?.frame_count ? (
            <TimelineBand
              frameCount={data.frame_count}
              frameIndex={frameIndex}
              focus={taskFocus}
              phaseFrames={phaseDoc?.frames ?? {}}
              classFrames={classDoc?.frames ?? {}}
              tripletFrames={tripletDoc?.frames ?? {}}
              onSeek={seekPlayhead}
            />
          ) : null}
        </div>
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
                  composed={composedTriples}
                  setComposed={setComposedTriples}
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
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Playback in player</span>
        <output className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{data ? `Frame ${frameIndex} of ${data.frame_count}` : "No Clip"}</output>
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
  frameIndex,
  focus,
  phaseFrames,
  classFrames,
  tripletFrames,
  onSeek,
}: {
  frameCount: number;
  frameIndex: number;
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
    lanes = [{ key: "", segs: [{ start: 0, end: frameCount - 1, label: null }] }];
  }
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1)));
      onSeek(Math.min(frameCount - 1, Math.floor(frac * frameCount)));
    },
    [frameCount, onSeek],
  );

  const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const playheadLeft = `${(frameIndex / frameCount) * 100}%`;

  return (
    <div role="region" aria-label="Timeline" data-timeline="" className="shrink-0 border-t border-border bg-card select-none">
      <div className="max-h-44 overflow-y-auto px-3 py-1.5 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
        <div className="flex">
          <div className="flex w-40 shrink-0 flex-col pr-2">
            {lanes.map((lane) => {
              const unlabeled = !lane.key;
              return (
                <div key={lane.key} className="flex h-6 shrink-0 items-center gap-1.5" data-lane-head title={unlabeled ? undefined : lane.key}>
                  {unlabeled ? null : (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: labelColor(lane.key) }} />
                  )}
                  <span className={`truncate text-[11px] leading-none ${unlabeled ? "text-muted-foreground" : "text-foreground"}`}>
                    {unlabeled ? "" : lane.key}
                  </span>
                </div>
              );
            })}
          </div>
          <div ref={trackRef} className="relative flex-1" data-timeline-track="">
            {lanes.map((lane) => (
              <div key={lane.key} className="relative h-6" data-timeline-lane={lane.key}>
                {lane.segs.map((seg) => {
                  const unlabeled = seg.label == null;
                  return (
                    <button
                      key={`${lane.key}-${seg.start}`}
                      type="button"
                      draggable={false}
                      data-timeline-seg=""
                      data-unlabeled={unlabeled ? "true" : undefined}
                      data-label-color={seg.label ? labelColor(seg.label) : undefined}
                      aria-label={unlabeled ? `unlabeled ${seg.start}–${seg.end}` : `${seg.label} ${seg.start}–${seg.end}`}
                      title={seg.label ?? "unlabeled"}
                      className={`absolute bottom-1 top-1 box-border cursor-pointer border-r border-black/50 rounded ${unlabeled ? "bg-white/10" : ""}`}
                      style={{
                        left: `${(seg.start / frameCount) * 100}%`,
                        width: `${((seg.end - seg.start + 1) / frameCount) * 100}%`,
                        backgroundColor: seg.label ? labelColor(seg.label) : undefined,
                      }}
                      onClick={() => onSeek(seg.start)}
                    />
                  );
                })}
              </div>
            ))}
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-3 -translate-x-1/2" style={{ left: playheadLeft }}>
              <div
                data-playhead=""
                role="slider"
                aria-label="Playhead"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, frameCount - 1)}
                aria-valuenow={frameIndex}
                aria-valuetext={`Frame ${frameIndex}`}
                className="absolute left-1/2 top-0 h-2 w-3 -translate-x-1/2 touch-none cursor-ew-resize pointer-events-auto"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  dragging.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  seekFromClientX(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (dragging.current) {
                    seekFromClientX(event.clientX);
                  }
                }}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >
                <span aria-hidden="true" className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#5e6ad2]" />
              </div>
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#5e6ad2]" />
            </div>
          </div>
        </div>
      </div>
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
            className="rounded-md px-2 py-1 text-sm"
            style={nowFillStyle(name)}
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
        className={current ? "inline-block rounded-md px-2 py-1 text-sm" : "text-sm text-muted-foreground"}
        style={current ? nowFillStyle(current) : undefined}
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
  composed,
  setComposed,
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
  composed: { instrument: string; verb: string; target: string }[];
  setComposed: React.Dispatch<React.SetStateAction<{ instrument: string; verb: string; target: string }[]>>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ instrument: "", verb: "", target: "" });
  useEffect(() => {
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
      setError("Fill instrument, verb, and target.");
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
              <tr key={row.id} data-label-color={labelColor(key)}>
                <td className="truncate px-1" style={nowFillStyle(key)}>{row.instrument}</td>
                <td className="truncate px-1" style={nowFillStyle(key)}>{row.verb}</td>
                <td className="truncate px-1" style={nowFillStyle(key)}>{row.target}</td>
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
                    onClick={() => void toggleRow(row)}
                  >
                    <span className="flex min-w-0 items-center">
                      <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: labelColor(key) }} />
                      <span className="truncate">{row.instrument}</span>
                    </span>
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
