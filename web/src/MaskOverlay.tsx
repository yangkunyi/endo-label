import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { MaskRle, TrackRow } from "./api";
import {
  clientToRelative,
  displayedImageRect,
  dragCommit,
  hitLeftoverPin,
  isPendingStroke,
  overlayPins,
  strokeInkWidthPx,
  type DisplayRect,
  type LeftoverPoint,
  type PendingMark,
  type PendingPoint,
  type PendingStroke,
  type Point,
} from "./overlayCoords";
import { decodeRle } from "./rle";
import type { MaskPointerGate } from "./desk/maskControls";

const POSITIVE_INK = "#16a34a";
const NEGATIVE_INK = "#dc2626";

function hexRgb(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) {
    return [230, 25, 75];
  }
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function trackColor(trackId: number, tracks: TrackRow[]): string {
  return tracks.find((row) => row.track_id === trackId)?.color ?? "#e6194b";
}

function drawInk(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  dest: DisplayRect,
  label: 0 | 1,
  width: number,
) {
  if (points.length === 0) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(dest.left + points[0].x * dest.width, dest.top + points[0].y * dest.height);
  for (const point of points.slice(1)) {
    ctx.lineTo(dest.left + point.x * dest.width, dest.top + point.y * dest.height);
  }
  ctx.lineWidth = Math.max(1, strokeInkWidthPx(width, dest.width));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = label === 1 ? POSITIVE_INK : NEGATIVE_INK;
  ctx.stroke();
}

function paintMask(
  ctx: CanvasRenderingContext2D,
  mask: MaskRle,
  color: string,
  dest: { left: number; top: number; width: number; height: number },
) {
  const grid = decodeRle(mask);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (h === 0 || w === 0) {
    return;
  }
  const image = ctx.createImageData(w, h);
  const [r, g, b] = hexRgb(color);
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (!grid[row][col]) {
        continue;
      }
      const i = (row * w + col) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 120;
    }
  }
  const tile = document.createElement("canvas");
  tile.width = w;
  tile.height = h;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) {
    return;
  }
  tileCtx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tile, dest.left, dest.top, dest.width, dest.height);
}

export function MaskOverlay({
  videoRef,
  masks,
  tracks,
  leftover,
  pending,
  width,
  gate,
  onPause,
  onClickPoint,
  onStroke,
  onDeletePin,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  masks: Array<MaskRle & { track_id: number }>;
  tracks: TrackRow[];
  leftover: LeftoverPoint[];
  pending: PendingMark[];
  width: number;
  gate: MaskPointerGate;
  onPause: () => void;
  onClickPoint: (point: PendingPoint) => void;
  onStroke: (stroke: PendingStroke) => void;
  onDeletePin: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: Point; last: Point; samples: Point[]; label: 0 | 1 } | null>(null);
  const [layoutGen, setLayoutGen] = useState(0);
  // `checking` stays open: a prompt drawn while the mask item's write permission is
  // still in flight is held for the answer, not dropped the way a refused one is.
  const inputEnabled = gate === "open" || gate === "checking";

  const bump = useCallback(() => setLayoutGen((n) => n + 1), []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const mediaW = video?.videoWidth ?? 0;
    const mediaH = video?.videoHeight ?? 0;
    const dest = displayedImageRect(
      { left: 0, top: 0, width: cssW, height: cssH },
      { width: mediaW, height: mediaH },
    );
    if (!dest) {
      return;
    }
    for (const mask of masks) {
      paintMask(ctx, mask, trackColor(mask.track_id, tracks), dest);
    }
    for (const mark of pending) {
      if (isPendingStroke(mark)) {
        drawInk(ctx, mark.points, dest, mark.label, mark.width);
      }
    }
    // A mid-drag repaint redraws the partial ink instead of erasing it.
    const live = drag.current;
    if (live) {
      drawInk(ctx, live.samples, dest, live.label, width);
    }
    const pendingPoints = pending.filter((mark): mark is PendingPoint => !isPendingStroke(mark));
    for (const point of overlayPins(leftover, pendingPoints)) {
      ctx.beginPath();
      ctx.arc(dest.left + point.x * dest.width, dest.top + point.y * dest.height, 4, 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? "#f8fafc" : "#0f172a";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = point.label === 1 ? "#16a34a" : "#dc2626";
      ctx.stroke();
    }
  }, [layoutGen, leftover, masks, pending, tracks, videoRef, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) {
      return;
    }
    const ro = new ResizeObserver(bump);
    ro.observe(canvas);
    video?.addEventListener("loadedmetadata", bump);
    return () => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", bump);
    };
  }, [bump, videoRef]);

  // Pointer mapping needs the viewport-anchored rect; ink draws in
  // canvas-local coordinates, the same basis as the committed repaint.
  function imageRect(): { client: DisplayRect; ink: DisplayRect } | null {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return null;
    }
    const box = canvas.getBoundingClientRect();
    const ink = displayedImageRect(
      { left: 0, top: 0, width: box.width, height: box.height },
      { width: video.videoWidth, height: video.videoHeight },
    );
    if (!ink) {
      return null;
    }
    return {
      client: { ...ink, left: ink.left + box.left, top: ink.top + box.top },
      ink,
    };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    // Geometry input is off while a Propagate Job runs (story 86), and off for a write
    // the server has refused; an unanswered read is neither.
    if (!inputEnabled) {
      return;
    }
    // Left = positive Geometric/Scribble Prompt, right = negative; menu stays shut.
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    const rect = imageRect();
    if (!rect) {
      return;
    }
    const point = clientToRelative(event.clientX, event.clientY, rect.client);
    if (!point) {
      return;
    }
    onPause();
    drag.current = { start: point, last: point, samples: [point], label: event.button === 2 ? 0 : 1 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) {
      return;
    }
    const rect = imageRect();
    if (!rect) {
      return;
    }
    const point = clientToRelative(event.clientX, event.clientY, rect.client);
    if (!point) {
      return;
    }
    const prev = drag.current.last;
    drag.current.last = point;
    drag.current.samples.push(point);
    const ink = canvasRef.current?.getContext("2d");
    if (ink) {
      drawInk(ink, [prev, point], rect.ink, drag.current.label, width);
    }
  }

  function onPointerUp() {
    const gesture = drag.current;
    drag.current = null;
    if (!gesture) {
      return;
    }
    // A permission or a Job can turn while a drag is in flight; then the gesture is a write
    // the desk may no longer make, and the panel already says which of the two it is.
    if (!inputEnabled) {
      return;
    }
    const commit = dragCommit(gesture.start, gesture.last, gesture.samples, gesture.label, width);
    if (isPendingStroke(commit)) {
      onStroke(commit);
      return;
    }
    // Click (no drag): a positive click may delete a leftover pin it covers.
    if (commit.label === 1) {
      const rect = imageRect();
      if (rect) {
        const hit = hitLeftoverPin(gesture.start, leftover, { width: rect.ink.width, height: rect.ink.height });
        if (hit != null) {
          onDeletePin(hit);
          return;
        }
      }
    }
    onClickPoint(commit);
  }

  return (
    <canvas
      ref={canvasRef}
      slot="gestures-chrome"
      data-mask-overlay=""
      data-mask-gate={gate}
      aria-label="Mask overlay"
      className={`absolute inset-0 h-full w-full touch-none ${inputEnabled ? "cursor-crosshair" : "cursor-default"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        bump();
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
