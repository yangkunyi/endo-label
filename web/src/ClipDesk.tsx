import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Brush, Check, Eye, EyeOff, Trash2, X } from "lucide-react";
import { useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  classFramePath,
  classSpanPath,
  frameClassTags,
  framePhaseName,
  frameTripletRows,
  getJson,
  getJsonAllow404,
  healthPath,
  isVersionConflict,
  saveErrorMessage,
  withVersion,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  registryDisablePath,
  sendJson,
  toggleClassTag,
  tripletClipPath,
  tripletFramePath,
  tripletSpanPath,
  vocabCandidatePath,
  vocabDeletePath,
  vocabListPath,
  vocabPath,
  vocabRenamePath,
  vocabTripleDeletePath,
  vocabTripleRenamePath,
  vocabTriplesPath,
  type AnnotationSummary,
  type ClassDoc,
  type ClipMeta,
  type FrameAnnotations,
  type HealthResponse,
  type PhaseDoc,
  type ScopedVocab,
  type VocabPickerItem,
  type TrackRow,
  type TripletDoc,
  type TripletRow,
  type Vocab,
  type VocabTriple,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ClipRail } from "./desk/ClipRail";
import { DeskItemActions } from "./desk/DeskItemActions";
import { isEditableTarget } from "./desk/keyboard";
import { MaskPanel, MaskSessionProvider } from "./desk/MaskPanel";
import { PlaybackProvider, PlayerPanel, TransportRow, usePlayback } from "./desk/PlayerPanel";
import { ResizeHandle } from "./desk/ResizeHandle";
import { brushOfKind, laneIsVisible, laneVisibilityKey, useDeskStore, type BrushIdentity, type EditorKind } from "./deskStore";
import { libraryRowSemanticStyle, nowEmptyText } from "./editorCards";
import { cn } from "./lib/utils";
import { foldClass, foldPhase, foldTriplet, frameFromClientX, labelColor, type TimelineLane } from "./timeline";
import {
  WORKER_LOADING_LABEL,
  workerStatusIsLoading,
} from "./workerStatus";

/** What the desk may offer for the focused Clip's Project word list. */
type VocabControls = {
  canRegistryWrite: boolean;
  canEditVocab: boolean;
  canCreateCandidate: boolean;
  projectId: number | null;
  items: VocabPickerItem[];
};

function pickerItemFor(
  items: VocabPickerItem[],
  kind: EditorKind,
  target: { name?: string; instrument?: string; verb?: string; target?: string },
): VocabPickerItem | undefined {
  return items.find((row) => {
    if (row.candidate || row.kind !== kind) {
      return false;
    }
    if (kind === "triplet") {
      return (
        row.instrument === target.instrument &&
        row.verb === target.verb &&
        row.target === target.target
      );
    }
    return row.name === target.name;
  });
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

function vocabOrderKeys(kind: EditorKind, vocab: Vocab | undefined): string[] {
  if (!vocab) {
    return [];
  }
  if (kind === "class") {
    return vocab.class_tags;
  }
  if (kind === "phase") {
    return vocab.phases;
  }
  return vocab.triples.map((row) => `${row.instrument} / ${row.verb} / ${row.target}`);
}

function orderBrushByVocab(identities: BrushIdentity[], order: string[]): BrushIdentity[] {
  if (identities.length <= 1 || order.length === 0) {
    return identities;
  }
  return [...identities].sort((a, b) => {
    const ia = order.indexOf(brushColorKey(a));
    const ib = order.indexOf(brushColorKey(b));
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
}

function nowFillStyle(identity: string) {
  return { backgroundColor: labelColor(identity), color: "var(--color-background)" };
}

/** Lane-visibility keys of identities that have at least one Frame on this Clip. */
function presentLaneKeys(
  focus: EditorKind,
  phaseFrames: Record<string, string>,
  classFrames: Record<string, string[]>,
  tripletFrames: Record<string, TripletRow[]>,
): Set<string> {
  const keys = new Set<string>();
  if (focus === "phase") {
    for (const name of Object.values(phaseFrames)) {
      if (name) {
        keys.add(laneVisibilityKey("phase", name));
      }
    }
  } else if (focus === "class") {
    for (const tags of Object.values(classFrames)) {
      for (const tag of tags ?? []) {
        if (tag) {
          keys.add(laneVisibilityKey("class", tag));
        }
      }
    }
  } else {
    for (const rows of Object.values(tripletFrames)) {
      for (const row of rows ?? []) {
        keys.add(laneVisibilityKey("triplet", tripleIdentity(row)));
      }
    }
  }
  return keys;
}

/** Visible Lanes of the focused kind in Vocab order, including unused-but-eye-on empty Lanes. */
function visibleLanes(
  focus: EditorKind,
  frameCount: number,
  phaseFrames: Record<string, string>,
  classFrames: Record<string, string[]>,
  tripletFrames: Record<string, TripletRow[]>,
  vocab: Vocab | undefined,
  presentKeys: Set<string>,
  stored: Record<string, boolean>,
): TimelineLane[] {
  const folded =
    focus === "phase"
      ? foldPhase(frameCount, phaseFrames)
      : focus === "class"
        ? foldClass(frameCount, classFrames)
        : foldTriplet(frameCount, tripletFrames);
  const byKey = new Map(folded.map((lane) => [lane.key, lane]));
  const keys: string[] = [];
  for (const identity of vocabOrderKeys(focus, vocab)) {
    const key = laneVisibilityKey(focus, identity);
    if (laneIsVisible(stored, key, presentKeys.has(key))) {
      keys.push(identity);
    }
  }
  for (const lane of folded) {
    if (!keys.includes(lane.key)) {
      const key = laneVisibilityKey(focus, lane.key);
      if (laneIsVisible(stored, key, true)) {
        keys.push(lane.key);
      }
    }
  }
  return keys.map((identity) => byKey.get(identity) ?? { key: identity, segs: [] });
}

function rangeEnds(fromIndex: number | null, currentIndex: number): { from: number; to: number } {
  const start = fromIndex == null ? currentIndex : fromIndex;
  return { from: Math.min(start, currentIndex), to: Math.max(start, currentIndex) };
}

type LaneBar = { laneKey: string; start: number; end: number };

function sameLaneBar(a: LaneBar, b: LaneBar): boolean {
  return a.laneKey === b.laneKey && a.start === b.start && a.end === b.end;
}

function identityFromLaneKey(kind: EditorKind, key: string): BrushIdentity | null {
  if (kind === "class") {
    return { kind: "class", name: key };
  }
  if (kind === "phase") {
    return { kind: "phase", name: key };
  }
  const parts = key.split(" / ");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return null;
  }
  return { kind: "triplet", instrument: parts[0], verb: parts[1], target: parts[2] };
}

async function postIdentitySpan(
  clipId: string,
  identity: BrushIdentity,
  from: number,
  to: number,
  remove: boolean,
  version: number | undefined,
): Promise<PhaseDoc | ClassDoc | TripletDoc> {
  if (identity.kind === "phase") {
    return sendJson<PhaseDoc>(
      phaseSpanPath(clipId),
      "POST",
      withVersion({ phase: remove ? null : identity.name, from, to }, version),
    );
  }
  if (identity.kind === "class") {
    return sendJson<ClassDoc>(
      classSpanPath(clipId),
      "POST",
      withVersion({ tag: identity.name, from, to, on: !remove }, version),
    );
  }
  return sendJson<TripletDoc>(
    tripletSpanPath(clipId),
    "POST",
    withVersion(
      {
        instrument: identity.instrument,
        verb: identity.verb,
        target: identity.target,
        from,
        to,
        op: remove ? "remove" : "add",
      },
      version,
    ),
  );
}

async function ensureVocabName(
  listName: string,
  raw: string,
  names: string[],
  mutateVocab: KeyedMutator<ScopedVocab>,
): Promise<string | null> {
  const name = raw.trim();
  if (!name) {
    return null;
  }
  if (names.includes(name)) {
    return name;
  }
  await sendJson<unknown>(vocabListPath(listName), "POST", { name });
  // The registry write answers the legacy desk-wide set; the desk shows the
  // Clip's Project set, so revalidate the scoped key instead of injecting it.
  await mutateVocab();
  return name;
}

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
    clipId ? vocabPath(clipId) : null,
    getJson<ScopedVocab>,
  );
  const { data: annotation, mutate: mutateAnnotation } = useSWR(
    clipId ? annotationSummaryPath(clipId) : null,
    getJsonAllow404<AnnotationSummary>,
  );
  const [taskFocus, setTaskFocus] = useState<EditorKind>("class");
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const brush = useDeskStore((s) => s.brush);
  const dropBrush = useDeskStore((s) => s.dropBrush);
  const laneVisibility = useDeskStore((s) => s.laneVisibility);
  const setLaneVisible = useDeskStore((s) => s.setLaneVisible);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [barSelection, setBarSelection] = useState<LaneBar[]>([]);
  const selectionScope = `${clipId ?? ""}:${taskFocus}`;
  const [barScope, setBarScope] = useState(selectionScope);
  if (barScope !== selectionScope) {
    setBarScope(selectionScope);
    setBarSelection([]);
  }
  const vocabControls: VocabControls = {
    canRegistryWrite: vocab?.permissions?.registry_write ?? false,
    canEditVocab: vocab?.permissions?.vocab_edit ?? false,
    canCreateCandidate: vocab?.permissions?.candidate_create ?? false,
    projectId: vocab?.project_id ?? null,
    items: vocab?.items ?? [],
  };

  const spanBusy = useRef(false);


  const { data: health } = useSWR(healthPath(), getJson<HealthResponse>, {
    refreshInterval: 5000,
  });
  const workerLoading = workerStatusIsLoading(health?.worker);



  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;
  const { data: frameAnn, mutate: mutateFrameAnn } = useSWR(
    clipId ? annotationFramePath(clipId, frameIndex) : null,
    getJsonAllow404<FrameAnnotations>,
  );
  const tracks: TrackRow[] = annotation?.tracks ?? [];
  const frameMasks = frameAnn?.masks ?? [];





  const markedFrom = spanStart && spanStart.clipId === clipId ? spanStart.frameIndex : null;
  const { from: rangeFrom, to: rangeTo } = rangeEnds(markedFrom, frameIndex);
  const focusedBrush = orderBrushByVocab(brushOfKind(brush, taskFocus), vocabOrderKeys(taskFocus, vocab));
  const hasBrush = focusedBrush.length > 0;
  const previewRange = hasBrush && markedFrom != null ? { from: rangeFrom, to: rangeTo } : null;

  const lanePresentKeys = presentLaneKeys(
    taskFocus,
    phaseDoc?.frames ?? {},
    classDoc?.frames ?? {},
    tripletDoc?.frames ?? {},
  );
  const laneVisibleFor = (identity: string) => {
    const key = laneVisibilityKey(taskFocus, identity);
    return laneIsVisible(laneVisibility, key, lanePresentKeys.has(key));
  };
  const toggleLaneFor = (identity: string) => {
    const key = laneVisibilityKey(taskFocus, identity);
    setLaneVisible(key, !laneIsVisible(laneVisibility, key, lanePresentKeys.has(key)));
  };
  const lanes = data
    ? visibleLanes(
        taskFocus,
        data.frame_count,
        phaseDoc?.frames ?? {},
        classDoc?.frames ?? {},
        tripletDoc?.frames ?? {},
        vocab,
        lanePresentKeys,
        laneVisibility,
      )
    : [];

  const commitIdentityRange = useCallback(
    async (identity: BrushIdentity, from: number, to: number, remove: boolean) => {
      if (!clipId) {
        return;
      }
      const version =
        identity.kind === "phase"
          ? phaseDoc?.version
          : identity.kind === "class"
            ? classDoc?.version
            : tripletDoc?.version;
      try {
        const doc = await postIdentitySpan(clipId, identity, from, to, remove, version);
        if (identity.kind === "phase") {
          await mutatePhase(doc as PhaseDoc, { revalidate: false });
        } else if (identity.kind === "class") {
          await mutateClass(doc as ClassDoc, { revalidate: false });
        } else {
          await mutateTriplet(doc as TripletDoc, { revalidate: false });
        }
      } catch (err) {
        if (isVersionConflict(err)) {
          // Stale Clip version: refetch the held labels before the user retries.
          await Promise.all([mutatePhase(), mutateClass(), mutateTriplet()]);
        }
        throw err;
      }
    },
    [clipId, classDoc?.version, mutateClass, mutatePhase, mutateTriplet, phaseDoc?.version, tripletDoc?.version],
  );

  const applyRange = useCallback(async (remove: boolean) => {
    const identities = orderBrushByVocab(brushOfKind(brush, taskFocus), vocabOrderKeys(taskFocus, vocab));
    if (!clipId || !data || identities.length === 0 || spanBusy.current) {
      return;
    }
    spanBusy.current = true;
    setToast(null);
    try {
      for (const identity of identities) {
        await commitIdentityRange(identity, rangeFrom, rangeTo, remove);
      }
      setSpanStart(null);
      setToast({
        text: `${remove ? "Removed" : "Wrote"} ${identities.map(brushLabel).join(", ")} on frames ${rangeFrom}–${rangeTo}`,
        error: false,
      });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    } finally {
      spanBusy.current = false;
    }
  }, [brush, clipId, commitIdentityRange, data, rangeFrom, rangeTo, setSpanStart, taskFocus, vocab]);

  const writeLaneSpan = useCallback(
    async (laneKey: string, from: number, to: number, remove: boolean) => {
      const identity = identityFromLaneKey(taskFocus, laneKey);
      if (!clipId || !data || !identity || spanBusy.current) {
        return false;
      }
      spanBusy.current = true;
      setToast(null);
      try {
        await commitIdentityRange(identity, from, to, remove);
        return true;
      } catch (err) {
        setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
        return false;
      } finally {
        spanBusy.current = false;
      }
    },
    [clipId, commitIdentityRange, data, taskFocus],
  );

  const paintLane = useCallback(
    (laneKey: string, from: number, to: number) => {
      void writeLaneSpan(laneKey, from, to, false);
    },
    [writeLaneSpan],
  );

  const trimBar = useCallback(
    (laneKey: string, oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
      void (async () => {
        if (newStart === oldStart && newEnd === oldEnd) {
          return;
        }
        if (newStart < oldStart) {
          if (!(await writeLaneSpan(laneKey, newStart, oldStart - 1, false))) {
            return;
          }
        } else if (newStart > oldStart) {
          if (!(await writeLaneSpan(laneKey, oldStart, newStart - 1, true))) {
            return;
          }
        }
        if (newEnd > oldEnd) {
          if (!(await writeLaneSpan(laneKey, oldEnd + 1, newEnd, false))) {
            return;
          }
        } else if (newEnd < oldEnd) {
          if (!(await writeLaneSpan(laneKey, newEnd + 1, oldEnd, true))) {
            return;
          }
        }
        setBarSelection((prev) =>
          prev.map((bar) =>
            bar.laneKey === laneKey && bar.start === oldStart && bar.end === oldEnd
              ? { laneKey, start: newStart, end: newEnd }
              : bar,
          ),
        );
      })();
    },
    [writeLaneSpan],
  );

  const deleteSelectedBars = useCallback(async () => {
    if (!clipId || !data || barSelection.length === 0 || spanBusy.current) {
      return;
    }
    spanBusy.current = true;
    setToast(null);
    try {
      for (const seg of barSelection) {
        const identity = identityFromLaneKey(taskFocus, seg.laneKey);
        if (!identity) {
          continue;
        }
        await commitIdentityRange(identity, seg.start, seg.end, true);
      }
      setBarSelection([]);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    } finally {
      spanBusy.current = false;
    }
  }, [barSelection, clipId, commitIdentityRange, data, taskFocus]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && barSelection.length > 0) {
        event.preventDefault();
        void deleteSelectedBars();
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
  }, [applyRange, barSelection.length, clipId, data, deleteSelectedBars, frameIndex, hasBrush, setSpanStart]);

  useLayoutEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-wide">endo_label</span>
        <span className="text-muted-foreground" aria-hidden="true">/</span>
        <h1 className="text-sm font-semibold">{data?.id ?? "Workbench"}</h1>
        {data ? <DeskItemActions clipId={data.id} taskType={taskFocus} /> : null}
      </header>
      <PlaybackProvider clip={data} frameIndex={frameIndex}>
      <MaskSessionProvider
        clipId={clipId}
        clip={data}
        frameIndex={frameIndex}
        tracks={tracks}
        frameMasks={frameMasks}
        mutateAnnotation={mutateAnnotation}
        mutateFrameAnn={mutateFrameAnn}
        notify={setToast}
      >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ClipRail activeClipId={clipId} width={layout.clipRailWidth} />
            <ResizeHandle
              label="Resize Clip rail"
              direction="horizontal"
              value={layout.clipRailWidth}
              onResize={(value) => setLayout({ clipRailWidth: value })}
            />
            <PlayerPanel clipId={clipId} clip={data} error={error} isLoading={isLoading} />
          </div>
          {data?.frame_count ? (
            <TimelineBand
              clipRailWidth={layout.clipRailWidth}
              frameCount={data.frame_count}
              frameIndex={frameIndex}
              lanes={lanes}
              previewRange={previewRange}
              brushKeys={focusedBrush.map(brushColorKey)}
              barSelection={barSelection}
              transport={<TransportRow />}
              onToggleBar={(bar) =>
                setBarSelection((prev) =>
                  prev.some((item) => sameLaneBar(item, bar))
                    ? prev.filter((item) => !sameLaneBar(item, bar))
                    : [...prev, bar],
                )
              }
              onClearBars={() => setBarSelection([])}
              onPaintLane={paintLane}
              onTrimBar={trimBar}
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
          className="flex shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-2"
          style={{ width: layout.editorRailWidth }}
        >
          <MaskPanel />
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
          <div role="tabpanel" className="flex flex-col">
            {data ? (
              taskFocus === "class" ? (
                <ClassEditor
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  classFrames={classDoc?.frames ?? {}}
                  classTags={vocab?.class_tags ?? []}
                  version={classDoc?.version}
                  mutateClass={mutateClass}
                  mutateVocab={mutateVocab}
                  laneVisible={laneVisibleFor}
                  onToggleLane={toggleLaneFor}
                  controls={vocabControls}
                />
              ) : taskFocus === "triplet" ? (
                <TripletEditor
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  tripletFrames={tripletDoc?.frames ?? {}}
                  triples={vocab?.triples ?? []}
                  version={tripletDoc?.version}
                  mutateTriplet={mutateTriplet}
                  mutateVocab={mutateVocab}
                  laneVisible={laneVisibleFor}
                  onToggleLane={toggleLaneFor}
                  controls={vocabControls}
                />
              ) : (
                <PhaseEditor
                  clipId={data.id}
                  frameIndex={frameIndex}
                  frameCount={data.frame_count}
                  phaseFrames={phaseDoc?.frames ?? {}}
                  phases={vocab?.phases ?? []}
                  version={phaseDoc?.version}
                  mutatePhase={mutatePhase}
                  mutateVocab={mutateVocab}
                  laneVisible={laneVisibleFor}
                  onToggleLane={toggleLaneFor}
                  controls={vocabControls}
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
      </MaskSessionProvider>
      </PlaybackProvider>
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
        {workerLoading ? (
          // Health poll says the SAM 3.1 worker is still loading (ticket 09).
          <span role="status" className="shrink-0 text-xs text-muted-foreground">
            {WORKER_LOADING_LABEL}
          </span>
        ) : null}
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
  lanes,
  previewRange,
  brushKeys,
  barSelection,
  transport,
  onToggleBar,
  onClearBars,
  onPaintLane,
  onTrimBar,
}: {
  clipRailWidth: number;
  frameCount: number;
  frameIndex: number;
  lanes: TimelineLane[];
  previewRange: { from: number; to: number } | null;
  brushKeys: string[];
  barSelection: LaneBar[];
  transport: ReactNode;
  onToggleBar: (bar: LaneBar) => void;
  onClearBars: () => void;
  onPaintLane: (laneKey: string, from: number, to: number) => void;
  onTrimBar: (laneKey: string, oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void;
}) {
  const { seek: onSeek } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);
  const laneTrackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const gesture = useRef<
    | { kind: "paint"; laneKey: string; origin: number; min: number; max: number }
    | { kind: "seek" }
    | { kind: "trim"; laneKey: string; originStart: number; originEnd: number; edge: "start" | "end" }
    | null
  >(null);
  const [paintPreview, setPaintPreview] = useState<{ laneKey: string; from: number; to: number } | null>(null);
  const [trimPreview, setTrimPreview] = useState<{
    laneKey: string;
    originStart: number;
    originEnd: number;
    start: number;
    end: number;
  } | null>(null);

  const frameAt = useCallback(
    (clientX: number, track: HTMLDivElement | null) => {
      if (!track) {
        return 0;
      }
      const rect = track.getBoundingClientRect();
      return frameFromClientX(clientX, rect.left, rect.width, frameCount);
    },
    [frameCount],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      onSeek(frameAt(clientX, trackRef.current));
    },
    [frameAt, onSeek],
  );

  const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  function releaseCapture(event: PointerEvent<Element>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function abortGesture(event: PointerEvent<Element>) {
    gesture.current = null;
    setPaintPreview(null);
    setTrimPreview(null);
    releaseCapture(event);
  }

  function commitGesture(event: PointerEvent<Element>) {
    const current = gesture.current;
    gesture.current = null;
    releaseCapture(event);
    if (!current) {
      return;
    }
    if (current.kind === "paint") {
      const frame = frameAt(event.clientX, laneTrackRef.current);
      const from = Math.min(current.min, frame);
      const to = Math.max(current.max, frame);
      setPaintPreview(null);
      if (from === to) {
        onSeek(from);
        onClearBars();
      } else {
        onPaintLane(current.laneKey, from, to);
      }
      return;
    }
    if (current.kind === "seek") {
      onSeek(frameAt(event.clientX, laneTrackRef.current));
      onClearBars();
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    const nextStart = current.edge === "start" ? Math.min(frame, current.originEnd) : current.originStart;
    const nextEnd = current.edge === "end" ? Math.max(frame, current.originStart) : current.originEnd;
    setTrimPreview(null);
    onTrimBar(current.laneKey, current.originStart, current.originEnd, nextStart, nextEnd);
  }

  function onLanePointerDown(event: PointerEvent<HTMLDivElement>, laneKey: string) {
    if (event.button !== 0) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-timeline-seg]")) {
      return;
    }
    event.preventDefault();
    const frame = frameAt(event.clientX, laneTrackRef.current);
    gesture.current = { kind: "paint", laneKey, origin: frame, min: frame, max: frame };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onLanePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.kind !== "paint" || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    current.min = Math.min(current.origin, current.min, frame);
    current.max = Math.max(current.origin, current.max, frame);
    if (current.min === current.max) {
      setPaintPreview(null);
    } else {
      setPaintPreview({ laneKey: current.laneKey, from: current.min, to: current.max });
    }
  }

  function onBarPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    laneKey: string,
    start: number,
    end: number,
  ) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      onToggleBar({ laneKey, start, end });
      return;
    }
    const trimEdge =
      event.target instanceof Element ? event.target.closest("[data-trim]")?.getAttribute("data-trim") : null;
    if (trimEdge === "start" || trimEdge === "end") {
      gesture.current = { kind: "trim", laneKey, originStart: start, originEnd: end, edge: trimEdge };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    gesture.current = { kind: "seek" };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(frameAt(event.clientX, laneTrackRef.current));
  }

  function onBarPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    if (current.kind === "seek") {
      onSeek(frame);
      return;
    }
    if (current.kind === "trim") {
      const start = current.edge === "start" ? Math.min(frame, current.originEnd) : current.originStart;
      const end = current.edge === "end" ? Math.max(frame, current.originStart) : current.originEnd;
      setTrimPreview({
        laneKey: current.laneKey,
        originStart: current.originStart,
        originEnd: current.originEnd,
        start,
        end,
      });
    }
  }

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
            {previewRange ? (
              <span
                data-ruler-range=""
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 bg-[#5e6ad2]/35"
                style={{
                  left: `${(previewRange.from / frameCount) * 100}%`,
                  width: `${((previewRange.to - previewRange.from + 1) / frameCount) * 100}%`,
                }}
              />
            ) : null}
            <span data-playhead="" aria-hidden="true" className="pointer-events-none absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-[#5e6ad2]" style={{ left: playheadLeft }} />
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="h-9 shrink-0 border-r border-border" style={{ width: clipRailWidth }} />
        <div className="w-1 shrink-0" />
        <div className="min-w-0 flex-1">{transport}</div>
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
            <div ref={laneTrackRef} className="relative min-w-0 flex-1">
              {lanes.map((lane) => (
                <div
                  key={lane.key}
                  className="relative h-6 touch-none"
                  data-timeline-lane={lane.key}
                  onPointerDown={(event) => onLanePointerDown(event, lane.key)}
                  onPointerMove={onLanePointerMove}
                  onPointerUp={(event) => {
                    if (gesture.current?.kind === "paint") {
                      commitGesture(event);
                    }
                  }}
                  onPointerCancel={abortGesture}
                >
                  {lane.segs.map((seg) => {
                    if (seg.label == null) {
                      return (
                        <span
                          key={`${lane.key}-${seg.start}`}
                          data-timeline-seg=""
                          data-unlabeled="true"
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-1 top-1 box-border rounded border-r border-black/50 bg-white/10"
                          style={{
                            left: `${(seg.start / frameCount) * 100}%`,
                            width: `${((seg.end - seg.start + 1) / frameCount) * 100}%`,
                          }}
                        />
                      );
                    }
                    const label = seg.label;
                    const selected = barSelection.some(
                      (bar) => bar.laneKey === lane.key && bar.start === seg.start && bar.end === seg.end,
                    );
                    const preview =
                      trimPreview &&
                      trimPreview.laneKey === lane.key &&
                      trimPreview.originStart === seg.start &&
                      trimPreview.originEnd === seg.end
                        ? trimPreview
                        : null;
                    const shownStart = preview ? preview.start : seg.start;
                    const shownEnd = preview ? preview.end : seg.end;
                    return (
                      <button
                        key={`${lane.key}-${seg.start}`}
                        type="button"
                        draggable={false}
                        data-timeline-seg=""
                        data-selected={selected ? "true" : undefined}
                        data-label-color={labelColor(label)}
                        aria-label={`${label} ${seg.start}–${seg.end}`}
                        title={label}
                        className={`absolute bottom-1 top-1 box-border cursor-pointer rounded border-r border-black/50 ${selected ? "z-[2] ring-2 ring-inset ring-primary" : ""}`}
                        style={{
                          left: `${(shownStart / frameCount) * 100}%`,
                          width: `${((shownEnd - shownStart + 1) / frameCount) * 100}%`,
                          backgroundColor: labelColor(label),
                        }}
                        onPointerDown={(event) => onBarPointerDown(event, lane.key, seg.start, seg.end)}
                        onPointerMove={onBarPointerMove}
                        onPointerUp={(event) => {
                          if (gesture.current?.kind === "seek" || gesture.current?.kind === "trim") {
                            commitGesture(event);
                          }
                        }}
                        onPointerCancel={abortGesture}
                      >
                        {selected ? (
                          <>
                            <span
                              data-trim="start"
                              aria-label={`Trim ${label} start`}
                              className="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize"
                            />
                            <span
                              data-trim="end"
                              aria-label={`Trim ${label} end`}
                              className="absolute inset-y-0 right-0 z-[1] w-2 cursor-ew-resize"
                            />
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                  {previewRange && brushKeys.includes(lane.key) ? (
                    <span
                      data-ghost=""
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-1 top-1 z-[1] box-border rounded"
                      style={{
                        left: `${(previewRange.from / frameCount) * 100}%`,
                        width: `${((previewRange.to - previewRange.from + 1) / frameCount) * 100}%`,
                        backgroundColor: labelColor(lane.key),
                        opacity: 0.4,
                      }}
                    />
                  ) : null}
                  {paintPreview && paintPreview.laneKey === lane.key ? (
                    <span
                      data-lane-drag=""
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-1 top-1 z-[1] box-border rounded"
                      style={{
                        left: `${(paintPreview.from / frameCount) * 100}%`,
                        width: `${((paintPreview.to - paintPreview.from + 1) / frameCount) * 100}%`,
                        backgroundColor: labelColor(lane.key),
                        opacity: 0.4,
                      }}
                    />
                  ) : null}
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
  brushIdentity,
  laneVisible,
  onToggleLane,
  disabled,
  listName,
  renameLabel,
  deleteLabel,
  mutateVocab,
  onAfterChange,
  controls,
  onRetract,
  label = "Library",
  colorNames = true,
}: {
  names: string[];
  isOnThisFrame: (name: string) => boolean;
  inBrush: (name: string) => boolean;
  onPick: (name: string) => void;
  onToggleBrush: (name: string) => void;
  brushIdentity: (name: string) => BrushIdentity;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  disabled: boolean;
  listName: string;
  renameLabel: string;
  deleteLabel: (name: string) => string;
  mutateVocab: KeyedMutator<ScopedVocab>;
  onAfterChange?: () => Promise<void>;
  controls: VocabControls;
  onRetract?: (name: string) => void;
  label?: string;
  colorNames?: boolean;
}) {
  const clickTimer = useRef<number | null>(null);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trashBrush = useDeskStore((s) => s.trashBrush);

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
                  onDoubleClick={() => {
                    if (controls.canRegistryWrite) {
                      startRename(name);
                    }
                  }}
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
                aria-label={laneVisible(name) ? "Hide lane" : "Show lane"}
                className={laneVisible(name) ? "text-foreground" : "text-muted-foreground"}
                onClick={() => onToggleLane(name)}
              >
                {laneVisible(name) ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
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
              {controls.canRegistryWrite ? (
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
                      await trashBrush(
                        brushIdentity(name),
                        sendJson<unknown>(vocabDeletePath(listName, name), "DELETE"),
                      );
                      await mutateVocab();
                      await onAfterChange?.();
                    });
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              ) : controls.canEditVocab &&
                onRetract &&
                controls.items.some(
                  (row) =>
                    !row.candidate &&
                    row.kind === (listName === "phases" ? "phase" : "class") &&
                    row.name === name,
                ) ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${name} from this Project`}
                  title="Remove from this Project"
                  className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void run(async () => {
                    await onRetract(name);
                    await onAfterChange?.();
                  })}
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
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
  kind,
  clipId,
  names,
  mutateVocab,
  ariaLabel,
  controls,
}: {
  listName: string;
  kind: EditorKind;
  clipId: string;
  names: string[];
  mutateVocab: KeyedMutator<ScopedVocab>;
  ariaLabel: string;
  controls: VocabControls;
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
      if (controls.canRegistryWrite) {
        await ensureVocabName(listName, raw, names, mutateVocab);
      } else if (controls.canCreateCandidate) {
        if (!names.includes(raw)) {
          await sendJson(vocabCandidatePath(), "POST", { clip_id: clipId, kind, name: raw });
          await mutateVocab();
        }
      } else {
        return;
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  if (!controls.canRegistryWrite && !controls.canCreateCandidate) {
    return null;
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
  version,
  mutateClass,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  version: number | undefined;
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  controls: VocabControls;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = frameClassTags(classFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writeTags(tags: string[]) {
    setError(null);
    try {
      const doc = await sendJson<ClassDoc>(
        classFramePath(clipId, frameIndex),
        "PUT",
        withVersion({ tags }, version),
      );
      await mutateClass(doc, { revalidate: false });
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutateClass();
      }
      setError(saveErrorMessage(err));
    }
  }

  async function retractClass(name: string) {
    const item = pickerItemFor(controls.items, "class", { name });
    if (!item || controls.projectId === null) {
      return;
    }
    await sendJson(registryDisablePath(item.id), "POST", { project_id: controls.projectId });
    await mutateVocab();
    await mutateClass();
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
          brushIdentity={(name) => ({ kind: "class", name })}
          laneVisible={laneVisible}
          onToggleLane={onToggleLane}
          disabled={frameCount <= 0}
          listName="class_tags"
          renameLabel="Rename class tag"
          deleteLabel={(name) => `Delete class tag ${name}`}
          mutateVocab={mutateVocab}
          controls={controls}
          onRetract={(name) => retractClass(name)}
          onAfterChange={async () => {
            await mutateClass();
          }}
          onPick={(name) => {
            void writeTags(toggleClassTag(current, name));
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "class", name })}
        />
        <AddVocabRow
          listName="class_tags"
          kind="class"
          clipId={clipId}
          names={classTags}
          mutateVocab={mutateVocab}
          ariaLabel="Add class name"
          controls={controls}
        />
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
  version,
  mutatePhase,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  version: number | undefined;
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (name: string) => boolean;
  onToggleLane: (name: string) => void;
  controls: VocabControls;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = framePhaseName(phaseFrames, frameIndex);
  const brush = useDeskStore((s) => s.brush);
  const toggleBrush = useDeskStore((s) => s.toggleBrush);

  async function writePhase(phase: string | null) {
    setError(null);
    try {
      const doc = await sendJson<PhaseDoc>(
        phaseFramePath(clipId, frameIndex),
        "PUT",
        withVersion({ phase }, version),
      );
      await mutatePhase(doc, { revalidate: false });
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutatePhase();
      }
      setError(saveErrorMessage(err));
    }
  }

  async function retractPhase(name: string) {
    const item = pickerItemFor(controls.items, "phase", { name });
    if (!item || controls.projectId === null) {
      return;
    }
    await sendJson(registryDisablePath(item.id), "POST", { project_id: controls.projectId });
    await mutateVocab();
    await mutatePhase();
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
          brushIdentity={(name) => ({ kind: "phase", name })}
          laneVisible={laneVisible}
          onToggleLane={onToggleLane}
          disabled={frameCount <= 0}
          listName="phases"
          renameLabel="Rename phase"
          deleteLabel={(name) => `Delete phase ${name}`}
          mutateVocab={mutateVocab}
          controls={controls}
          onRetract={(name) => retractPhase(name)}
          onAfterChange={async () => {
            await mutatePhase();
          }}
          onPick={(name) => {
            void writePhase(name === current ? null : name);
          }}
          onToggleBrush={(name) => toggleBrush({ kind: "phase", name })}
        />
        <AddVocabRow
          listName="phases"
          kind="phase"
          clipId={clipId}
          names={phases}
          mutateVocab={mutateVocab}
          ariaLabel="Add phase name"
          controls={controls}
        />
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
  version,
  mutateTriplet,
  mutateVocab,
  laneVisible,
  onToggleLane,
  controls,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  triples: VocabTriple[];
  version: number | undefined;
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (key: string) => boolean;
  onToggleLane: (key: string) => void;
  controls: VocabControls;
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
  const trashBrush = useDeskStore((s) => s.trashBrush);

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
      await sendJson<Record<string, unknown>>(
        tripletFramePath(clipId, frameIndex),
        "POST",
        withVersion(row, version),
      );
      await mutateTriplet();
    } catch (err) {
      if (isVersionConflict(err)) {
        // Stale Clip version: refetch before the retry.
        await mutateTriplet();
      }
      setError(saveErrorMessage(err));
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
      if (controls.canRegistryWrite) {
        await sendJson<unknown>(vocabTriplesPath(), "POST", { instrument, verb, target });
      } else if (controls.canCreateCandidate) {
        await sendJson<unknown>(vocabCandidatePath(), "POST", {
          clip_id: clipId,
          kind: "triplet",
          instrument,
          verb,
          target,
        });
      } else {
        return;
      }
      await mutateVocab();
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
      await trashBrush(
        { kind: "triplet", ...row },
        sendJson<unknown>(vocabTripleDeletePath(row.instrument, row.verb, row.target), "DELETE"),
      );
      await mutateVocab();
      await mutateTriplet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Write failed");
    }
  }

  async function retractRow(row: VocabTriple) {
    const item = pickerItemFor(controls.items, "triplet", row);
    if (!item || controls.projectId === null) {
      return;
    }
    setError(null);
    try {
      await sendJson(registryDisablePath(item.id), "POST", {
        project_id: controls.projectId,
      });
      await mutateVocab();
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
    if (!controls.canRegistryWrite) {
      return;
    }
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
        await sendJson<unknown>(vocabTripleRenamePath(), "POST", { from, to });
        await mutateVocab();
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
                    <div className="w-[84px] shrink-0" aria-hidden="true" />
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
                          aria-label={laneVisible(key) ? "Hide lane" : "Show lane"}
                          className={laneVisible(key) ? "text-foreground" : "text-muted-foreground"}
                          onClick={() => onToggleLane(key)}
                        >
                          {laneVisible(key) ? <Eye size={14} /> : <EyeOff size={14} />}
                        </Button>
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
                        {controls.canRegistryWrite ? (
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
                        ) : controls.canEditVocab &&
                          pickerItemFor(controls.items, "triplet", row) ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove triple ${key} from this Project`}
                            title="Remove from this Project"
                            className="opacity-30 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void retractRow(row)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {controls.canRegistryWrite || controls.canCreateCandidate ? (
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
        ) : null}
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
