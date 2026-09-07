export const DRAG_EXTENT = 0.005;
export const PREDICT_DEBOUNCE_MS = 800;

export type Point = { x: number; y: number };

export type DisplayRect = { left: number; top: number; width: number; height: number };

export type PendingPoint = Point & { label: 0 | 1 };

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
