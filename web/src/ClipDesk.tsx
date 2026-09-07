import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Brush, Check, Trash2, X } from "lucide-react";
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
  vocabTripleDeletePath,
  vocabTripleRenamePath,
  vocabTriplesPath,
  type ClassDoc,
  type ClipListResponse,
  type ClipMeta,
  type PhaseDoc,
  type TripletDoc,
  type TripletRow,
  type Vocab,
  type VocabTriple,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { VideoPlayer } from "./components/ui/video-player";
import { brushOfKind, useDeskStore, type BrushIdentity, type EditorKind } from "./deskStore";
import { libraryRowSemanticStyle, nowEmptyText } from "./editorCards";
import { cn } from "./lib/utils";
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

function brushLabel(identity: BrushIdentity): string {
  if (identity.kind === "class") {
    return `class: ${identity.name}`;
  }
  if (identity.kind === "phase") {
    return `phase: ${identity.name}`;
  }
  return `triplet: ${identity.instrument} / ${identity.verb} / ${identity.target}`;
}

function brushColorKey(identity: BrushIdentity): string {
  if (identity.kind === "triplet") {
    return `${identity.instrument} / ${identity.verb} / ${identity.target}`;
  }
  return identity.name;
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
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const brush = useDeskStore((s) => s.brush);
  const dropBrush = useDeskStore((s) => s.dropBrush);
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
  const focusedBrush = brushOfKind(brush, taskFocus);
  const hasBrush = focusedBrush.length > 0;

  const applyRange = useCallback(async (remove: boolean) => {
    const identity = brushOfKind(brush, taskFocus)[0];
    if (!clipId || !data || !identity || spanBusy.current) {
      return;
    }
    spanBusy.current = true;
    setToast(null);
    try {
      if (identity.kind === "phase") {
        const doc = await sendJson<PhaseDoc>(phaseSpanPath(clipId), "POST", {
          phase: remove ? null : identity.name,
          from: rangeFrom,
          to: rangeTo,
        });
        await mutatePhase(doc, { revalidate: false });
      } else if (identity.kind === "class") {
        const doc = await sendJson<ClassDoc>(classSpanPath(clipId), "POST", {
          tag: identity.name,
          from: rangeFrom,
          to: rangeTo,
          on: !remove,
        });
        await mutateClass(doc, { revalidate: false });
      } else {
        const doc = await sendJson<TripletDoc>(tripletSpanPath(clipId), "POST", {
          instrument: identity.instrument,
          verb: identity.verb,
          target: identity.target,
          from: rangeFrom,
          to: rangeTo,
          op: remove ? "remove" : "add",
        });
        await mutateTriplet(doc, { revalidate: false });
      }
      setSpanStart(null);
      setToast({
        text: `${remove ? "Removed" : "Wrote"} ${brushLabel(identity)} on frames ${rangeFrom}–${rangeTo}`,
        error: false,
      });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    } finally {
      spanBusy.current = false;
    }
  }, [brush, clipId, data, mutateClass, mutatePhase, mutateTriplet, rangeFrom, rangeTo, setSpanStart, taskFocus]);

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
      if (!clipId || !data || data.frame_count <= 0 || !hasBrush) {
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
  }, [applyRange, clipId, data, frameIndex, hasBrush, setSpanStart, togglePlayback]);

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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
            <section aria-label="Player" className="relative flex min-h-48 min-w-0 flex-1 flex-col overflow-hidden rounded-t-xl bg-black">
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
          </div>
          {data?.frame_count ? (
            <TimelineBand
              clipRailWidth={layout.clipRailWidth}
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
                />
              ) : taskFocus === "triplet" ? (
                <TripletEditor
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  tripletFrames={tripletDoc?.frames ?? {}}
                  triples={vocab?.triples ?? []}
                  mutateTriplet={mutateTriplet}
                  mutateVocab={mutateVocab}
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
        <div data-brush="" className="flex min-w-0 items-center gap-2">
          {focusedBrush.map((identity) => {
            const id = brushColorKey(identity);
            return (
              <span
                key={`${identity.kind}:${id}`}
                data-label-color={labelColor(id)}
                className="flex max-w-48 items-center gap-0.5 truncate text-xs font-medium"
                style={{ borderLeft: `3px solid ${labelColor(id)}`, paddingLeft: 6 }}
              >
                <span className="truncate">{brushLabel(identity)}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  aria-label={`Remove ${brushLabel(identity)} from Brush`}
                  onClick={() => dropBrush(identity)}
                >
                  <X size={12} />
                </Button>
              </span>
            );
          })}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasBrush || !clipId}
          onClick={() => {
            if (clipId && hasBrush) {
              setSpanStart({ clipId, frameIndex });
            }
          }}
        >
          Mark from
        </Button>
        <Button type="button" size="sm" disabled={!hasBrush} onClick={() => void applyRange(false)}>
          Apply to frames {rangeFrom}–{rangeTo}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!hasBrush} onClick={() => void applyRange(true)}>
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
  clipRailWidth,
  frameCount,
  frameIndex,
  focus,
  phaseFrames,
  classFrames,
  tripletFrames,
  onSeek,
}: {
  clipRailWidth: number;
  frameCount: number;
  frameIndex: number;
  focus: EditorKind;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletRow[]>;
  onSeek: (index: number) => void;
}) {
  const lanes: TimelineLane[] =
    focus === "phase"
      ? foldPhase(frameCount, phaseFrames)
      : focus === "class"
        ? foldClass(frameCount, classFrames)
        : foldTriplet(frameCount, tripletFrames);
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
      <div className="flex">
        <div className="h-3 shrink-0 border-r border-border" style={{ width: clipRailWidth }} />
        <div className="w-1 shrink-0" />
        <div ref={trackRef} className="relative min-w-0 flex-1" data-timeline-track="">
          <div
            role="slider"
            aria-label="Ruler"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, frameCount - 1)}
            aria-valuenow={frameIndex}
            aria-valuetext={`Frame ${frameIndex}`}
            data-ruler=""
            className="relative h-3 touch-none cursor-ew-resize"
            onPointerDown={(event) => {
              event.preventDefault();
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
            <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
            <span data-playhead="" aria-hidden="true" className="pointer-events-none absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-[#5e6ad2]" style={{ left: playheadLeft }} />
          </div>
        </div>
      </div>
      <div
        role="region"
        aria-label="Lane well"
        data-lane-well=""
        className="h-24 shrink-0 overflow-y-auto [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]"
      >
        {lanes.length > 0 ? (
          <div className="flex">
            <div className="flex shrink-0 flex-col border-r border-border" style={{ width: clipRailWidth }}>
              {lanes.map((lane) => (
                <div key={lane.key} className="flex h-6 shrink-0 items-center gap-1.5 px-2" data-lane-head title={lane.key}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: labelColor(lane.key) }} />
                  <span className="truncate text-[11px] leading-none text-foreground">{lane.key}</span>
                </div>
              ))}
            </div>
            <div className="w-1 shrink-0" />
            <div className="relative min-w-0 flex-1">
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
              <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px -translate-x-1/2 bg-[#5e6ad2]" style={{ left: playheadLeft }} />
            </div>
          </div>
        ) : null}
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
  isOnThisFrame,
  inBrush,
  onPick,
  onToggleBrush,
  disabled,
  listName,
  renameLabel,
  deleteLabel,
  mutateVocab,
  onAfterChange,
  label = "Library",
  colorNames = true,
}: {
  names: string[];
  isOnThisFrame: (name: string) => boolean;
  inBrush: (name: string) => boolean;
  onPick: (name: string) => void;
  onToggleBrush: (name: string) => void;
  disabled: boolean;
  listName: string;
  renameLabel: string;
  deleteLabel: (name: string) => string;
  mutateVocab: KeyedMutator<Vocab>;
  onAfterChange?: () => Promise<void>;
  label?: string;
  colorNames?: boolean;
}) {
  const clickTimer = useRef<number | null>(null);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
  }, []);

  async function run(op: () => Promise<void>) {
    setError(null);
    try {
      await op();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  function schedulePick(name: string) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
    // ponytail: 300ms click delay so dblclick can rename; drop if rename gets its own control
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (!disabled) {
        onPick(name);
      }
    }, 300);
  }

  function startRename(name: string) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setRenameFrom(name);
    setRenameDraft(name);
  }

  return (
    <>
      <ul aria-label={label} className="space-y-1">
        {names.map((name) => {
          const on = isOnThisFrame(name);
          return (
            <li key={name} className="group flex items-center gap-1">
              {renameFrom === name ? (
                <Input
                  aria-label={renameLabel}
                  value={renameDraft}
                  autoFocus
                  className="h-7 text-xs"
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "min-w-0 flex-1 justify-start border transition-colors",
                    on
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                  style={libraryRowSemanticStyle(labelColor(name), on)}
                  aria-pressed={on}
                  data-label-color={colorNames ? labelColor(name) : undefined}
                  onClick={() => schedulePick(name)}
                  onDoubleClick={() => startRename(name)}
                >
                  {colorNames ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                        on && "ring-1 ring-white/60",
                      )}
                      style={{ backgroundColor: labelColor(name) }}
                    />
                  ) : null}
                  <span className="truncate">{name}</span>
                  {on ? (
                    <Check
                      aria-hidden="true"
                      data-checkmark=""
                      size={14}
                      className="ml-auto mr-1 shrink-0 text-primary"
                    />
                  ) : null}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Brush"
                aria-pressed={inBrush(name)}
                className={inBrush(name) ? "text-foreground" : "text-muted-foreground"}
                onClick={() => onToggleBrush(name)}
              >
                <Brush size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={deleteLabel(name)}
                className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(`${deleteLabel(name)} from every Clip?`)) {
                    return;
                  }
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
          );
        })}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
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
    <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
      <div className="flex items-center gap-1">
        <Input
          aria-label={ariaLabel}
          placeholder="Type to add"
          value={draft}
          className="h-7 text-xs"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addOnly();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={ariaLabel}
          onClick={() => void addOnly()}
        >
          +
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function EditorCard({
  card,
  count,
  children,
}: {
  card: "now" | "library";
  count: number;
  children: React.ReactNode;
}) {
  const title = card === "now" ? "Now" : "Library";
  return (
    <section
      data-card={card}
      className="flex flex-col gap-2 rounded-lg border border-border/70 bg-surface/40 p-3"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
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
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = frameClassTags(classFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writeTags(tags: string[]) {
    setError(null);
    try {
      const doc = await sendJson<ClassDoc>(classFramePath(clipId, frameIndex), "PUT", { tags });
      await mutateClass(doc, { revalidate: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="class" className="flex flex-col gap-2">
      <EditorCard card="now" count={current.length}>
        <div data-now="" className="flex flex-wrap gap-1">
          {current.length === 0 ? (
            <p className="text-sm text-muted-foreground">{nowEmptyText("class", frameIndex)}</p>
          ) : null}
          {current.map((name) => (
            <span
              key={name}
              data-label-color={labelColor(name)}
              className="rounded-md px-2 py-1 text-sm font-medium"
              style={nowFillStyle(name)}
            >
              {name}
            </span>
          ))}
        </div>
      </EditorCard>
      <EditorCard card="library" count={classTags.length}>
        <LibraryList
          names={classTags}
          isOnThisFrame={(name) => current.includes(name)}
          inBrush={(name) => brush.class.includes(name)}
          disabled={frameCount <= 0}
          listName="class_tags"
          renameLabel="Rename class tag"
          deleteLabel={(name) => `Delete class tag ${name}`}
          mutateVocab={mutateVocab}
          onAfterChange={async () => {
            await mutateClass();
          }}
          onPick={(name) => {
            void writeTags(toggleClassTag(current, name));
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "class", name })}
        />
        <AddVocabRow listName="class_tags" names={classTags} mutateVocab={mutateVocab} ariaLabel="Add class name" />
      </EditorCard>
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
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = framePhaseName(phaseFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writePhase(phase: string | null) {
    setError(null);
    try {
      const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase });
      await mutatePhase(doc, { revalidate: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  return (
    <section data-editor-card="phase" className="flex flex-col gap-2">
      <EditorCard card="now" count={current ? 1 : 0}>
        <p
          data-now=""
          data-label-color={current ? labelColor(current) : undefined}
          className={
            current
              ? "inline-flex items-center rounded-md px-2 py-1 text-sm font-medium"
              : "text-sm text-muted-foreground"
          }
          style={current ? nowFillStyle(current) : undefined}
        >
          {current ? (
            <>
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-white/70" />
              {current}
            </>
          ) : (
            nowEmptyText("phase", frameIndex)
          )}
        </p>
      </EditorCard>
      <EditorCard card="library" count={phases.length}>
        <LibraryList
          names={phases}
          isOnThisFrame={(name) => name === current}
          inBrush={(name) => brush.phase === name}
          disabled={frameCount <= 0}
          listName="phases"
          renameLabel="Rename phase"
          deleteLabel={(name) => `Delete phase ${name}`}
          mutateVocab={mutateVocab}
          onAfterChange={async () => {
            await mutatePhase();
          }}
          onPick={(name) => {
            void writePhase(name === current ? null : name);
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "phase", name })}
        />
        <AddVocabRow listName="phases" names={phases} mutateVocab={mutateVocab} ariaLabel="Add phase name" />
      </EditorCard>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

function tripleIdentity(row: { instrument: string; verb: string; target: string }): string {
  return `${row.instrument} / ${row.verb} / ${row.target}`;
}

function uniqueTripleWords(triples: VocabTriple[], slot: keyof VocabTriple): string[] {
  return [...new Set(triples.map((row) => row[slot]).filter(Boolean))];
}

function TripletEditor({
  clipId,
  frameIndex,
  frameCount,
  tripletFrames,
  triples,
  mutateTriplet,
  mutateVocab,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  triples: VocabTriple[];
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<Vocab>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ instrument: "", verb: "", target: "" });
  const [renameCell, setRenameCell] = useState<{
    row: VocabTriple;
    slot: "instrument" | "verb" | "target";
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const clickTimer = useRef<number | null>(null);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  useEffect(() => () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
  }, []);

  useEffect(() => {
    setDraft({ instrument: "", verb: "", target: "" });
    setRenameCell(null);
  }, [clipId]);
  const nowRows = frameTripletRows(tripletFrames, frameIndex);
  const onKeys = new Set(nowRows.map(tripleIdentity));
  const instrumentWords = uniqueTripleWords(triples, "instrument");
  const verbWords = uniqueTripleWords(triples, "verb");
  const targetWords = uniqueTripleWords(triples, "target");

  async function toggleRow(row: VocabTriple) {
    if (frameCount <= 0) {
      return;
    }
    setError(null);
    try {
      await sendJson<Record<string, unknown>>(tripletFramePath(clipId, frameIndex), "POST", row);
      await mutateTriplet();
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
      const next = await sendJson<Vocab>(vocabTriplesPath(), "POST", { instrument, verb, target });
      await mutateVocab(next, { revalidate: false });
      setDraft({ instrument: "", verb: "", target: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function trashRow(row: VocabTriple) {
    if (!window.confirm(`Delete triple ${tripleIdentity(row)} from every Clip?`)) {
      return;
    }
    setError(null);
    try {
      const next = await sendJson<Vocab>(vocabTripleDeletePath(row.instrument, row.verb, row.target), "DELETE");
      await mutateVocab(next, { revalidate: false });
      await mutateTriplet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  function scheduleToggle(row: VocabTriple) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
    }
    // ponytail: 300ms click delay so dblclick can rename; drop if rename gets its own control
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (frameCount > 0) {
        void toggleRow(row);
      }
    }, 300);
  }

  function startRename(row: VocabTriple, slot: "instrument" | "verb" | "target") {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setRenameCell({ row, slot });
    setRenameDraft(row[slot]);
  }

  function commitRename() {
    const current = renameCell;
    const word = renameDraft.trim();
    setRenameCell(null);
    if (!current) {
      return;
    }
    const from = current.row;
    if (!word || word === from[current.slot]) {
      return;
    }
    const to: VocabTriple = {
      ...from,
      [current.slot]: word,
    };
    setError(null);
    void (async () => {
      try {
        const next = await sendJson<Vocab>(vocabTripleRenamePath(), "POST", { from, to });
        await mutateVocab(next, { revalidate: false });
        await mutateTriplet();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Write failed");
      }
    })();
  }

  return (
    <section data-editor-card="triplet" className="flex flex-col gap-2">
      <EditorCard card="now" count={nowRows.length}>
        <div data-now="" className="flex flex-col gap-1">
          {nowRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{nowEmptyText("triplet", frameIndex)}</p>
          ) : null}
          {nowRows.map((row) => {
            const key = tripleIdentity(row);
            return (
              <div
                key={row.id}
                data-label-color={labelColor(key)}
                className="inline-flex max-w-full items-stretch overflow-hidden rounded-md border text-xs font-medium"
                style={nowFillStyle(key)}
              >
                <span className="truncate px-2 py-1">{row.instrument}</span>
                <span aria-hidden className="w-px shrink-0 bg-white/20" />
                <span className="truncate px-2 py-1">{row.verb}</span>
                <span aria-hidden className="w-px shrink-0 bg-white/20" />
                <span className="truncate px-2 py-1">{row.target}</span>
              </div>
            );
          })}
        </div>
      </EditorCard>
      <EditorCard card="library" count={triples.length}>
        <div className="overflow-x-auto">
          <table aria-label="Library" className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <td colSpan={3} className="p-0 font-normal">
                  <div className="flex items-center gap-1">
                    <div className="grid flex-1 grid-cols-3 divide-x divide-border/40 text-muted-foreground">
                      <span role="columnheader" className="px-2 py-1 font-medium">instrument</span>
                      <span role="columnheader" className="px-2 py-1 font-medium">verb</span>
                      <span role="columnheader" className="px-2 py-1 font-medium">target</span>
                    </div>
                    <div className="w-14 shrink-0" aria-hidden="true" />
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              {triples.map((row) => {
                const key = tripleIdentity(row);
                const lit = onKeys.has(key);
                const brushed = brush.triplet.some((item) => tripleIdentity(item) === key);
                const isRenaming = renameCell && tripleIdentity(renameCell.row) === key;
                return (
                  <tr key={key} className="group">
                    <td colSpan={3} className="p-0">
                      <div className="flex items-center gap-1">
                        {isRenaming ? (
                          <div
                            className={cn(
                              "grid h-7 min-w-0 flex-1 grid-cols-3 items-center divide-x divide-border/40 border p-0 text-left transition-colors",
                              lit
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                            )}
                            style={libraryRowSemanticStyle(labelColor(key), lit)}
                          >
                            {(["instrument", "verb", "target"] as const).map((slot) => {
                              const isCellEditing = renameCell.slot === slot;
                              return (
                                <div key={slot} className="flex h-full min-w-0 items-center px-2 py-1">
                                  {isCellEditing ? (
                                    <Input
                                      aria-label={`Rename ${slot}`}
                                      value={renameDraft}
                                      autoFocus
                                      className="h-6 px-1 text-xs"
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onBlur={() => setRenameCell(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitRename();
                                        }
                                        if (e.key === "Escape") {
                                          setRenameCell(null);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="flex min-w-0 w-full items-center justify-between">
                                      <span className="flex min-w-0 items-center truncate">
                                        {slot === "instrument" ? (
                                          <span
                                            aria-hidden
                                            className={cn(
                                              "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                                              lit && "ring-1 ring-white/60",
                                            )}
                                            style={{ backgroundColor: labelColor(key) }}
                                          />
                                        ) : null}
                                        <span className="truncate">{row[slot]}</span>
                                      </span>
                                      {slot === "target" && lit ? (
                                        <Check
                                          aria-hidden="true"
                                          data-checkmark=""
                                          size={14}
                                          className="ml-auto mr-1 shrink-0 text-primary"
                                        />
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "grid h-7 min-w-0 flex-1 grid-cols-3 justify-items-start divide-x divide-border/40 border p-0 font-normal transition-colors",
                              lit
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                            )}
                            style={libraryRowSemanticStyle(labelColor(key), lit)}
                            disabled={frameCount <= 0}
                            aria-label={key}
                            aria-pressed={lit}
                            data-label-color={labelColor(key)}
                            onClick={() => scheduleToggle(row)}
                            onDoubleClick={() => startRename(row, "instrument")}
                          >
                            <span
                              className="flex min-w-0 w-full items-center px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "instrument");
                              }}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm transition-transform",
                                  lit && "ring-1 ring-white/60",
                                )}
                                style={{ backgroundColor: labelColor(key) }}
                              />
                              <span className="truncate">{row.instrument}</span>
                            </span>
                            <span
                              className="truncate w-full px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "verb");
                              }}
                            >
                              {row.verb}
                            </span>
                            <span
                              className="flex min-w-0 w-full items-center justify-between px-2 py-1"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startRename(row, "target");
                              }}
                            >
                              <span className="truncate">{row.target}</span>
                              {lit ? (
                                <Check
                                  aria-hidden="true"
                                  data-checkmark=""
                                  size={14}
                                  className="ml-auto mr-1 shrink-0 text-primary"
                                />
                              ) : null}
                            </span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Brush"
                          aria-pressed={brushed}
                          className={brushed ? "text-foreground" : "text-muted-foreground"}
                          onClick={() => toggleBrush({ kind: "triplet", ...row })}
                        >
                          <Brush size={14} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete triple ${key}`}
                          className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void trashRow(row)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1">
            <Input
              aria-label="instrument"
              placeholder="instrument"
              list="triplet-instrument-words"
              value={draft.instrument}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, instrument: event.target.value }))}
            />
            <Input
              aria-label="verb"
              placeholder="verb"
              list="triplet-verb-words"
              value={draft.verb}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, verb: event.target.value }))}
            />
            <Input
              aria-label="target"
              placeholder="target"
              list="triplet-target-words"
              value={draft.target}
              className="h-7 text-xs"
              onChange={(event) => setDraft((s) => ({ ...s, target: event.target.value }))}
            />
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-label="Add triplet row"
              onClick={() => void addRowOnly()}
            >
              +
            </Button>
          </div>
        </div>
        <datalist id="triplet-instrument-words">
          {instrumentWords.map((word) => <option key={word} value={word} />)}
        </datalist>
        <datalist id="triplet-verb-words">
          {verbWords.map((word) => <option key={word} value={word} />)}
        </datalist>
        <datalist id="triplet-target-words">
          {targetWords.map((word) => <option key={word} value={word} />)}
        </datalist>
      </EditorCard>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
