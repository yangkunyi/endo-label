import { useMemo } from "react";
import type { TripletRow, Vocab } from "../api";
import { brushOfKind, laneIsVisible, laneVisibilityKey, useDeskStore, type BrushIdentity, type EditorKind } from "../deskStore";
import { foldClass, foldPhase, foldTriplet, type TimelineLane } from "../timeline";

/** The Frame range a Mark from would cover: from the marked Frame to this one. */
function rangeEnds(fromIndex: number | null, currentIndex: number): { from: number; to: number } {
  const start = fromIndex == null ? currentIndex : fromIndex;
  return { from: Math.min(start, currentIndex), to: Math.max(start, currentIndex) };
}

export function brushLabel(identity: BrushIdentity): string {
  if (identity.kind === "class") {
    return `class: ${identity.name}`;
  }
  if (identity.kind === "phase") {
    return `phase: ${identity.name}`;
  }
  return `triplet: ${identity.instrument} / ${identity.verb} / ${identity.target}`;
}

export function brushColorKey(identity: BrushIdentity): string {
  if (identity.kind === "triplet") {
    return `${identity.instrument} / ${identity.verb} / ${identity.target}`;
  }
  return identity.name;
}

function vocabOrderKeys(kind: EditorKind, vocab: Vocab | undefined): string[] {
  if (!vocab) {
    return [];
  }
  if (kind === "class") {
    return vocab.class_tags;
  }
  if (kind === "phase") {
    return vocab.phases;
  }
  return vocab.triples.map((row) => `${row.instrument} / ${row.verb} / ${row.target}`);
}

function orderBrushByVocab(identities: BrushIdentity[], order: string[]): BrushIdentity[] {
  if (identities.length <= 1 || order.length === 0) {
    return identities;
  }
  return [...identities].sort((a, b) => {
    const ia = order.indexOf(brushColorKey(a));
    const ib = order.indexOf(brushColorKey(b));
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
}

/** Lane-visibility keys of identities that have at least one Frame on this Clip. */
function presentLaneKeys(
  focus: EditorKind,
  phaseFrames: Record<string, string>,
  classFrames: Record<string, string[]>,
  tripletFrames: Record<string, TripletRow[]>,
): Set<string> {
  const keys = new Set<string>();
  if (focus === "phase") {
    for (const name of Object.values(phaseFrames)) {
      if (name) {
        keys.add(laneVisibilityKey("phase", name));
      }
    }
  } else if (focus === "class") {
    for (const tags of Object.values(classFrames)) {
      for (const tag of tags ?? []) {
        if (tag) {
          keys.add(laneVisibilityKey("class", tag));
        }
      }
    }
  } else {
    for (const rows of Object.values(tripletFrames)) {
      for (const row of rows ?? []) {
        keys.add(laneVisibilityKey("triplet", tripleIdentity(row)));
      }
    }
  }
  return keys;
}

/** Visible Lanes of the focused kind in Vocab order, including unused-but-eye-on empty Lanes. */
function visibleLanes(
  focus: EditorKind,
  frameCount: number,
  phaseFrames: Record<string, string>,
  classFrames: Record<string, string[]>,
  tripletFrames: Record<string, TripletRow[]>,
  vocab: Vocab | undefined,
  presentKeys: Set<string>,
  stored: Record<string, boolean>,
): TimelineLane[] {
  const folded =
    focus === "phase"
      ? foldPhase(frameCount, phaseFrames)
      : focus === "class"
        ? foldClass(frameCount, classFrames)
        : foldTriplet(frameCount, tripletFrames);
  const byKey = new Map(folded.map((lane) => [lane.key, lane]));
  const keys: string[] = [];
  for (const identity of vocabOrderKeys(focus, vocab)) {
    const key = laneVisibilityKey(focus, identity);
    if (laneIsVisible(stored, key, presentKeys.has(key))) {
      keys.push(identity);
    }
  }
  for (const lane of folded) {
    if (!keys.includes(lane.key)) {
      const key = laneVisibilityKey(focus, lane.key);
      if (laneIsVisible(stored, key, true)) {
        keys.push(lane.key);
      }
    }
  }
  return keys.map((identity) => byKey.get(identity) ?? { key: identity, segs: [] });
}

/** The Brush range for the focused kind: what Mark from would write, and the ghost span. */
export function useBrushRange({
  clipId,
  frameIndex,
  focus,
  vocab,
}: {
  clipId: string | undefined;
  frameIndex: number;
  focus: EditorKind;
  vocab: Vocab | undefined;
}) {
  const spanStart = useDeskStore((s) => s.spanStart);
  const brush = useDeskStore((s) => s.brush);
  const markedFrom = spanStart && spanStart.clipId === clipId ? spanStart.frameIndex : null;
  const { from: rangeFrom, to: rangeTo } = rangeEnds(markedFrom, frameIndex);
  const focusedBrush = orderBrushByVocab(brushOfKind(brush, focus), vocabOrderKeys(focus, vocab));
  const hasBrush = focusedBrush.length > 0;
  const previewRange = hasBrush && markedFrom != null ? { from: rangeFrom, to: rangeTo } : null;
  return { markedFrom, rangeFrom, rangeTo, focusedBrush, hasBrush, previewRange };
}

/** The eye toggles of the focused kind, and which of its Lanes exist on the Clip. */
export function useLaneVisibility({
  focus,
  phaseFrames,
  classFrames,
  tripletFrames,
}: {
  focus: EditorKind;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletRow[]>;
}) {
  const laneVisibility = useDeskStore((s) => s.laneVisibility);
  const setLaneVisible = useDeskStore((s) => s.setLaneVisible);
  const lanePresentKeys = presentLaneKeys(focus, phaseFrames, classFrames, tripletFrames);
  const laneVisibleFor = (identity: string) => {
    const key = laneVisibilityKey(focus, identity);
    return laneIsVisible(laneVisibility, key, lanePresentKeys.has(key));
  };
  const toggleLaneFor = (identity: string) => {
    const key = laneVisibilityKey(focus, identity);
    setLaneVisible(key, !laneIsVisible(laneVisibility, key, lanePresentKeys.has(key)));
  };
  return { lanePresentKeys, laneVisibleFor, toggleLaneFor };
}

/** Visible Lanes of the focused kind, with the eye toggles that drive them. */
export function useDeskLanes({
  focus,
  frameCount,
  phaseFrames,
  classFrames,
  tripletFrames,
  vocab,
}: {
  focus: EditorKind;
  frameCount: number | undefined;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletRow[]>;
  vocab: Vocab | undefined;
}) {
  const laneVisibility = useDeskStore((s) => s.laneVisibility);
  const { lanePresentKeys, laneVisibleFor, toggleLaneFor } = useLaneVisibility({
    focus,
    phaseFrames,
    classFrames,
    tripletFrames,
  });
  const lanes = useMemo(
    () =>
      frameCount
        ? visibleLanes(focus, frameCount, phaseFrames, classFrames, tripletFrames, vocab, lanePresentKeys, laneVisibility)
        : [],
    [classFrames, focus, frameCount, lanePresentKeys, laneVisibility, phaseFrames, tripletFrames, vocab],
  );
  return { lanes, laneVisibleFor, toggleLaneFor };
}

/** The desk-wide identity of a triplet row: instrument / verb / target. */
export function tripleIdentity(row: { instrument: string; verb: string; target: string }): string {
  return `${row.instrument} / ${row.verb} / ${row.target}`;
}
