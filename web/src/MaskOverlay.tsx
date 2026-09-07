import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { MaskRle, TrackRow } from "./api";
import {
  clientToRelative,
  displayedImageRect,
  hitLeftoverPin,
  isClick,
  overlayPins,
  type LeftoverPoint,
  type PendingPoint,
  type Point,
} from "./overlayCoords";
import { decodeRle } from "./rle";

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
  onPause,
  onClickPoint,
  onDeletePin,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  masks: Array<MaskRle & { track_id: number }>;
  tracks: TrackRow[];
  leftover: LeftoverPoint[];
  pending: PendingPoint[];
  onPause: () => void;
  onClickPoint: (point: PendingPoint) => void;
  onDeletePin: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: Point; last: Point } | null>(null);
  const [layoutGen, setLayoutGen] = useState(0);

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
    for (const point of overlayPins(leftover, pending)) {
      ctx.beginPath();
      ctx.arc(dest.left + point.x * dest.width, dest.top + point.y * dest.height, 4, 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? "#f8fafc" : "#0f172a";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = point.label === 1 ? "#16a34a" : "#dc2626";
      ctx.stroke();
    }
  }, [layoutGen, leftover, masks, pending, tracks, videoRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) {
      return;
    }
    const bump = () => setLayoutGen((n) => n + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(canvas);
    video?.addEventListener("loadedmetadata", bump);
    return () => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", bump);
    };
  }, [videoRef]);

  function imageRect() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return null;
    }
    const box = canvas.getBoundingClientRect();
    return displayedImageRect(
      { left: box.left, top: box.top, width: box.width, height: box.height },
      { width: video.videoWidth, height: video.videoHeight },
    );
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) {
      return;
    }
    const rect = imageRect();
    if (!rect) {
      return;
    }
    const point = clientToRelative(event.clientX, event.clientY, rect);
    if (!point) {
      return;
    }
    onPause();
    drag.current = { start: point, last: point };
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
    const point = clientToRelative(event.clientX, event.clientY, rect);
    if (point) {
      drag.current.last = point;
    }
  }

  function onPointerUp() {
    const stroke = drag.current;
    drag.current = null;
    if (!stroke || !isClick(stroke.start, stroke.last)) {
      return;
    }
    const rect = imageRect();
    if (rect) {
      const hit = hitLeftoverPin(stroke.start, leftover, { width: rect.width, height: rect.height });
      if (hit != null) {
        onDeletePin(hit);
        return;
      }
    }
    onClickPoint({ ...stroke.start, label: 1 });
  }

  return (
    <canvas
      ref={canvasRef}
      slot="gestures-chrome"
      data-mask-overlay=""
      aria-label="Mask overlay"
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
