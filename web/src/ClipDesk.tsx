import { useLayoutEffect, useState } from "react";
import { useParams } from "react-router-dom";
import useSWR from "swr";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  frameClassTags,
  framePhaseName,
  frameTripletRows,
  getJson,
  getJsonAllow404,
  phaseClipPath,
  tripletClipPath,
  vocabPath,
  type AnnotationSummary,
  type ClassDoc,
  type PhaseDoc,
  type TripletDoc,
  type ClipMeta,
  type FrameAnnotations,
  type ScopedVocab,
  type TrackRow,
} from "./api";
import { ClipRail } from "./desk/ClipRail";
import { DeskItemActions } from "./desk/DeskItemActions";
import { ClassEditor, OtherSummary, PhaseEditor, TripletEditor } from "./desk/EditorCards";
import { FrameControls } from "./desk/FrameControls";
import { MaskPanel, MaskSessionProvider } from "./desk/MaskPanel";
import type { DeskNotice } from "./desk/notice";
import { PlaybackProvider, PlayerPanel } from "./desk/PlayerPanel";
import { ResizeHandle } from "./desk/ResizeHandle";
import { TimelinePanel } from "./desk/TimelinePanel";
import { type VocabControls } from "./desk/VocabLibrary";
import { useDeskLanes } from "./desk/lanes";
import { useIdentityWriter } from "./desk/writer";
import { useDeskStore, type EditorKind } from "./deskStore";
import { Button } from "./components/ui/button";

/** What the desk may offer for the focused Clip's Project word list. */
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
  const [toast, setToast] = useState<DeskNotice>(null);
  const vocabControls: VocabControls = {
    canRegistryWrite: vocab?.permissions?.registry_write ?? false,
    canEditVocab: vocab?.permissions?.vocab_edit ?? false,
    canCreateCandidate: vocab?.permissions?.candidate_create ?? false,
    projectId: vocab?.project_id ?? null,
    items: vocab?.items ?? [],
  };

  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;
  const { data: frameAnn, mutate: mutateFrameAnn } = useSWR(
    clipId ? annotationFramePath(clipId, frameIndex) : null,
    getJsonAllow404<FrameAnnotations>,
  );
  const tracks: TrackRow[] = annotation?.tracks ?? [];
  const frameMasks = frameAnn?.masks ?? [];

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
      <FrameControls
        clip={data}
        frameIndex={frameIndex}
        focus={taskFocus}
        vocab={vocab}
        writer={writer}
        notify={setToast}
        notice={toast}
        height={layout.bottomBarHeight}
      />
    </main>
  );
}
