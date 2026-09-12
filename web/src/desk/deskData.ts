import { useLayoutEffect } from "react";
import useSWR from "swr";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  getJson,
  getJsonAllow404,
  phaseClipPath,
  tripletClipPath,
  vocabPath,
  type AnnotationSummary,
  type ClassDoc,
  type ClipMeta,
  type FrameAnnotations,
  type PhaseDoc,
  type ScopedVocab,
  type TrackRow,
  type TripletDoc,
} from "../api";
import { useDeskStore } from "../deskStore";

/** Every read the desk needs for one Clip, plus the Frame cursor it hangs off. */
export function useDeskData(clipId: string | undefined) {
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
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;
  const { data: frameAnn, mutate: mutateFrameAnn } = useSWR(
    clipId ? annotationFramePath(clipId, frameIndex) : null,
    getJsonAllow404<FrameAnnotations>,
  );
  const tracks: TrackRow[] = annotation?.tracks ?? [];
  const frameMasks = frameAnn?.masks ?? [];

  useLayoutEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  // One Clip carries one version across its Task types, so a save of any kind
  // bumps the number all three docs carry. The freshest value on hand is the
  // one the next save must echo back, whatever kind that save is.
  const labelVersions = [phaseDoc?.version, classDoc?.version, tripletDoc?.version];
  const version = labelVersions.reduce<number | undefined>(
    (newest, held) =>
      held !== undefined && (newest === undefined || held > newest) ? held : newest,
    undefined,
  );

  return {
    clip: data,
    clipError: error,
    clipLoading: isLoading,
    frameIndex,
    version,
    frameMasks,
    tracks,
    phaseDoc,
    classDoc,
    tripletDoc,
    vocab,
    mutatePhase,
    mutateClass,
    mutateTriplet,
    mutateVocab,
    mutateAnnotation,
    mutateFrameAnn,
  };
}
