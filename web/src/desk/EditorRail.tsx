import type { KeyedMutator } from "swr";
import {
  frameClassTags,
  framePhaseName,
  frameTripletRows,
  type ClassDoc,
  type ClipMeta,
  type PhaseDoc,
  type ScopedVocab,
  type TripletDoc,
} from "../api";
import { Button } from "../components/ui/button";
import { useDeskStore, type EditorKind } from "../deskStore";
import { ClassEditor, OtherSummary, PhaseEditor, TripletEditor } from "./EditorCards";
import { MaskPanel } from "./MaskPanel";
import { LABEL_READ_FAILED, useItemWrite, writeReadFailure } from "./maskControls";
import type { VocabControls } from "./vocabControls";

/** The right rail: the mask panel, the Task type tabs and the focused Task
 * type's Now / Library cards, with the other two summarised underneath. */
export function EditorRail({
  clip,
  frameIndex,
  focus,
  onFocus,
  vocab,
  controls,
  phaseDoc,
  classDoc,
  tripletDoc,
  version,
  mutatePhase,
  mutateClass,
  mutateTriplet,
  mutateVocab,
  laneVisible,
  onToggleLane,
}: {
  clip: ClipMeta | undefined;
  frameIndex: number;
  focus: EditorKind;
  onFocus: (kind: EditorKind) => void;
  vocab: ScopedVocab | undefined;
  controls: VocabControls;
  phaseDoc: PhaseDoc | undefined;
  classDoc: ClassDoc | undefined;
  tripletDoc: TripletDoc | undefined;
  version: number | undefined;
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateClass: KeyedMutator<ClassDoc>;
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (identity: string) => boolean;
  onToggleLane: (identity: string) => void;
}) {
  const editorRailWidth = useDeskStore((s) => s.layout.editorRailWidth);
  // The focused Task type's own item cell: phase, class and triplet are three items on
  // the Clip, each assigned on its own, so which of them this Account may write is a
  // question per tab. The server refuses a write with a sentence (`write_refusal`), and
  // the desk shows that sentence before the click rather than after it — the mask panel's
  // rule (ADR 0030), which the label editors used to be alone in not following.
  const write = useItemWrite(clip?.id, focus);
  // The desk's own line for the other reason the editors are off: `/api/me` ended
  // without an answer, so there is no server sentence to show.
  const readFailure = writeReadFailure(write, LABEL_READ_FAILED);

  return (
    <div
      role="region"
      aria-label="Editors"
      className="flex shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-2"
      style={{ width: editorRailWidth }}
    >
      <MaskPanel />
      <div role="tablist" aria-label="Task type" className="flex shrink-0 gap-1">
        {(["class", "triplet", "phase"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            role="tab"
            size="sm"
            variant={focus === kind ? "default" : "ghost"}
            aria-selected={focus === kind}
            onClick={() => onFocus(kind)}
          >
            {kind}
          </Button>
        ))}
      </div>
      {write.refusal ? (
        // Why the editors below are off, in the server's own words: the sentence a write
        // would be refused with. It names the way out — the admin assigns the item.
        <p
          data-label-refusal=""
          className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          {write.refusal}
        </p>
      ) : null}
      {readFailure ? (
        <p
          data-label-read-failed=""
          className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          {readFailure}
        </p>
      ) : null}
      <div role="tabpanel" className="flex flex-col">
        {clip ? (
          focus === "class" ? (
            <ClassEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              classFrames={classDoc?.frames ?? {}}
              classTags={vocab?.class_tags ?? []}
              version={version}
              mutateClass={mutateClass}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
              write={write}
            />
          ) : focus === "triplet" ? (
            <TripletEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              tripletFrames={tripletDoc?.frames ?? {}}
              triples={vocab?.triples ?? []}
              version={version}
              mutateTriplet={mutateTriplet}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
              write={write}
            />
          ) : (
            <PhaseEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              phaseFrames={phaseDoc?.frames ?? {}}
              phases={vocab?.phases ?? []}
              version={version}
              mutatePhase={mutatePhase}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
              write={write}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">Choose a Clip to edit this Task type.</p>
        )}
      </div>
      {clip ? (
        <OtherSummary
          focus={focus}
          phase={framePhaseName(phaseDoc?.frames ?? {}, frameIndex)}
          classTags={frameClassTags(classDoc?.frames ?? {}, frameIndex)}
          triplets={frameTripletRows(tripletDoc?.frames ?? {}, frameIndex)}
          onFocus={onFocus}
        />
      ) : null}
    </div>
  );
}
