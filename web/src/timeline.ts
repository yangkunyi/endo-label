import type { EditorKind } from "./deskStore";

export type TimelineSeg = {
  start: number;
  end: number;
  label: string | null;
};

/** Map a pointer x onto Frame `0..N-1` using the same bins as the Ruler. */
export function frameFromClientX(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  frameCount: number,
): number {
  if (frameCount <= 0) {
    return 0;
  }
  const width = trackWidth || 1;
  const frac = Math.min(1, Math.max(0, (clientX - trackLeft) / width));
  return Math.min(frameCount - 1, Math.floor(frac * frameCount));
}

/**
 * The Task type's own color: the Coverage Strip's filled segments take it, so
 * switching Task focus is visible on the strip itself. Not stored, and not a
 * Vocab identity's color (`labelColor`).
 */
export function taskColor(task: EditorKind): string {
  if (task === "phase") {
    return "hsl(268 45% 60%)";
  }
  if (task === "triplet") {
    return "hsl(151 38% 48%)";
  }
  return "hsl(196 52% 52%)";
}

/** Stable sitting color for a phase name, class tag, or exact triple. Not stored. */
export function labelColor(identity: string): string {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${(hash >>> 0) % 360} 35% 55%)`;
}

export type TimelineLane = {
  key: string;
  segs: TimelineSeg[];
};

/** The three cells that make a triplet row's identity; `api.TripletRow` adds the row id. */
export type TripletCells = {
  instrument: string;
  verb: string;
  target: string;
};

/** One maximal run of Frames that agree on whether they carry an identity. */
export type CoverageSeg = {
  start: number;
  end: number;
  covered: boolean;
};

/** What the Coverage Strip draws, and the counts its label and the desk's hints read. */
export type FrameCoverage = {
  task: EditorKind;
  segs: CoverageSeg[];
  covered: number;
  unlabeled: number;
  total: number;
};

function foldValues(frameCount: number, at: (index: number) => string | null): TimelineSeg[] {
  if (frameCount <= 0) {
    return [];
  }
  const segs: TimelineSeg[] = [];
  let start = 0;
  let current = at(0);
  for (let index = 1; index <= frameCount; index += 1) {
    const next = index < frameCount ? at(index) : Symbol("end");
    if (next !== current) {
      segs.push({ start, end: index - 1, label: current });
      start = index;
      current = typeof next === "string" || next === null ? next : null;
    }
  }
  return segs;
}

/**
 * Maximal runs of covered and Unlabeled Frames, in Frame order — the Coverage
 * Strip's segments. Adjacent runs alternate, so a run's `covered` flag is all a
 * renderer needs. There is no Frame-level "looked at" state: a Frame is covered
 * when it carries at least one identity of the Task type being asked about
 * (ADR 0029), which is what the caller's predicate answers.
 */
export function foldCovered(
  frameCount: number,
  isCovered: (index: number) => boolean,
): CoverageSeg[] {
  if (frameCount <= 0) {
    return [];
  }
  const segs: CoverageSeg[] = [];
  let start = 0;
  let current = isCovered(0);
  for (let index = 1; index <= frameCount; index += 1) {
    const next = index < frameCount ? isCovered(index) : null;
    if (next !== current) {
      segs.push({ start, end: index - 1, covered: current });
      start = index;
      if (next !== null) {
        current = next;
      }
    }
  }
  return segs;
}

function frameIsCovered(
  task: EditorKind,
  index: number,
  phaseFrames: Record<string, string>,
  classFrames: Record<string, string[]>,
  tripletFrames: Record<string, TripletCells[]>,
): boolean {
  const key = String(index);
  if (task === "phase") {
    return Boolean(phaseFrames[key]);
  }
  if (task === "class") {
    return (classFrames[key] ?? []).some((tag) => tag);
  }
  return (tripletFrames[key] ?? []).some((row) => row.instrument || row.verb || row.target);
}

/**
 * Coverage for one Task type, read straight off the documents the desk already
 * fetches — the same maps the Lane folding uses. Answering "how far has the
 * labeling got" writes nothing and reads no second source.
 */
export function foldCoverage({
  task,
  frameCount,
  phaseFrames,
  classFrames,
  tripletFrames,
}: {
  task: EditorKind;
  frameCount: number;
  phaseFrames: Record<string, string>;
  classFrames: Record<string, string[]>;
  tripletFrames: Record<string, TripletCells[]>;
}): FrameCoverage {
  const total = Math.max(0, frameCount);
  const segs = foldCovered(total, (index) => frameIsCovered(task, index, phaseFrames, classFrames, tripletFrames));
  const covered = segs.reduce((count, seg) => (seg.covered ? count + (seg.end - seg.start + 1) : count), 0);
  return { task, segs, covered, unlabeled: total - covered, total };
}

/** The Coverage Strip's accessible sentence: `Coverage: class, 84 of 120 frames labeled`. */
export function coverageSummary(coverage: FrameCoverage): string {
  return `Coverage: ${coverage.task}, ${coverage.covered} of ${coverage.total} frames labeled`;
}

export function foldPhase(frameCount: number, frames: Record<string, string>): TimelineLane[] {
  const names = new Set<string>();
  for (const name of Object.values(frames)) {
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort().map((name) => ({
    key: name,
    segs: foldValues(frameCount, (index) => (frames[String(index)] === name ? name : null)),
  }));
}

export function foldClass(frameCount: number, frames: Record<string, string[]>): TimelineLane[] {
  const tags = new Set<string>();
  for (const list of Object.values(frames)) {
    for (const tag of list ?? []) {
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return [...tags].sort().map((tag) => ({
    key: tag,
    segs: foldValues(frameCount, (index) => ((frames[String(index)] ?? []).includes(tag) ? tag : null)),
  }));
}

export function foldTriplet(
  frameCount: number,
  frames: Record<string, TripletCells[]>,
): TimelineLane[] {
  const keys = new Set<string>();
  for (const rows of Object.values(frames)) {
    for (const row of rows ?? []) {
      keys.add(`${row.instrument} / ${row.verb} / ${row.target}`);
    }
  }
  return [...keys].sort().map((key) => ({
    key,
    segs: foldValues(frameCount, (index) => {
      const hit = (frames[String(index)] ?? []).some(
        (row) => `${row.instrument} / ${row.verb} / ${row.target}` === key,
      );
      return hit ? key : null;
    }),
  }));
}
