import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Loader2, Lock, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import useSWR, { type KeyedMutator } from "swr";
import {
  annotationFramePath,
  annotationSummaryPath,
  classClipPath,
  classFramePath,
  classSpanPath,
  clipDeskPath,
  frameClassTags,
  clipMediaPath,
  framePhaseName,
  frameTripletRows,
  getJson,
  getJsonAllow404,
  healthPath,
  jobPath,
  phaseClipPath,
  phaseFramePath,
  phaseSpanPath,
  sendJson,
  sessionFrameMaskPath,
  sessionPath,
  sessionPointPath,
  sessionPredictPath,
  sessionPropagatePath,
  sessionTrackPath,
  sessionUndoPath,
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
  type AnnotationSummary,
  type ClassDoc,
  type ClipListResponse,
  type ClipMeta,
  type FrameAnnotations,
  type HealthResponse,
  type PhaseDoc,
  type PredictResult,
  type PropagateDirection,
  type PropagateJobPublic,
  type SessionPublic,
  type TrackRow,
  type TripletDoc,
  type TripletRow,
  type UndoResponse,
  type Vocab,
  type VocabTriple,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { VideoPlayer } from "./components/ui/video-player";
import { MaskOverlay } from "./MaskOverlay";
import { useDeskStore, type EditorKind, type PaintChip } from "./deskStore";
import {
  PREDICT_DEBOUNCE_MS,
  SCRIBBLE_WIDTH_DEFAULT,
  SCRIBBLE_WIDTH_MAX,
  SCRIBBLE_WIDTH_MIN,
  activeTrackOrNull,
  clampScribbleWidth,
  dropPendingOnFrameChange,
  isUndoKey,
  leftoverPinsForActive,
  nextActiveTrack,
  splitPendingMarks,
  type PendingMark,
  type PendingPoint,
  type PendingStroke,
} from "./overlayCoords";
import { libraryRowSemanticStyle, nowEmptyText } from "./editorCards";
import { cn } from "./lib/utils";
import {
  hasMaskHandoff,
  isProtectedState,
  propagateTargetFrames,
  trackState,
} from "./trackState";
import { foldClass, foldPhase, foldTriplet, labelColor, type TimelineLane } from "./timeline";
import {
  WORKER_LOADING_LABEL,
  formatElapsed,
  workerLoadingToast,
  workerStatusIsLoading,
} from "./workerStatus";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
    return true;
  }
  return Boolean(target.closest('[role="textbox"], [role="combobox"], [role="searchbox"]'));
}

// The Job fills one Frame per status poll, so this is the fill rate too.
const JOB_POLL_MS = 400;

function chipLabel(chip: PaintChip): string {
  if (chip.kind === "class") {
    return `class: ${chip.name}`;
  }
  if (chip.kind === "phase") {
    return `phase: ${chip.name}`;
  }
  return `triplet: ${chip.instrument} / ${chip.verb} / ${chip.target}`;
}

function chipIdentity(chip: PaintChip): string {
  if (chip.kind === "triplet") {
    return `${chip.instrument} / ${chip.verb} / ${chip.target}`;
  }
  return chip.name;
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
  const { data: annotation, mutate: mutateAnnotation } = useSWR(
    clipId ? annotationSummaryPath(clipId) : null,
    getJsonAllow404<AnnotationSummary>,
  );
  const [taskFocus, setTaskFocus] = useState<EditorKind>("class");
  const storedIndex = useDeskStore((s) => s.frameIndex);
  const openClip = useDeskStore((s) => s.openClip);
  const scrub = useDeskStore((s) => s.scrub);
  const layout = useDeskStore((s) => s.layout);
  const setLayout = useDeskStore((s) => s.setLayout);
  const spanStart = useDeskStore((s) => s.spanStart);
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const paintChip = useDeskStore((s) => s.paintChip);
  const setPaintChip = useDeskStore((s) => s.setPaintChip);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const spanBusy = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingRef = useRef<PendingMark[]>([]);
  const debounceRef = useRef<number | null>(null);
  const prevClipId = useRef<string | undefined>(undefined);
  const predicting = useRef(false);
  const pendingFrame = useRef(0);
  const sessionOpen = useRef(false);
  const [pending, setPending] = useState<PendingMark[]>([]);
  const [scribbleWidth, setScribbleWidth] = useState(SCRIBBLE_WIDTH_DEFAULT);
  const [activeTrackId, setActiveTrackId] = useState<number | null>(null);
  // Session snapshot scoped to the Frame it was fetched for; leftover pins
  // render only while that Frame is on screen (ticket 08).
  const [sessionSnapshot, setSessionSnapshot] = useState<{ frame: number; tracks: TrackRow[] } | null>(null);
  const sessionFetchSeq = useRef(0);
  const [propagateDirection, setPropagateDirection] = useState<PropagateDirection>("forward");
  const [propagateMaxFrames, setPropagateMaxFrames] = useState("");
  const [propagateJob, setPropagateJob] = useState<PropagateJobPublic | null>(null);
  const jobPollRef = useRef<number | null>(null);
  // Ticket 10: planned span of the last completed Propagate Job, so a
  // Protected slot inside it that still reads manual/refined shows as kept.
  const [keptJob, setKeptJob] = useState<{
    start: number;
    direction: PropagateDirection;
    maxFrames: number | null;
  } | null>(null);
  // Story 86: overlay geometry input is off while a Job runs.
  const jobRunning = propagateJob != null;
  // Ticket 09: the Job blocks, so the desk shows an indeterminate state with
  // elapsed time — the whole span streams inside the first poll, so no honest
  // per-frame number exists (maintainer decision: no async).
  const [propagateElapsed, setPropagateElapsed] = useState(0);
  const { data: health } = useSWR(healthPath(), getJson<HealthResponse>, {
    refreshInterval: 5000,
  });
  const workerLoading = workerStatusIsLoading(health?.worker);

  useEffect(() => {
    if (!jobRunning) {
      return;
    }
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setPropagateElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [jobRunning]);

  const frameIndex = data && storedIndex >= data.frame_count ? Math.max(0, data.frame_count - 1) : storedIndex;
  const { data: frameAnn, mutate: mutateFrameAnn } = useSWR(
    clipId ? annotationFramePath(clipId, frameIndex) : null,
    getJsonAllow404<FrameAnnotations>,
  );
  const tracks: TrackRow[] = annotation?.tracks ?? [];
  const frameMasks = frameAnn?.masks ?? [];
  const frameKept =
    keptJob != null && propagateTargetFrames(keptJob, data?.frame_count ?? 0).has(frameIndex);
  // A snapshot from another Frame renders no pins — including the window
  // between scrub and its re-fetch landing (ticket 08 / story 36).
  const leftover =
    sessionSnapshot && sessionSnapshot.frame === frameIndex
      ? leftoverPinsForActive(sessionSnapshot.tracks, activeTrackId)
      : [];

  const togglePlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, []);

  const pausePlayback = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const clearPredictTimer = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const loadSessionFrame = useCallback(async (index: number) => {
    const fetchSeq = ++sessionFetchSeq.current;
    try {
      const session = await getJson<SessionPublic>(sessionPath(index));
      if (fetchSeq !== sessionFetchSeq.current) {
        // A newer Frame fetch superseded this one; never apply the stale shot.
        return;
      }
      if (!session.active) {
        sessionOpen.current = false;
        setSessionSnapshot(null);
        return;
      }
      sessionOpen.current = true;
      setSessionSnapshot({ frame: index, tracks: session.tracks ?? [] });
    } catch {
      if (fetchSeq === sessionFetchSeq.current) {
        setSessionSnapshot(null);
      }
    }
  }, []);

  // Lazy Session: the first Predict or Propagate opens it on this Clip.
  const ensureSession = useCallback(async () => {
    if (!clipId) {
      return;
    }
    const session = await getJson<SessionPublic>(sessionPath());
    if (!session.active) {
      await sendJson<SessionPublic>(sessionPath(), "POST", {
        clip_id: clipId,
        load_annotations: true,
      });
      return;
    }
    if (session.clip_id !== clipId) {
      await sendJson(sessionPath(), "DELETE");
      await sendJson<SessionPublic>(sessionPath(), "POST", {
        clip_id: clipId,
        load_annotations: true,
      });
    }
  }, [clipId]);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current != null) {
      window.clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopJobPolling(), [stopJobPolling]);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const job = await getJson<PropagateJobPublic>(jobPath(jobId));
      if (job.status === "completed" || job.status === "failed") {
        stopJobPolling();
        setPropagateJob(null);
        if (job.status === "completed") {
          setKeptJob({
            start: job.start_frame_index,
            direction: job.direction,
            maxFrames: job.max_frames,
          });
        }
        // ADR 0023: the completed Job already wrote Annotation; refresh both reads.
        await mutateAnnotation();
        await mutateFrameAnn();
        if (job.status === "failed") {
          setToast({ text: job.error ?? "Propagate failed", error: true });
        } else {
          setToast({
            text: `Propagate complete: ${job.frames_done} of ${job.frames_total} Frames filled`,
            error: false,
          });
        }
        return;
      }
      setPropagateJob(job);
    } catch {
      // Transient poll error: keep polling; the next tick retries.
    }
  }, [mutateAnnotation, mutateFrameAnn, stopJobPolling]);

  const runPredict = useCallback(async () => {
    if (!clipId || predicting.current || jobRunning || pendingRef.current.length === 0) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    const marks = pendingRef.current;
    setToast(null);
    try {
      await ensureSession();
      const split = splitPendingMarks(marks);
      const body: {
        frame_index: number;
        points: number[][];
        point_labels: number[];
        scribbles?: number[][][];
        scribble_labels?: number[];
        scribble_widths?: number[];
        track_id?: number;
      } = {
        frame_index: frameIndex,
        points: split.points,
        point_labels: split.point_labels,
      };
      if (split.scribbles.length > 0) {
        body.scribbles = split.scribbles;
        body.scribble_labels = split.scribble_labels;
        body.scribble_widths = split.scribble_widths;
      }
      if (activeTrackId != null) {
        body.track_id = activeTrackId;
      }
      const result = await sendJson<PredictResult>(sessionPredictPath(), "POST", body);
      pendingRef.current = [];
      setPending([]);
      if (result.tracks.length > 0) {
        const created = Math.max(...result.tracks.map((row) => row.track_id));
        setActiveTrackId((current) => nextActiveTrack(current, { kind: "created", trackId: created }));
      }
      sessionOpen.current = true;
      // pendingFrame tracks the Frame on screen: a scrub during Predict
      // re-scopes the snapshot to that Frame, not the predicted one.
      await loadSessionFrame(pendingFrame.current);
      await mutateAnnotation();
      await mutateFrameAnn();
      // A hand edit supersedes the last Job's kept readout.
      setKeptJob(null);
    } catch (err) {
      // A failure while the checkpoint loads is a state, not an unexplained error.
      setToast(workerLoadingToast(err, "Predict failed"));
    } finally {
      predicting.current = false;
    }
  }, [activeTrackId, clearPredictTimer, clipId, ensureSession, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn]);

  const schedulePredict = useCallback(() => {
    clearPredictTimer();
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void runPredict();
    }, PREDICT_DEBOUNCE_MS);
  }, [clearPredictTimer, runPredict]);

  const onClickPoint = useCallback((point: PendingPoint) => {
    setActiveTrackId((current) => nextActiveTrack(current, { kind: "picture" }));
    const next = [...pendingRef.current, point];
    pendingRef.current = next;
    setPending(next);
    schedulePredict();
  }, [schedulePredict]);

  const onClickStroke = useCallback((stroke: PendingStroke) => {
    setActiveTrackId((current) => nextActiveTrack(current, { kind: "picture" }));
    const next = [...pendingRef.current, stroke];
    pendingRef.current = next;
    setPending(next);
    schedulePredict();
  }, [schedulePredict]);

  const onScribbleWidth = useCallback((value: number) => {
    setScribbleWidth(clampScribbleWidth(value));
  }, []);

  const onDeletePin = useCallback(async (index: number) => {
    if (activeTrackId == null || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    setToast(null);
    try {
      await sendJson<SessionPublic>(sessionPointPath(activeTrackId, frameIndex, index), "DELETE");
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
      await mutateFrameAnn();
      setKeptJob(null);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Pin delete failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [activeTrackId, clearPredictTimer, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn]);

  const onClearMask = useCallback(async () => {
    if (activeTrackId == null || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    setToast(null);
    try {
      await sendJson<SessionPublic>(sessionFrameMaskPath(activeTrackId, frameIndex), "DELETE");
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
      await mutateFrameAnn();
      setKeptJob(null);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Clear mask failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [activeTrackId, clearPredictTimer, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn]);

  const runUndo = useCallback(async () => {
    if (!clipId || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    setToast(null);
    try {
      const result = await sendJson<UndoResponse>(sessionUndoPath(), "POST", {
        frame_index: frameIndex,
      });
      sessionOpen.current = true;
      const sessionTracksNow = result.session.tracks ?? [];
      // The response is in hand: supersede any in-flight frame fetch so its
      // late landing cannot overwrite this snapshot.
      sessionFetchSeq.current += 1;
      setSessionSnapshot({ frame: frameIndex, tracks: sessionTracksNow });
      setActiveTrackId((current) => activeTrackOrNull(current, sessionTracksNow));
      await mutateAnnotation();
      await mutateFrameAnn();
      setKeptJob(null);
      if (!result.undone) {
        setToast({ text: "Nothing to undo on this Frame", error: false });
      }
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Undo failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [clearPredictTimer, clipId, frameIndex, jobRunning, mutateAnnotation, mutateFrameAnn]);

  const runPropagate = useCallback(async () => {
    if (!clipId || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    setToast(null);
    try {
      await ensureSession();
      const rawMax = propagateMaxFrames.trim();
      let maxFrames: number | null = null;
      if (rawMax) {
        const parsed = Number(rawMax);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setToast({
            text: "Max frames must be blank (to the Clip edge) or a whole number of 0 or more",
            error: true,
          });
          return;
        }
        maxFrames = Math.floor(parsed);
      }
      // Explicit start from the Frame on screen; never a follow-on to Predict.
      const job = await sendJson<PropagateJobPublic>(sessionPropagatePath(), "POST", {
        direction: propagateDirection,
        start_frame_index: frameIndex,
        max_frames: maxFrames,
      });
      setKeptJob(null);
      if (job.status === "completed") {
        // Zero-target Job: its Annotation merge write already happened.
        await mutateAnnotation();
        await mutateFrameAnn();
        setToast({ text: "Propagate complete: no Frames to fill from here", error: false });
        return;
      }
      // Elapsed is reset here at Job start; the interval effect only ticks.
      setPropagateElapsed(0);
      setPropagateJob(job);
      jobPollRef.current = window.setInterval(() => {
        void pollJob(job.job_id);
      }, JOB_POLL_MS);
    } catch (err) {
      setToast(workerLoadingToast(err, "Propagate failed"));
    } finally {
      predicting.current = false;
    }
  }, [
    clipId,
    ensureSession,
    frameIndex,
    jobRunning,
    mutateAnnotation,
    mutateFrameAnn,
    pollJob,
    propagateDirection,
    propagateMaxFrames,
  ]);

  const onRenameTrack = useCallback(async (trackId: number, label: string) => {
    setToast(null);
    try {
      await sendJson<SessionPublic>(sessionTrackPath(trackId), "PATCH", { label });
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Track Label edit failed", error: true });
    }
  }, [frameIndex, loadSessionFrame, mutateAnnotation]);

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
  const hasChip = Boolean(paintChip);

  const applyRange = useCallback(async (remove: boolean) => {
    if (!clipId || !data || !paintChip || spanBusy.current) {
      return;
    }
    spanBusy.current = true;
    setToast(null);
    try {
      if (paintChip.kind === "phase") {
        const doc = await sendJson<PhaseDoc>(phaseSpanPath(clipId), "POST", {
          phase: remove ? null : paintChip.name,
          from: rangeFrom,
          to: rangeTo,
        });
        await mutatePhase(doc, { revalidate: false });
      } else if (paintChip.kind === "class") {
        const doc = await sendJson<ClassDoc>(classSpanPath(clipId), "POST", {
          tag: paintChip.name,
          from: rangeFrom,
          to: rangeTo,
          on: !remove,
        });
        await mutateClass(doc, { revalidate: false });
      } else {
        const doc = await sendJson<TripletDoc>(tripletSpanPath(clipId), "POST", {
          instrument: paintChip.instrument,
          verb: paintChip.verb,
          target: paintChip.target,
          from: rangeFrom,
          to: rangeTo,
          op: remove ? "remove" : "add",
        });
        await mutateTriplet(doc, { revalidate: false });
      }
      setSpanStart(null);
      setToast({
        text: `${remove ? "Removed" : "Wrote"} ${chipLabel(paintChip)} on frames ${rangeFrom}–${rangeTo}`,
        error: false,
      });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : "Write failed", error: true });
    } finally {
      spanBusy.current = false;
    }
  }, [clipId, data, mutateClass, mutatePhase, mutateTriplet, paintChip, rangeFrom, rangeTo, setSpanStart]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        // Pending marks that never Predict-ed are dropped, not Undo-able.
        clearPredictTimer();
        if (pendingRef.current.length > 0) {
          pendingRef.current = [];
          setPending([]);
        }
        return;
      }
      if (isUndoKey(event)) {
        event.preventDefault();
        void runUndo();
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
      if (!clipId || !data || data.frame_count <= 0 || !paintChip) {
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
  }, [applyRange, clearPredictTimer, clipId, data, frameIndex, paintChip, runUndo, setSpanStart, togglePlayback]);

  useLayoutEffect(() => {
    if (data) {
      openClip(data.id, data.frame_count);
    }
  }, [data, openClip]);

  useEffect(() => {
    const fromFrame = pendingFrame.current;
    pendingFrame.current = frameIndex;
    if (fromFrame === frameIndex) {
      return;
    }
    clearPredictTimer();
    if (pendingRef.current.length > 0) {
      pendingRef.current = dropPendingOnFrameChange(pendingRef.current, fromFrame, frameIndex);
      setPending(pendingRef.current);
    }
    // Every Frame change re-scopes the snapshot: leftover pins from the
    // previous Frame must not survive the scrub (ticket 08 / story 36).
    if (sessionOpen.current) {
      void loadSessionFrame(frameIndex);
    }
  }, [clearPredictTimer, frameIndex, loadSessionFrame]);

  useEffect(() => {
    const prev = prevClipId.current;
    prevClipId.current = clipId;
    if (!prev || prev === clipId) {
      return;
    }
    pendingRef.current = [];
    setPending([]);
    sessionOpen.current = false;
    sessionFetchSeq.current += 1;
    setSessionSnapshot(null);
    setActiveTrackId(null);
    clearPredictTimer();
    stopJobPolling();
    setPropagateJob(null);
    setKeptJob(null);
    void sendJson(sessionPath(), "DELETE").catch(() => undefined);
  }, [clearPredictTimer, clipId, stopJobPolling]);

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
                  >
                    <MaskOverlay
                      videoRef={videoRef}
                      masks={frameMasks}
                      tracks={tracks}
                      leftover={leftover}
                      pending={pending}
                      width={scribbleWidth}
                      inputEnabled={!jobRunning}
                      onPause={pausePlayback}
                      onClickPoint={onClickPoint}
                      onStroke={onClickStroke}
                      onDeletePin={(index) => void onDeletePin(index)}
                    />
                  </VideoPlayer>
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
          className="flex shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-2"
          style={{ width: layout.editorRailWidth }}
        >
          <TrackRail
            tracks={tracks}
            activeTrackId={activeTrackId}
            pendingCount={pending.length}
            scribbleWidth={scribbleWidth}
            canUndo={(sessionSnapshot?.tracks.length ?? 0) > 0}
            busy={jobRunning}
            canPropagate={frameMasks.length > 0}
            frameMasks={frameMasks}
            frameKept={frameKept}
            propagateJob={propagateJob}
            propagateElapsed={propagateElapsed}
            propagateDirection={propagateDirection}
            propagateMaxFrames={propagateMaxFrames}
            onPropagateDirection={setPropagateDirection}
            onPropagateMaxFrames={setPropagateMaxFrames}
            onPropagate={() => void runPropagate()}
            onScribbleWidth={onScribbleWidth}
            onPredict={() => void runPredict()}
            onUndo={() => void runUndo()}
            onSelectTrack={(trackId) => setActiveTrackId(nextActiveTrack(activeTrackId, { kind: "rail", trackId }))}
            onNewTrack={() => setActiveTrackId(nextActiveTrack(activeTrackId, { kind: "new" }))}
            onRenameTrack={onRenameTrack}
            onClearMask={() => void onClearMask()}
          />
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
                  mutateClass={mutateClass}
                  mutateVocab={mutateVocab}
                  onPaint={setPaintChip}
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
                  onPaint={setPaintChip}
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
                  onPaint={setPaintChip}
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
        <span
          data-paint-chip=""
          data-label-color={paintChip ? labelColor(chipIdentity(paintChip)) : undefined}
          className="max-w-48 truncate text-xs font-medium"
          style={paintChip ? { borderLeft: `3px solid ${labelColor(chipIdentity(paintChip))}`, paddingLeft: 6 } : undefined}
        >
          {paintChip ? chipLabel(paintChip) : "No paint chip"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasChip || !clipId}
          onClick={() => {
            if (clipId && paintChip) {
              setSpanStart({ clipId, frameIndex });
            }
          }}
        >
          Mark from
        </Button>
        <Button type="button" size="sm" disabled={!hasChip} onClick={() => void applyRange(false)}>
          Apply to frames {rangeFrom}–{rangeTo}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!hasChip} onClick={() => void applyRange(true)}>
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
      {lanes.length > 0 ? (
        <div className="max-h-44 overflow-y-auto [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
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
        </div>
      ) : null}
    </div>
  );
}

function TrackRail({
  tracks,
  activeTrackId,
  pendingCount,
  scribbleWidth,
  canUndo,
  busy,
  canPropagate,
  frameMasks,
  frameKept,
  propagateJob,
  propagateElapsed,
  propagateDirection,
  propagateMaxFrames,
  onPropagateDirection,
  onPropagateMaxFrames,
  onPropagate,
  onScribbleWidth,
  onPredict,
  onUndo,
  onSelectTrack,
  onNewTrack,
  onRenameTrack,
  onClearMask,
}: {
  tracks: TrackRow[];
  activeTrackId: number | null;
  pendingCount: number;
  scribbleWidth: number;
  canUndo: boolean;
  busy: boolean;
  canPropagate: boolean;
  frameMasks: FrameAnnotations["masks"];
  frameKept: boolean;
  propagateJob: PropagateJobPublic | null;
  propagateElapsed: number;
  propagateDirection: PropagateDirection;
  propagateMaxFrames: string;
  onPropagateDirection: (direction: PropagateDirection) => void;
  onPropagateMaxFrames: (value: string) => void;
  onPropagate: () => void;
  onScribbleWidth: (width: number) => void;
  onPredict: () => void;
  onUndo: () => void;
  onSelectTrack: (trackId: number) => void;
  onNewTrack: () => void;
  onRenameTrack: (trackId: number, label: string) => Promise<void> | void;
  onClearMask: () => void;
}) {
  const [renaming, setRenaming] = useState<{ trackId: number; draft: string } | null>(null);

  function commitRename() {
    const current = renaming;
    setRenaming(null);
    if (!current) {
      return;
    }
    const label = current.draft.trim();
    if (!label) {
      return;
    }
    void onRenameTrack(current.trackId, label);
  }

  return (
    <section aria-label="Tracks" className="flex shrink-0 flex-col gap-2 rounded-lg border border-border/70 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tracks</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            {tracks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={onNewTrack}>
            New Track
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pendingCount === 0 || busy}
            onClick={onPredict}
          >
            Predict
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2" data-scribble-width="">
        <label htmlFor="scribble-width" className="shrink-0 text-xs text-muted-foreground">
          Width
        </label>
        <input
          id="scribble-width"
          type="range"
          min={SCRIBBLE_WIDTH_MIN}
          max={SCRIBBLE_WIDTH_MAX}
          step={1}
          value={scribbleWidth}
          onChange={(event) => onScribbleWidth(Number(event.target.value))}
          className="min-w-0 flex-1"
          aria-label="Scribble width"
        />
        <output htmlFor="scribble-width" className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {scribbleWidth}
        </output>
      </div>
      <div className="flex items-center gap-1" data-track-controls="">
        <Button type="button" size="sm" variant="outline" disabled={busy || !canUndo} onClick={onUndo}>
          Undo
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || activeTrackId == null} onClick={onClearMask}>
          Clear mask
        </Button>
      </div>
      <div data-propagate="" className="flex shrink-0 flex-col gap-1 border-t border-border/50 pt-2">
        <div className="flex items-center justify-between gap-1">
          <div role="radiogroup" aria-label="Propagate direction" className="flex shrink-0 gap-0.5">
            {(["forward", "backward", "both"] as const).map((direction) => (
              <Button
                key={direction}
                type="button"
                size="sm"
                role="radio"
                variant={propagateDirection === direction ? "secondary" : "ghost"}
                aria-checked={propagateDirection === direction}
                disabled={busy}
                onClick={() => onPropagateDirection(direction)}
              >
                {direction}
              </Button>
            ))}
          </div>
          <Input
            aria-label="Max frames per direction"
            type="number"
            min={0}
            step={1}
            placeholder="to edge"
            value={propagateMaxFrames}
            disabled={busy}
            className="h-7 w-20 shrink-0 text-xs"
            onChange={(event) => onPropagateMaxFrames(event.target.value)}
          />
        </div>
        <Button type="button" size="sm" disabled={!canPropagate || busy} onClick={onPropagate}>
          Propagate
        </Button>
        {propagateJob ? (
          // Indeterminate: progress stays 0 while the first poll streams the
          // whole span, so elapsed time is the only honest readout (ticket 09).
          <p role="status" data-propagate-progress="" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" size={12} className="shrink-0 animate-spin" />
            <span>
              Propagating… {formatElapsed(propagateElapsed)} from Frame{" "}
              {propagateJob.start_frame_index} — mask edits wait until it finishes.
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Fills from this Frame; re-run replaces non-protected propagated masks.
          </p>
        )}
      </div>
      {tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Tracks</p>
      ) : (
        <ul aria-label="Track list" className="space-y-1">
          {tracks.map((track) => {
            const mask = frameMasks.find((row) => row.track_id === track.track_id);
            const state = trackState(mask?.source);
            const protectedState = isProtectedState(state);
            const handoff = hasMaskHandoff(mask?.model_provenance);
            const kept = frameKept && protectedState;
            const badge = `${state}${handoff ? " · handoff" : ""}${kept ? " · kept" : ""}`;
            return (
              <li key={track.track_id} className="flex items-center gap-1">
                {renaming?.trackId === track.track_id ? (
                  <Input
                    aria-label="Track Label"
                    value={renaming.draft}
                    autoFocus
                    className="h-7 min-w-0 flex-1 text-xs"
                    onChange={(event) => setRenaming({ trackId: track.track_id, draft: event.target.value })}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === "Escape") {
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={activeTrackId === track.track_id ? "secondary" : "ghost"}
                    aria-pressed={activeTrackId === track.track_id}
                    className="min-w-0 flex-1 justify-start gap-2"
                    title="Double-click to rename"
                    onClick={() => onSelectTrack(track.track_id)}
                    onDoubleClick={() => setRenaming({ trackId: track.track_id, draft: track.label })}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: track.color }}
                    />
                    <span className="truncate">{track.label}</span>
                  </Button>
                )}
                <span
                  role="img"
                  data-track-state={state}
                  data-protected={protectedState ? "true" : undefined}
                  data-kept={kept ? "true" : undefined}
                  aria-label={`${badge}${protectedState ? " — Protected" : ""}`}
                  title={
                    protectedState
                      ? kept
                        ? "Protected — the last Propagate left this mask untouched"
                        : "Protected — Propagate will not overwrite this mask"
                      : undefined
                  }
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none",
                    protectedState
                      ? "bg-secondary font-medium text-foreground"
                      : "bg-secondary/60 text-muted-foreground",
                  )}
                >
                  {protectedState ? <Lock aria-hidden="true" size={10} className="shrink-0" /> : null}
                  <span className="whitespace-nowrap">{badge}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
  onPick,
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
  onPick: (name: string) => void;
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
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  classFrames: Record<string, string[]>;
  classTags: string[];
  mutateClass: KeyedMutator<ClassDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = frameClassTags(classFrames, frameIndex);

  async function writeTags(tags: string[], painted?: { name: string; on: boolean }) {
    setError(null);
    try {
      const doc = await sendJson<ClassDoc>(classFramePath(clipId, frameIndex), "PUT", { tags });
      await mutateClass(doc, { revalidate: false });
      if (painted) {
        onPaint(painted.on ? { kind: "class", name: painted.name } : null);
      }
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
          disabled={frameCount <= 0}
          listName="class_tags"
          renameLabel="Rename class tag"
          deleteLabel={(name) => `Delete class tag ${name}`}
          mutateVocab={mutateVocab}
          onAfterChange={async () => {
            await mutateClass();
          }}
          onPick={(name) => {
            const on = !current.includes(name);
            void writeTags(toggleClassTag(current, name), { name, on });
          }}
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
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  phaseFrames: Record<string, string>;
  phases: string[];
  mutatePhase: KeyedMutator<PhaseDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = framePhaseName(phaseFrames, frameIndex);

  async function writePhase(phase: string | null) {
    setError(null);
    try {
      const doc = await sendJson<PhaseDoc>(phaseFramePath(clipId, frameIndex), "PUT", { phase });
      await mutatePhase(doc, { revalidate: false });
      onPaint(phase ? { kind: "phase", name: phase } : null);
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
  onPaint,
}: {
  clipId: string;
  frameIndex: number;
  frameCount: number;
  tripletFrames: Record<string, TripletRow[]>;
  triples: VocabTriple[];
  mutateTriplet: KeyedMutator<TripletDoc>;
  mutateVocab: KeyedMutator<Vocab>;
  onPaint: (chip: PaintChip | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ instrument: "", verb: "", target: "" });
  const [renameCell, setRenameCell] = useState<{
    row: VocabTriple;
    slot: "instrument" | "verb" | "target";
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const clickTimer = useRef<number | null>(null);

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
      const result = await sendJson<Record<string, unknown>>(tripletFramePath(clipId, frameIndex), "POST", row);
      await mutateTriplet();
      if ("rows" in result) {
        onPaint(null);
      } else {
        onPaint({ kind: "triplet", instrument: row.instrument, verb: row.verb, target: row.target });
      }
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
                    <div className="w-7 shrink-0" aria-hidden="true" />
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              {triples.map((row) => {
                const key = tripleIdentity(row);
                const lit = onKeys.has(key);
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
