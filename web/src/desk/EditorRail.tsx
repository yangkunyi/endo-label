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
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateClass: KeyedMutator<ClassDoc>;
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<ScopedVocab>;
  laneVisible: (identity: string) => boolean;
  onToggleLane: (identity: string) => void;
}) {
  const editorRailWidth = useDeskStore((s) => s.layout.editorRailWidth);

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
      <div role="tabpanel" className="flex flex-col">
        {clip ? (
          focus === "class" ? (
            <ClassEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              classFrames={classDoc?.frames ?? {}}
              classTags={vocab?.class_tags ?? []}
              version={classDoc?.version}
              mutateClass={mutateClass}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
            />
          ) : focus === "triplet" ? (
            <TripletEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              tripletFrames={tripletDoc?.frames ?? {}}
              triples={vocab?.triples ?? []}
              version={tripletDoc?.version}
              mutateTriplet={mutateTriplet}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
            />
          ) : (
            <PhaseEditor
              clipId={clip.id}
              frameIndex={frameIndex}
              frameCount={clip.frame_count}
              phaseFrames={phaseDoc?.frames ?? {}}
              phases={vocab?.phases ?? []}
              version={phaseDoc?.version}
              mutatePhase={mutatePhase}
              mutateVocab={mutateVocab}
              laneVisible={laneVisible}
              onToggleLane={onToggleLane}
              controls={controls}
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
