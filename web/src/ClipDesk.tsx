import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { controlToBlur } from "./desk/focusGuard";
import { useLaneVisibility } from "./desk/lanes";
import type { DeskNotice } from "./desk/notice";
import { useIdentityWriter } from "./desk/writer";
import { useDeskStore, type EditorKind } from "./deskStore";
import { foldCoverage } from "./timeline";

/**
 * A mouse click must not leave focus on the control it hit: with focus on a
 * button, Enter re-fires it (and with focus on a checkbox, Space toggles it
 * instead of the transport), and the desk's shortcuts then read as intercepted.
 * `controlToBlur` is that rule, over the click's *effective* control — the rail's
 * scope toggle is a `<label>` around its checkbox, so a click on its words is a
 * click on the checkbox. Keyboard users who Tab to a control keep Space/Enter.
 *
 * The predicate is pinned in `web/src/desk/focusGuard.test.ts`. The *wiring* —
 * this handler attached to the desk's `<main>` — is hand-verified, not pinned:
 * a node test has no DOM to render `<main>`, so a refactor that drops the prop
 * leaves that unit test green. It is on the owner's list (AGENTS.md →
 * Verification; `.scratch/pilot-ux/notes/21-the-pins-this-range-still-owes.md`).
 */
function releaseFocus(event: ReactPointerEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  controlToBlur(target)?.blur();
}

/**
 * The desk: one Clip, one Frame, one focused Task type. This shell only wires
 * the panels — the Clip rail, player, timeline, mask panel, editor rail and
 * Frame controls each own their own state.
 */
export function ClipDesk() {  const { clipId } = useParams();
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
    version: desk.version,
    mutatePhase: desk.mutatePhase,
    mutateClass: desk.mutateClass,
    mutateTriplet: desk.mutateTriplet,
    notify: setNotice,
  });

  // One derived coverage map per Task type, for the whole desk: the Coverage
  // Strip draws it, `n` walks its gaps, and Submit names its count. Nothing
  // reads a second source of coverage (ADR 0029). A desk with no Clip simply
  // has no Frames to cover.
  const coverage = useMemo(
    () =>
      foldCoverage({
        task: taskFocus,
        frameCount: clip?.frame_count ?? 0,
        phaseFrames: desk.phaseDoc?.frames ?? {},
        classFrames: desk.classDoc?.frames ?? {},
        tripletFrames: desk.tripletDoc?.frames ?? {},
      }),
    [clip?.frame_count, desk.classDoc, desk.phaseDoc, desk.tripletDoc, taskFocus],
  );

  // `onPointerUp={releaseFocus}` below is the hand-verified wiring; the rule it
  // runs is pinned in `focusGuard.test.ts` (see the comment above `releaseFocus`).
  return (
    <main
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
      onPointerUp={releaseFocus}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold tracking-wide">endo_label</span>
        <span className="text-muted-foreground" aria-hidden="true">/</span>
        <h1 className="text-sm font-semibold">{clip?.id ?? "Workbench"}</h1>
        {clip ? (
          <DeskItemActions clipId={clip.id} taskType={taskFocus} coverage={coverage} />
        ) : null}
      </header>
      {/* The Frame controls bar belongs to the playback context: `[`/`]`/`i`/`o`
          and the `n` jump are Frame moves, and the notice line they answer on
          lives here. */}
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
                  annotation={desk.annotation}
                  coverage={coverage}
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
              version={desk.version}
              mutatePhase={desk.mutatePhase}
              mutateClass={desk.mutateClass}
              mutateTriplet={desk.mutateTriplet}
              mutateVocab={desk.mutateVocab}
              laneVisible={laneVisibleFor}
              onToggleLane={toggleLaneFor}
            />
          </div>
        </MaskSessionProvider>
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
          coverage={coverage}
          height={layout.bottomBarHeight}
        />
      </PlaybackProvider>
    </main>
  );
}
