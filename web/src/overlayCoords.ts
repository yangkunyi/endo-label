export const DRAG_EXTENT = 0.005;
export const PREDICT_DEBOUNCE_MS = 800;
export const PIN_HIT_RADIUS_PX = 10;
// Full stroke diameter on the 1024 letterbox (matches HTTP scribble_widths).
export const SCRIBBLE_WIDTH_DEFAULT = 8;
export const SCRIBBLE_WIDTH_MIN = 1;
export const SCRIBBLE_WIDTH_MAX = 40;
export const SCRIBBLE_LETTERBOX = 1024;

export type Point = { x: number; y: number };

export type DisplayRect = { left: number; top: number; width: number; height: number };

export type PendingPoint = Point & { label: 0 | 1 };

export type PendingStroke = { points: Point[]; label: 0 | 1; width: number };

export type PendingMark = PendingPoint | PendingStroke;

export function isPendingStroke(mark: PendingMark): mark is PendingStroke {
  return "points" in mark;
}

export function clampScribbleWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return SCRIBBLE_WIDTH_DEFAULT;
  }
  return Math.min(SCRIBBLE_WIDTH_MAX, Math.max(SCRIBBLE_WIDTH_MIN, Math.round(width)));
}

export function strokeInkWidthPx(width: number, displayedWidthPx: number): number {
  return (width / SCRIBBLE_LETTERBOX) * displayedWidthPx;
}

export type LeftoverPoint = Point & { positive: boolean };

export type ActiveTrackAction =
  | { kind: "rail"; trackId: number }
  | { kind: "new" }
  | { kind: "created"; trackId: number }
  | { kind: "picture" };

export function displayedImageRect(
  player: DisplayRect,
  media: { width: number; height: number },
): DisplayRect | null {
  if (player.width <= 0 || player.height <= 0 || media.width <= 0 || media.height <= 0) {
    return null;
  }
  const scale = Math.min(player.width / media.width, player.height / media.height);
  const width = media.width * scale;
  const height = media.height * scale;
  return {
    left: player.left + (player.width - width) / 2,
    top: player.top + (player.height - height) / 2,
    width,
    height,
  };
}

export function clientToRelative(clientX: number, clientY: number, rect: DisplayRect): Point | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }
  return { x, y };
}

export function pointerExtent(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy);
}

export function isClick(from: Point, to: Point, threshold = DRAG_EXTENT): boolean {
  return pointerExtent(from, to) < threshold;
}

// Same tool as points: a click commits a point, a drag commits a stroke whose
// width is stamped now — a later slider move never rewrites drawn strokes.
export function dragCommit(
  start: Point,
  last: Point,
  samples: Point[],
  label: 0 | 1,
  width: number,
): PendingMark | null {
  if (!isClick(start, last)) {
    const points = samples.length > 0 ? samples : [start, last];
    return { points, label, width };
  }
  return { ...start, label };
}

export type SplitPending = {
  points: number[][];
  point_labels: number[];
  scribbles: number[][][];
  scribble_labels: number[];
  scribble_widths: number[];
};

export function splitPendingMarks(marks: PendingMark[]): SplitPending {
  const out: SplitPending = {
    points: [],
    point_labels: [],
    scribbles: [],
    scribble_labels: [],
    scribble_widths: [],
  };
  for (const mark of marks) {
    if (isPendingStroke(mark)) {
      out.scribbles.push(mark.points.map((p) => [p.x, p.y]));
      out.scribble_labels.push(mark.label);
      out.scribble_widths.push(mark.width);
    } else {
      out.points.push([mark.x, mark.y]);
      out.point_labels.push(mark.label);
    }
  }
  return out;
}

export function dropPendingOnFrameChange<T>(pending: T[], fromFrame: number, toFrame: number): T[] {
  return fromFrame === toFrame ? pending : [];
}

export function debounceDue(
  lastMarkAt: number | null,
  now: number,
  delay = PREDICT_DEBOUNCE_MS,
): boolean {
  if (lastMarkAt == null) {
    return false;
  }
  return now - lastMarkAt >= delay;
}

export function leftoverPinsForActive(
  tracks: { track_id: number; geometric_memory?: LeftoverPoint[] }[],
  activeTrackId: number | null,
): LeftoverPoint[] {
  if (activeTrackId == null) {
    return [];
  }
  return tracks.find((row) => row.track_id === activeTrackId)?.geometric_memory ?? [];
}

export function overlayPins(leftover: LeftoverPoint[], pending: PendingPoint[]): PendingPoint[] {
  return [
    ...leftover.map((pin) => ({ x: pin.x, y: pin.y, label: (pin.positive ? 1 : 0) as 0 | 1 })),
    ...pending,
  ];
}

export function hitLeftoverPin(
  click: Point,
  pins: LeftoverPoint[],
  displaySize: { width: number; height: number },
  radiusPx = PIN_HIT_RADIUS_PX,
): number | null {
  if (!(displaySize.width > 0) || !(displaySize.height > 0) || !(radiusPx > 0)) {
    return null;
  }
  let best: number | null = null;
  let bestD = radiusPx * radiusPx;
  for (let index = 0; index < pins.length; index += 1) {
    const pin = pins[index];
    const dx = (click.x - pin.x) * displaySize.width;
    const dy = (click.y - pin.y) * displaySize.height;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      best = index;
      bestD = d;
    }
  }
  return best;
}

export function nextActiveTrack(
  current: number | null,
  action: ActiveTrackAction,
): number | null {
  if (action.kind === "rail") {
    return action.trackId;
  }
  if (action.kind === "new") {
    return null;
  }
  if (action.kind === "created") {
    return current ?? action.trackId;
  }
  return current;
}
