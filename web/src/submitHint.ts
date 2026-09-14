import {
  annotationSummaryPath,
  classClipPath,
  clipMetaPath,
  getJson,
  getJsonAllow404,
  phaseClipPath,
  tripletClipPath,
  type AnnotationSummary,
  type ClassDoc,
  type ClipMeta,
  type PhaseDoc,
  type TripletDoc,
} from "./api";
import { maskCoverageCounts } from "./maskCoverage";
import { foldCoverage, submitGapNotice } from "./timeline";

/**
 * The Submit hint: a submit with Unlabeled gaps goes through, and first says how
 * many Frames are missing for the Task type being submitted (ADR 0029). Nothing
 * here may refuse or block — an unreadable coverage map reads as "no hint".
 */

/**
 * Where a Submit gets its sentence. The desk answers from the coverage map it
 * already draws; the board — which has no desk mounted — reads the Clip's own
 * documents through `clipSubmitHint`. Both end at `submitGapNotice`.
 */
export type SubmitHintSource = () => Promise<string | null> | string | null;

/**
 * The Submit sentence for one (Clip, Task type) read from outside the desk: the
 * same documents the Coverage Strip folds (phase / class / triplet) or, for mask,
 * the same Annotation summary that strip's own row draws (06). No second
 * definition of coverage exists to disagree with.
 *
 * `null` when there is nothing to say — a fully covered Clip, or a Task type the
 * desk carries no coverage strip for.
 */
export async function clipSubmitHint(clipId: string, taskType: string): Promise<string | null> {
  const clip = await getJson<ClipMeta>(clipMetaPath(clipId));
  const total = Math.max(0, clip.frame_count);
  const empty = { phaseFrames: {}, classFrames: {}, tripletFrames: {} } as const;
  if (taskType === "mask") {
    const summary = await getJsonAllow404<AnnotationSummary>(annotationSummaryPath(clipId));
    return submitGapNotice(maskCoverageCounts(summary, total));
  }
  if (taskType === "phase") {
    const doc = await getJson<PhaseDoc>(phaseClipPath(clipId));
    return submitGapNotice(
      foldCoverage({ task: "phase", frameCount: total, ...empty, phaseFrames: doc.frames }),
    );
  }
  if (taskType === "class") {
    const doc = await getJson<ClassDoc>(classClipPath(clipId));
    return submitGapNotice(
      foldCoverage({ task: "class", frameCount: total, ...empty, classFrames: doc.frames }),
    );
  }
  if (taskType === "triplet") {
    const doc = await getJson<TripletDoc>(tripletClipPath(clipId));
    return submitGapNotice(
      foldCoverage({ task: "triplet", frameCount: total, ...empty, tripletFrames: doc.frames }),
    );
  }
  // mask, phase, class and triplet are every Task type an Assignment can hold.
  return null;
}
