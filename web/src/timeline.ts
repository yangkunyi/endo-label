export type TimelineSeg = {
  start: number;
  end: number;
  label: string | null;
};

export type TimelineLane = {
  key: string;
  segs: TimelineSeg[];
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

export function foldPhase(frameCount: number, frames: Record<string, string>): TimelineLane[] {
  const segs = foldValues(frameCount, (index) => {
    const name = frames[String(index)];
    return name && name.length ? name : null;
  });
  return [{ key: "phase", segs }];
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
  frames: Record<string, { instrument: string; verb: string; target: string }[]>,
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
