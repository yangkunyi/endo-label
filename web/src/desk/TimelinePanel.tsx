import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClipMeta, TripletRow, Vocab } from "../api";
import { useDeskStore, type EditorKind } from "../deskStore";
import { foldCoverage } from "../timeline";
import { brushColorKey, useBrushRange, useDeskLanes } from "./lanes";
import { TransportRow } from "./PlayerPanel";
import { TimelineBand } from "./TimelineBand";
import { isEditableTarget } from "./keyboard";
import type { DeskNotice } from "./notice";
import { identityFromLaneKey, sameLaneBar, type IdentityWriter, type LaneBar } from "./writer";

/** The timeline panel: Ruler, transport and Lane well, plus the bar selection
 * and the span edits its gestures commit. */
export function TimelinePanel({
  clipId,
  clip,
  frameIndex,
  focus,
  vocab,
  phaseFrames,
  classFrames,
  tripletFrames,
  writer,
  notify,
}: {
  clipId: string | undefined;
  clip: ClipMeta;
  frameIndex: number;
  focus: EditorKind;
  vocab: Vocab | undefined;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletRow[]>;
  writer: IdentityWriter;
  notify: (notice: DeskNotice) => void;
}) {
  const clipRailWidth = useDeskStore((s) => s.layout.clipRailWidth);
  const { lanes } = useDeskLanes({
    focus,
    frameCount: clip.frame_count,
    phaseFrames,
    classFrames,
    tripletFrames,
    vocab,
  });
  const { previewRange, focusedBrush } = useBrushRange({ clipId, frameIndex, focus, vocab });
  // One derived map per Task type: the strip draws it and the desk's hints count
  // it, both through `foldCoverage` (ADR 0029).
  const coverage = useMemo(
    () =>
      foldCoverage({
        task: focus,
        frameCount: clip.frame_count,
        phaseFrames,
        classFrames,
        tripletFrames,
      }),
    [classFrames, clip.frame_count, focus, phaseFrames, tripletFrames],
  );
  const [barSelection, setBarSelection] = useState<LaneBar[]>([]);
  const selectionScope = `${clipId ?? ""}:${focus}`;
  const [barScope, setBarScope] = useState(selectionScope);
  if (barScope !== selectionScope) {
    setBarScope(selectionScope);
    setBarSelection([]);
  }

  const { writeLaneSpan } = writer;
  const paintLane = useCallback(
    (laneKey: string, from: number, to: number) => {
      void writeLaneSpan(laneKey, from, to, false);
    },
    [writeLaneSpan],
  );

  const trimBar = useCallback(
    (laneKey: string, oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
      void (async () => {
        if (newStart === oldStart && newEnd === oldEnd) {
          return;
        }
        if (newStart < oldStart) {
          if (!(await writeLaneSpan(laneKey, newStart, oldStart - 1, false))) {
            return;
          }
        } else if (newStart > oldStart) {
          if (!(await writeLaneSpan(laneKey, oldStart, newStart - 1, true))) {
            return;
          }
        }
        if (newEnd > oldEnd) {
          if (!(await writeLaneSpan(laneKey, oldEnd + 1, newEnd, false))) {
            return;
          }
        } else if (newEnd < oldEnd) {
          if (!(await writeLaneSpan(laneKey, newEnd + 1, oldEnd, true))) {
            return;
          }
        }
        setBarSelection((prev) =>
          prev.map((bar) =>
            bar.laneKey === laneKey && bar.start === oldStart && bar.end === oldEnd
              ? { laneKey, start: newStart, end: newEnd }
              : bar,
          ),
        );
      })();
    },
    [writeLaneSpan],
  );

  const deleteSelectedBars = useCallback(async () => {
    if (barSelection.length === 0) {
      return;
    }
    try {
      await writer.runExclusive(async () => {
        notify(null);
        for (const seg of barSelection) {
          const identity = identityFromLaneKey(focus, seg.laneKey);
          if (!identity) {
            continue;
          }
          await writer.commitIdentityRange(identity, seg.start, seg.end, true);
        }
        setBarSelection([]);
      });
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Write failed", error: true });
    }
  }, [barSelection, focus, notify, writer]);

  // Escape drops the bar selection; Delete removes the selected bars' spans.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        if (barSelection.length > 0) {
          event.preventDefault();
          setBarSelection([]);
        }
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && barSelection.length > 0) {
        event.preventDefault();
        void deleteSelectedBars();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [barSelection.length, deleteSelectedBars]);

  return (
    <TimelineBand
      clipRailWidth={clipRailWidth}
      frameCount={clip.frame_count}
      frameIndex={frameIndex}
      lanes={lanes}
      coverage={coverage}
      previewRange={previewRange}
      brushKeys={focusedBrush.map(brushColorKey)}
      barSelection={barSelection}
      transport={<TransportRow />}
      onToggleBar={(bar) =>
        setBarSelection((prev) =>
          prev.some((item) => sameLaneBar(item, bar))
            ? prev.filter((item) => !sameLaneBar(item, bar))
            : [...prev, bar],
        )
      }
      onClearBars={() => setBarSelection([])}
      onPaintLane={paintLane}
      onTrimBar={trimBar}
    />
  );
}
