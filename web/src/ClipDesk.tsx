import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brush, Check, Eye, EyeOff, Trash2, X } from "lucide-react";
import { useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  classFramePath,
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
  registryDisablePath,
  sendJson,
  toggleClassTag,
  tripletClipPath,
  tripletFramePath,
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
import { brushColorKey, brushLabel, tripleIdentity, useBrushRange, useDeskLanes } from "./desk/lanes";
import { DeskItemActions } from "./desk/DeskItemActions";
import { isEditableTarget } from "./desk/keyboard";
import { MaskPanel, MaskSessionProvider } from "./desk/MaskPanel";
import { PlaybackProvider, PlayerPanel } from "./desk/PlayerPanel";
import { TimelinePanel } from "./desk/TimelinePanel";
import { useIdentityWriter } from "./desk/writer";
import { ResizeHandle } from "./desk/ResizeHandle";
import { useDeskStore, type BrushIdentity, type EditorKind } from "./deskStore";
import { libraryRowSemanticStyle, nowEmptyText, nowFillStyle } from "./editorCards";
import { cn } from "./lib/utils";
import { labelColor } from "./timeline";
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
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const dropBrush = useDeskStore((s) => s.dropBrush);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const vocabControls: VocabControls = {
    canRegistryWrite: vocab?.permissions?.registry_write ?? false,
    canEditVocab: vocab?.permissions?.vocab_edit ?? false,
    canCreateCandidate: vocab?.permissions?.candidate_create ?? false,
    projectId: vocab?.project_id ?? null,
    items: vocab?.items ?? [],
  };



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





  const { markedFrom, rangeFrom, rangeTo, focusedBrush, hasBrush } = useBrushRange({
    clipId,
    frameIndex,
    focus: taskFocus,
    vocab,
  });
  const { laneVisibleFor, toggleLaneFor } = useDeskLanes({
    focus: taskFocus,
    frameCount: data?.frame_count,
    phaseFrames: phaseDoc?.frames ?? {},
    classFrames: classDoc?.frames ?? {},
    tripletFrames: tripletDoc?.frames ?? {},
    vocab,
  });
  const writer = useIdentityWriter({
    clipId,
    focus: taskFocus,
    phaseVersion: phaseDoc?.version,
    classVersion: classDoc?.version,
    tripletVersion: tripletDoc?.version,
    mutatePhase,
    mutateClass,
    mutateTriplet,
    notify: setToast,
  });

  const applyRange = useCallback(async (remove: boolean) => {
    if (!clipId || !data || focusedBrush.length === 0) {
      return;
    }
    setToast(null);
    try {
      await writer.runExclusive(async () => {
        for (const identity of focusedBrush) {
          await writer.commitIdentityRange(identity, rangeFrom, rangeTo, remove);
        }
        setSpanStart(null);
        setToast({
          text: `${remove ? "Removed" : "Wrote"} ${focusedBrush.map(brushLabel).join(", ")} on frames ${rangeFrom}–${rangeTo}`,
          error: false,
        });
      });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    }
  }, [clipId, data, focusedBrush, rangeFrom, rangeTo, setSpanStart, writer]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
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
  }, [applyRange, clipId, data, frameIndex, hasBrush, setSpanStart]);

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
            <TimelinePanel
              clipId={clipId}
              clip={data}
              frameIndex={frameIndex}
              focus={taskFocus}
              vocab={vocab}
              phaseFrames={phaseDoc?.frames ?? {}}
              classFrames={classDoc?.frames ?? {}}
              tripletFrames={tripletDoc?.frames ?? {}}
              writer={writer}
              notify={setToast}
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
