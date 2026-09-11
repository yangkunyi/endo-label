import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { labelColor, frameFromClientX, type TimelineLane } from "../timeline";
import type { LaneBar } from "./writer";
import { usePlayback } from "./playback";

/** The timeline: the Ruler, the transport row and the Lane well. Gestures are
 * pointer-driven; every span write goes back out through the panel's callbacks. */
export function TimelineBand({
  clipRailWidth,
  frameCount,
  frameIndex,
  lanes,
  previewRange,
  brushKeys,
  barSelection,
  transport,
  onToggleBar,
  onClearBars,
  onPaintLane,
  onTrimBar,
}: {
  clipRailWidth: number;
  frameCount: number;
  frameIndex: number;
  lanes: TimelineLane[];
  previewRange: { from: number; to: number } | null;
  brushKeys: string[];
  barSelection: LaneBar[];
  transport: ReactNode;
  onToggleBar: (bar: LaneBar) => void;
  onClearBars: () => void;
  onPaintLane: (laneKey: string, from: number, to: number) => void;
  onTrimBar: (laneKey: string, oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void;
}) {
  const { seek: onSeek } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);
  const laneTrackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const gesture = useRef<
    | { kind: "paint"; laneKey: string; origin: number; min: number; max: number }
    | { kind: "seek" }
    | { kind: "trim"; laneKey: string; originStart: number; originEnd: number; edge: "start" | "end" }
    | null
  >(null);
  const [paintPreview, setPaintPreview] = useState<{ laneKey: string; from: number; to: number } | null>(null);
  const [trimPreview, setTrimPreview] = useState<{
    laneKey: string;
    originStart: number;
    originEnd: number;
    start: number;
    end: number;
  } | null>(null);

  const frameAt = useCallback(
    (clientX: number, track: HTMLDivElement | null) => {
      if (!track) {
        return 0;
      }
      const rect = track.getBoundingClientRect();
      return frameFromClientX(clientX, rect.left, rect.width, frameCount);
    },
    [frameCount],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      onSeek(frameAt(clientX, trackRef.current));
    },
    [frameAt, onSeek],
  );

  const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  function releaseCapture(event: PointerEvent<Element>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function abortGesture(event: PointerEvent<Element>) {
    gesture.current = null;
    setPaintPreview(null);
    setTrimPreview(null);
    releaseCapture(event);
  }

  function commitGesture(event: PointerEvent<Element>) {
    const current = gesture.current;
    gesture.current = null;
    releaseCapture(event);
    if (!current) {
      return;
    }
    if (current.kind === "paint") {
      const frame = frameAt(event.clientX, laneTrackRef.current);
      const from = Math.min(current.min, frame);
      const to = Math.max(current.max, frame);
      setPaintPreview(null);
      if (from === to) {
        onSeek(from);
        onClearBars();
      } else {
        onPaintLane(current.laneKey, from, to);
      }
      return;
    }
    if (current.kind === "seek") {
      onSeek(frameAt(event.clientX, laneTrackRef.current));
      onClearBars();
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    const nextStart = current.edge === "start" ? Math.min(frame, current.originEnd) : current.originStart;
    const nextEnd = current.edge === "end" ? Math.max(frame, current.originStart) : current.originEnd;
    setTrimPreview(null);
    onTrimBar(current.laneKey, current.originStart, current.originEnd, nextStart, nextEnd);
  }

  function onLanePointerDown(event: PointerEvent<HTMLDivElement>, laneKey: string) {
    if (event.button !== 0) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-timeline-seg]")) {
      return;
    }
    event.preventDefault();
    const frame = frameAt(event.clientX, laneTrackRef.current);
    gesture.current = { kind: "paint", laneKey, origin: frame, min: frame, max: frame };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onLanePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.kind !== "paint" || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    current.min = Math.min(current.origin, current.min, frame);
    current.max = Math.max(current.origin, current.max, frame);
    if (current.min === current.max) {
      setPaintPreview(null);
    } else {
      setPaintPreview({ laneKey: current.laneKey, from: current.min, to: current.max });
    }
  }

  function onBarPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    laneKey: string,
    start: number,
    end: number,
  ) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      onToggleBar({ laneKey, start, end });
      return;
    }
    const trimEdge =
      event.target instanceof Element ? event.target.closest("[data-trim]")?.getAttribute("data-trim") : null;
    if (trimEdge === "start" || trimEdge === "end") {
      gesture.current = { kind: "trim", laneKey, originStart: start, originEnd: end, edge: trimEdge };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    gesture.current = { kind: "seek" };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(frameAt(event.clientX, laneTrackRef.current));
  }

  function onBarPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const frame = frameAt(event.clientX, laneTrackRef.current);
    if (current.kind === "seek") {
      onSeek(frame);
      return;
    }
    if (current.kind === "trim") {
      const start = current.edge === "start" ? Math.min(frame, current.originEnd) : current.originStart;
      const end = current.edge === "end" ? Math.max(frame, current.originStart) : current.originEnd;
      setTrimPreview({
        laneKey: current.laneKey,
        originStart: current.originStart,
        originEnd: current.originEnd,
        start,
        end,
      });
    }
  }

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
            {previewRange ? (
              <span
                data-ruler-range=""
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 bg-[#5e6ad2]/35"
                style={{
                  left: `${(previewRange.from / frameCount) * 100}%`,
                  width: `${((previewRange.to - previewRange.from + 1) / frameCount) * 100}%`,
                }}
              />
            ) : null}
            <span data-playhead="" aria-hidden="true" className="pointer-events-none absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-[#5e6ad2]" style={{ left: playheadLeft }} />
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="h-9 shrink-0 border-r border-border" style={{ width: clipRailWidth }} />
        <div className="w-1 shrink-0" />
        <div className="min-w-0 flex-1">{transport}</div>
      </div>
      <div
        role="region"
        aria-label="Lane well"
        data-lane-well=""
        className="h-24 shrink-0 overflow-y-auto [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]"
      >
        {lanes.length > 0 ? (
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
            <div ref={laneTrackRef} className="relative min-w-0 flex-1">
              {lanes.map((lane) => (
                <div
                  key={lane.key}
                  className="relative h-6 touch-none"
                  data-timeline-lane={lane.key}
                  onPointerDown={(event) => onLanePointerDown(event, lane.key)}
                  onPointerMove={onLanePointerMove}
                  onPointerUp={(event) => {
                    if (gesture.current?.kind === "paint") {
                      commitGesture(event);
                    }
                  }}
                  onPointerCancel={abortGesture}
                >
                  {lane.segs.map((seg) => {
                    if (seg.label == null) {
                      return (
                        <span
                          key={`${lane.key}-${seg.start}`}
                          data-timeline-seg=""
                          data-unlabeled="true"
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-1 top-1 box-border rounded border-r border-black/50 bg-white/10"
                          style={{
                            left: `${(seg.start / frameCount) * 100}%`,
                            width: `${((seg.end - seg.start + 1) / frameCount) * 100}%`,
                          }}
                        />
                      );
                    }
                    const label = seg.label;
                    const selected = barSelection.some(
                      (bar) => bar.laneKey === lane.key && bar.start === seg.start && bar.end === seg.end,
                    );
                    const preview =
                      trimPreview &&
                      trimPreview.laneKey === lane.key &&
                      trimPreview.originStart === seg.start &&
                      trimPreview.originEnd === seg.end
                        ? trimPreview
                        : null;
                    const shownStart = preview ? preview.start : seg.start;
                    const shownEnd = preview ? preview.end : seg.end;
                    return (
                      <button
                        key={`${lane.key}-${seg.start}`}
                        type="button"
                        draggable={false}
                        data-timeline-seg=""
                        data-selected={selected ? "true" : undefined}
                        data-label-color={labelColor(label)}
                        aria-label={`${label} ${seg.start}–${seg.end}`}
                        title={label}
                        className={`absolute bottom-1 top-1 box-border cursor-pointer rounded border-r border-black/50 ${selected ? "z-[2] ring-2 ring-inset ring-primary" : ""}`}
                        style={{
                          left: `${(shownStart / frameCount) * 100}%`,
                          width: `${((shownEnd - shownStart + 1) / frameCount) * 100}%`,
                          backgroundColor: labelColor(label),
                        }}
                        onPointerDown={(event) => onBarPointerDown(event, lane.key, seg.start, seg.end)}
                        onPointerMove={onBarPointerMove}
                        onPointerUp={(event) => {
                          if (gesture.current?.kind === "seek" || gesture.current?.kind === "trim") {
                            commitGesture(event);
                          }
                        }}
                        onPointerCancel={abortGesture}
                      >
                        {selected ? (
                          <>
                            <span
                              data-trim="start"
                              aria-label={`Trim ${label} start`}
                              className="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize"
                            />
                            <span
                              data-trim="end"
                              aria-label={`Trim ${label} end`}
                              className="absolute inset-y-0 right-0 z-[1] w-2 cursor-ew-resize"
                            />
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                  {previewRange && brushKeys.includes(lane.key) ? (
                    <span
                      data-ghost=""
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-1 top-1 z-[1] box-border rounded"
                      style={{
                        left: `${(previewRange.from / frameCount) * 100}%`,
                        width: `${((previewRange.to - previewRange.from + 1) / frameCount) * 100}%`,
                        backgroundColor: labelColor(lane.key),
                        opacity: 0.4,
                      }}
                    />
                  ) : null}
                  {paintPreview && paintPreview.laneKey === lane.key ? (
                    <span
                      data-lane-drag=""
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-1 top-1 z-[1] box-border rounded"
                      style={{
                        left: `${(paintPreview.from / frameCount) * 100}%`,
                        width: `${((paintPreview.to - paintPreview.from + 1) / frameCount) * 100}%`,
                        backgroundColor: labelColor(lane.key),
                        opacity: 0.4,
                      }}
                    />
                  ) : null}
                </div>
              ))}
              <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px -translate-x-1/2 bg-[#5e6ad2]" style={{ left: playheadLeft }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
