import { useState } from "react";
import { useParams } from "react-router-dom";
import { ClipRail } from "./desk/ClipRail";
import { DeskItemActions } from "./desk/DeskItemActions";
import { EditorRail } from "./desk/EditorRail";
import { FrameControls } from "./desk/FrameControls";
import { MaskSessionProvider } from "./desk/MaskPanel";
import { PlaybackProvider, PlayerPanel } from "./desk/PlayerPanel";
import { ResizeHandle } from "./desk/ResizeHandle";
import { TimelinePanel } from "./desk/TimelinePanel";
import { vocabControlsOf } from "./desk/vocabControls";
import { useDeskData } from "./desk/deskData";
import { useLaneVisibility } from "./desk/lanes";
import type { DeskNotice } from "./desk/notice";
import { useIdentityWriter } from "./desk/writer";
import { useDeskStore, type EditorKind } from "./deskStore";

/**
 * The desk: one Clip, one Frame, one focused Task type. This shell only wires
 * the panels — the Clip rail, player, timeline, mask panel, editor rail and
 * Frame controls each own their own state.
 */
export function ClipDesk() {
  const { clipId } = useParams();
  const desk = useDeskData(clipId);
  const { clip, frameIndex, vocab } = desk;
  const [taskFocus, setTaskFocus] = useState<EditorKind>("class");
  const [notice, setNotice] = useState<DeskNotice>(null);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);

  const { laneVisibleFor, toggleLaneFor } = useLaneVisibility({
    focus: taskFocus,
    phaseFrames: desk.phaseDoc?.frames ?? {},
    classFrames: desk.classDoc?.frames ?? {},
    tripletFrames: desk.tripletDoc?.frames ?? {},
  });
  const writer = useIdentityWriter({
    clipId,
    focus: taskFocus,
    phaseVersion: desk.phaseDoc?.version,
    classVersion: desk.classDoc?.version,
    tripletVersion: desk.tripletDoc?.version,
    mutatePhase: desk.mutatePhase,
    mutateClass: desk.mutateClass,
    mutateTriplet: desk.mutateTriplet,
    notify: setNotice,
  });

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-wide">endo_label</span>
        <span className="text-muted-foreground" aria-hidden="true">/</span>
        <h1 className="text-sm font-semibold">{clip?.id ?? "Workbench"}</h1>
        {clip ? <DeskItemActions clipId={clip.id} taskType={taskFocus} /> : null}
      </header>
      <PlaybackProvider clip={clip} frameIndex={frameIndex}>
        <MaskSessionProvider
          clipId={clipId}
          clip={clip}
          frameIndex={frameIndex}
          tracks={desk.tracks}
          frameMasks={desk.frameMasks}
          mutateAnnotation={desk.mutateAnnotation}
          mutateFrameAnn={desk.mutateFrameAnn}
          notify={setNotice}
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
                <PlayerPanel
                  clipId={clipId}
                  clip={clip}
                  error={desk.clipError}
                  isLoading={desk.clipLoading}
                />
              </div>
              {clip?.frame_count ? (
                <TimelinePanel
                  clipId={clipId}
                  clip={clip}
                  frameIndex={frameIndex}
                  focus={taskFocus}
                  vocab={vocab}
                  phaseFrames={desk.phaseDoc?.frames ?? {}}
                  classFrames={desk.classDoc?.frames ?? {}}
                  tripletFrames={desk.tripletDoc?.frames ?? {}}
                  writer={writer}
                  notify={setNotice}
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
            <EditorRail
              clip={clip}
              frameIndex={frameIndex}
              focus={taskFocus}
              onFocus={setTaskFocus}
              vocab={vocab}
              controls={vocabControlsOf(vocab)}
              phaseDoc={desk.phaseDoc}
              classDoc={desk.classDoc}
              tripletDoc={desk.tripletDoc}
              mutatePhase={desk.mutatePhase}
              mutateClass={desk.mutateClass}
              mutateTriplet={desk.mutateTriplet}
              mutateVocab={desk.mutateVocab}
              laneVisible={laneVisibleFor}
              onToggleLane={toggleLaneFor}
            />
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
        clip={clip}
        frameIndex={frameIndex}
        focus={taskFocus}
        vocab={vocab}
        writer={writer}
        notify={setNotice}
        notice={notice}
        height={layout.bottomBarHeight}
      />
    </main>
  );
}
