import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Eye, EyeOff, Loader2, Lock, Trash2 } from "lucide-react";
import { useSWRConfig, type KeyedMutator } from "swr";
import {
  annotationFramePath,
  getJson,
  jobPath,
  sessionFrameMaskPath,
  sessionPath,
  sessionPointPath,
  sessionPredictPath,
  sessionPropagatePath,
  sessionTrackPath,
  sessionUndoPath,
  sendJson,
  type AnnotationSummary,
  type ClipMeta,
  type FrameAnnotations,
  type PredictResult,
  type PropagateDirection,
  type PropagateJobPublic,
  type SessionPublic,
  type TrackRow,
  type UndoResponse,
} from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { MaskOverlay } from "../MaskOverlay";
import { cn } from "../lib/utils";
import {
  PREDICT_DEBOUNCE_MS,
  SCRIBBLE_WIDTH_DEFAULT,
  SCRIBBLE_WIDTH_MAX,
  SCRIBBLE_WIDTH_MIN,
  activeTrackOrNull,
  clampScribbleWidth,
  dropPendingOnFrameChange,
  leftoverPinsForActive,
  nextActiveTrack,
  splitPendingMarks,
  type PendingMark,
  type PendingPoint,
  type PendingStroke,
} from "../overlayCoords";
import { hasMaskHandoff, isProtectedState, propagateTargetFrames, trackState } from "../trackState";
import { formatElapsed, workerLoadingToast } from "../workerStatus";
import { isEditableTarget, maskKeyAction } from "./keyboard";
import { maskControlStates, mayUndo, useMaskWrite } from "./maskControls";
import { useTrackLaneVisibility } from "./maskLanes";
import { MaskSessionContext, useMaskSession, type MaskSession } from "./maskSession";
import type { DeskNotice } from "./notice";

// The Job fills one Frame per status poll, so this is the fill rate too.
const JOB_POLL_MS = 400;

/** Owns the mask Session of the open Clip: pending marks, Tracks, Predict,
 * Propagate and Undo. Everything the mask panel and the overlay show comes from here. */
export function MaskSessionProvider({
  clipId,
  clip,
  frameIndex,
  tracks,
  frameMasks,
  mutateAnnotation,
  mutateFrameAnn,
  notify,
  children,
}: {
  clipId: string | undefined;
  clip: ClipMeta | undefined;
  frameIndex: number;
  tracks: TrackRow[];
  frameMasks: FrameAnnotations["masks"];
  mutateAnnotation: KeyedMutator<AnnotationSummary | null>;
  mutateFrameAnn: KeyedMutator<FrameAnnotations | null>;
  notify: (notice: DeskNotice) => void;
  children: ReactNode;
}) {
  const pendingRef = useRef<PendingMark[]>([]);
  const debounceRef = useRef<number | null>(null);
  const prevClipId = useRef<string | undefined>(undefined);
  const predicting = useRef(false);
  const [predictBusy, setPredictBusy] = useState(false);
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
  // What the open Clip's mask item allows, from the same cell the server refuses on
  // (ADR 0030): every mask write is the assignee's, and this is where the desk reads
  // that — permission, the sentence a refusal would carry, and the controls it leaves.
  const write = useMaskWrite(clipId);
  const controls = maskControlStates(write, { job: jobRunning, predicting: predictBusy });
  // Ticket 09: the Job blocks, so the desk shows an indeterminate state with
  // elapsed time — the whole span streams inside the first poll, so no honest
  // per-frame number exists (maintainer decision: no async).
  const [propagateElapsed, setPropagateElapsed] = useState(0);

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

  const frameKept =
    keptJob != null && propagateTargetFrames(keptJob, clip?.frame_count ?? 0).has(frameIndex);
  // A snapshot from another Frame renders no pins — including the window
  // between scrub and its re-fetch landing (ticket 08 / story 36).
  const leftover =
    sessionSnapshot && sessionSnapshot.frame === frameIndex
      ? leftoverPinsForActive(sessionSnapshot.tracks, activeTrackId)
      : [];

  const clearPredictTimer = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const loadSessionFrame = useCallback(async (index: number) => {
    const fetchSeq = ++sessionFetchSeq.current;
    try {
      const session = await getJson<SessionPublic>(sessionPath(index, clipId));
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
  }, [clipId]);

  // Lazy Session: the first Predict or Propagate opens it on this Clip.
  // Sessions are keyed by (Account, Clip) server-side, so this resumes this
  // Clip's Session and never closes another Clip's.
  const ensureSession = useCallback(async () => {
    if (!clipId) {
      return;
    }
    const session = await getJson<SessionPublic>(sessionPath(undefined, clipId));
    if (!session.active) {
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

  const { mutate: mutateKey } = useSWRConfig();
  const refreshMaskReads = useCallback(
    async (extraFrames: Iterable<number> = []) => {
      await mutateAnnotation();
      await mutateFrameAnn();
      if (!clipId) {
        return;
      }
      const frames = new Set<number>(extraFrames);
      frames.add(frameIndex);
      await Promise.all([...frames].map((index) => mutateKey(annotationFramePath(clipId, index))));
    },
    [clipId, frameIndex, mutateAnnotation, mutateFrameAnn, mutateKey],
  );

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
        // ADR 0025: the completed Job already wrote Annotation. Refresh this
        // Frame and every Frame the Job planned to fill (SWR cache of a
        // neighbor Frame would otherwise stay empty).
        const planned = clip
          ? propagateTargetFrames(
              {
                start: job.start_frame_index,
                direction: job.direction,
                maxFrames: job.max_frames,
              },
              clip.frame_count,
            )
          : [];
        await refreshMaskReads(planned);
        if (job.status === "failed") {
          notify({ text: job.error ?? "Propagate failed", error: true });
        } else {
          notify({
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
  }, [clip, notify, refreshMaskReads, stopJobPolling]);

  const runPredict = useCallback(async () => {
    if (!clipId || !write.writable || predicting.current || jobRunning || pendingRef.current.length === 0) {
      return;
    }
    predicting.current = true;
    setPredictBusy(true);
    clearPredictTimer();
    const marks = pendingRef.current;
    notify(null);
    try {
      await ensureSession();
      const split = splitPendingMarks(marks);
      const body: {
        clip_id: string;
        frame_index: number;
        points: number[][];
        point_labels: number[];
        scribbles?: number[][][];
        scribble_labels?: number[];
        scribble_widths?: number[];
        track_id?: number;
      } = {
        clip_id: clipId,
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
      notify(workerLoadingToast(err, "Predict failed"));
    } finally {
      predicting.current = false;
      setPredictBusy(false);
    }
  }, [activeTrackId, clearPredictTimer, clipId, ensureSession, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn, notify, write.writable]);

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
    if (!write.writable || activeTrackId == null || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    notify(null);
    try {
      await sendJson<SessionPublic>(
        sessionPointPath(activeTrackId, frameIndex, index, clipId ?? undefined),
        "DELETE",
      );
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
      await mutateFrameAnn();
      setKeptJob(null);
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Pin delete failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [activeTrackId, clearPredictTimer, clipId, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn, notify, write.writable]);

  const onClearMask = useCallback(async () => {
    if (!write.writable || activeTrackId == null || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    notify(null);
    try {
      await sendJson<SessionPublic>(
        sessionFrameMaskPath(activeTrackId, frameIndex, clipId ?? undefined),
        "DELETE",
      );
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
      await mutateFrameAnn();
      setKeptJob(null);
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Clear mask failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [activeTrackId, clearPredictTimer, clipId, frameIndex, jobRunning, loadSessionFrame, mutateAnnotation, mutateFrameAnn, notify, write.writable]);

  const runUndo = useCallback(async () => {
    // The chord's own guard, the same predicate the Undo button's `controls.undo`
    // comes from: a non-writable item is inert to both.
    if (!clipId || !mayUndo(write.writable, { job: jobRunning, predicting: predicting.current })) {
      return;
    }
    predicting.current = true;
    clearPredictTimer();
    notify(null);
    try {
      const result = await sendJson<UndoResponse>(sessionUndoPath(), "POST", {
        clip_id: clipId,
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
        notify({ text: "Nothing to undo on this Frame", error: false });
      }
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Undo failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [clearPredictTimer, clipId, frameIndex, jobRunning, mutateAnnotation, mutateFrameAnn, notify, write.writable]);

  const runPropagate = useCallback(async () => {
    if (!clipId || !write.writable || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    notify(null);
    try {
      await ensureSession();
      const rawMax = propagateMaxFrames.trim();
      let maxFrames: number | null = null;
      if (rawMax) {
        const parsed = Number(rawMax);
        if (!Number.isFinite(parsed) || parsed < 0) {
          notify({
            text: "Max frames must be blank (to the Clip edge) or a whole number of 0 or more",
            error: true,
          });
          return;
        }
        maxFrames = Math.floor(parsed);
      }
      // Explicit start from the Frame on screen; never a follow-on to Predict.
      const job = await sendJson<PropagateJobPublic>(sessionPropagatePath(), "POST", {
        clip_id: clipId,
        direction: propagateDirection,
        start_frame_index: frameIndex,
        max_frames: maxFrames,
      });
      setKeptJob(null);
      if (job.status === "completed") {
        // Zero-target Job: its Annotation merge write already happened.
        await refreshMaskReads();
        notify({ text: "Propagate complete: no Frames to fill from here", error: false });
        return;
      }
      // Elapsed is reset here at Job start; the interval effect only ticks.
      setPropagateElapsed(0);
      setPropagateJob(job);
      jobPollRef.current = window.setInterval(() => {
        void pollJob(job.job_id);
      }, JOB_POLL_MS);
    } catch (err) {
      notify(workerLoadingToast(err, "Propagate failed"));
    } finally {
      predicting.current = false;
    }
  }, [
    clipId,
    ensureSession,
    frameIndex,
    jobRunning,
    pollJob,
    propagateDirection,
    propagateMaxFrames,
    notify,
    refreshMaskReads,
    write.writable,
  ]);

  const onRenameTrack = useCallback(async (trackId: number, label: string) => {
    if (!write.writable) {
      return;
    }
    notify(null);
    try {
      await sendJson<SessionPublic>(sessionTrackPath(trackId, clipId ?? undefined), "PATCH", {
        label,
      });
      sessionOpen.current = true;
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Track Label edit failed", error: true });
    }
  }, [clipId, frameIndex, loadSessionFrame, mutateAnnotation, notify, write.writable]);

  /** Drop the whole Track: its masks go with it, on every Frame. */
  const onDeleteTrack = useCallback(async (trackId: number) => {
    if (!write.writable || predicting.current || jobRunning) {
      return;
    }
    predicting.current = true;
    notify(null);
    try {
      await sendJson<SessionPublic>(sessionTrackPath(trackId, clipId ?? undefined), "DELETE");
      sessionOpen.current = true;
      if (activeTrackId === trackId) {
        setActiveTrackId(null);
      }
      await loadSessionFrame(frameIndex);
      await mutateAnnotation();
      await mutateFrameAnn();
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Track delete failed", error: true });
    } finally {
      predicting.current = false;
    }
  }, [
    activeTrackId,
    clipId,
    frameIndex,
    jobRunning,
    loadSessionFrame,
    mutateAnnotation,
    mutateFrameAnn,
    notify,
    write.writable,
  ]);

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
    // Sessions are keyed by (Account, Clip): switching Clips keeps the old
    // one server-side, so do not close it here.
  }, [clearPredictTimer, clipId, stopJobPolling]);
  // Escape drops pending marks that never Predict-ed; the undo chord restores
  // this Frame's last committed edit.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = maskKeyAction(event, {
        editable: isEditableTarget(event.target),
        // `predicting.current` is the synchronous flag; the chord must not race
        // the render that would turn `predictBusy` on.
        mayUndo: mayUndo(write.writable, { job: jobRunning, predicting: predicting.current }),
      });
      if (action === "dropPending") {
        clearPredictTimer();
        if (pendingRef.current.length > 0) {
          pendingRef.current = [];
          setPending([]);
        }
        return;
      }
      if (action === "undo") {
        event.preventDefault();
        void runUndo();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearPredictTimer, jobRunning, runUndo, write.writable]);

  const session: MaskSession = {
    tracks,
    frameMasks,
    leftover,
    pending,
    pendingCount: pending.length,
    scribbleWidth,
    activeTrackId,
    canUndo: (sessionSnapshot?.tracks.length ?? 0) > 0,
    refusal: write.refusal,
    controls,
    predicting: predictBusy,
    canPropagate: frameMasks.length > 0,
    frameKept,
    propagateJob,
    propagateElapsed,
    propagateDirection,
    propagateMaxFrames,
    onPropagateDirection: setPropagateDirection,
    onPropagateMaxFrames: setPropagateMaxFrames,
    onPropagate: () => void runPropagate(),
    onScribbleWidth,
    onPredict: () => void runPredict(),
    onUndo: () => void runUndo(),
    onSelectTrack: (trackId) => setActiveTrackId(nextActiveTrack(activeTrackId, { kind: "rail", trackId })),
    onNewTrack: () => setActiveTrackId(nextActiveTrack(activeTrackId, { kind: "new" })),
    onRenameTrack,
    onDeleteTrack,
    onClearMask: () => void onClearMask(),
    onClickPoint,
    onClickStroke,
    onDeletePin: (index) => void onDeletePin(index),
  };

  return <MaskSessionContext.Provider value={session}>{children}</MaskSessionContext.Provider>;
}

/** The mask canvas on the picture: it reads the Session, so the player owns no mask state. */
export function PlayerMaskOverlay({
  videoRef,
  onPause,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onPause: () => void;
}) {
  const session = useMaskSession();
  return (
    <MaskOverlay
      videoRef={videoRef}
      masks={session.frameMasks}
      tracks={session.tracks}
      leftover={session.leftover}
      pending={session.pending}
      width={session.scribbleWidth}
      inputEnabled={session.controls.prompts}
      onPause={onPause}
      onClickPoint={session.onClickPoint}
      onStroke={session.onClickStroke}
      onDeletePin={session.onDeletePin}
    />
  );
}

/** The mask panel: Tracks, Predict / Propagate / Undo and the scribble width. */
export function MaskPanel() {
  const {
    tracks,
    activeTrackId,
    pendingCount,
    scribbleWidth,
    canUndo,
    predicting,
    canPropagate,
    refusal,
    controls,
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
    onDeleteTrack,
    onClearMask,
  } = useMaskSession();

  // The Track Lanes live in the Lane well; their eye sits on the Track row, the
  // same place and rule as a Library row's Lane visibility.
  const { trackLaneVisibleFor, toggleTrackLane } = useTrackLaneVisibility();

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
      {refusal ? (
        // Why these controls are off, in the server's own words: the sentence a write
        // would be refused with. It names the way out — the admin assigns the item.
        <p
          data-mask-refusal=""
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          {refusal}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tracks</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            {tracks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" disabled={!controls.newTrack} onClick={onNewTrack}>
            New Track
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!controls.predict || pendingCount === 0}
            onClick={onPredict}
          >
            {predicting ? "Inferring…" : "Predict"}
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
        <Button type="button" size="sm" variant="outline" disabled={!controls.undo || !canUndo} onClick={onUndo}>
          Undo
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!controls.clear || activeTrackId == null} onClick={onClearMask}>
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
                disabled={!controls.propagate}
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
            disabled={!controls.propagate}
            className="h-7 w-20 shrink-0 text-xs"
            onChange={(event) => onPropagateMaxFrames(event.target.value)}
          />
        </div>
        <Button type="button" size="sm" disabled={!controls.propagate || !canPropagate} onClick={onPropagate}>
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
                    title={controls.renameTrack ? "Double-click to rename" : undefined}
                    onClick={() => onSelectTrack(track.track_id)}
                    onDoubleClick={
                      controls.renameTrack
                        ? () => setRenaming({ trackId: track.track_id, draft: track.label })
                        : undefined
                    }
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-7 w-7 shrink-0 p-0",
                    trackLaneVisibleFor(track.track_id) ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-label={trackLaneVisibleFor(track.track_id) ? "Hide lane" : "Show lane"}
                  title={
                    trackLaneVisibleFor(track.track_id)
                      ? "Hide this Track's lane"
                      : "Show this Track's lane"
                  }
                  onClick={() => toggleTrackLane(track.track_id)}
                >
                  {trackLaneVisibleFor(track.track_id) ? (
                    <Eye aria-hidden="true" size={14} />
                  ) : (
                    <EyeOff aria-hidden="true" size={14} />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Delete ${track.label}`}
                  title={`Delete ${track.label} — its masks go too`}
                  disabled={!controls.deleteTrack}
                  onClick={() => {
                    if (window.confirm(`Delete ${track.label} from this Clip? Its masks go with it.`)) {
                      onDeleteTrack(track.track_id);
                    }
                  }}
                >
                  <Trash2 aria-hidden="true" size={12} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
