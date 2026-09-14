import { useCallback, useRef, type PointerEvent } from "react";
import {
  coverageSummary,
  frameFromClientX,
  taskColor,
  type FrameCoverage,
} from "../timeline";
import { usePlayback } from "./playback";

/**
 * The Coverage Strip: the thin read-only band above the Lane well saying which
 * Frames carry a label of the focused Task type, and where the Unlabeled gaps
 * are. It is not a Lane: nothing here is painted, trimmed or selected, and a
 * click only seeks the Playhead to the Frame under the pointer.
 *
 * Coverage is derived from the label documents the desk already fetched and is
 * never stored, so switching Task focus redraws this without a refetch.
 */
export function CoverageStrip({
  clipRailWidth,
  coverage,
}: {
  clipRailWidth: number;
  coverage: FrameCoverage;
}) {
  const { seek } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);
  const color = taskColor(coverage.task);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      seek(frameFromClientX(clientX, rect.left, rect.width, coverage.total));
    },
    [coverage.total, seek],
  );

  function onSegPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    // Same rule as a Lane bar: the Frame under the pointer, not the segment's
    // first Frame. No capture: the strip never drags, selects or trims.
    event.preventDefault();
    seekFromClientX(event.clientX);
  }

  return (
    <div className="flex" data-coverage-strip="" data-coverage-task={coverage.task}>
      <div
        data-coverage-head=""
        className="flex h-3.5 shrink-0 items-center overflow-hidden border-r border-border px-2"
        style={{ width: clipRailWidth }}
      >
        <span className="truncate text-[10px] leading-none text-muted-foreground">
          coverage · {coverage.task}
        </span>
      </div>
      <div className="w-1 shrink-0" />
      <div
        ref={trackRef}
        role="group"
        aria-label={coverageSummary(coverage)}
        className="relative h-3.5 min-w-0 flex-1 touch-none"
      >
        {coverage.segs.map((seg) => (
          <button
            key={seg.start}
            type="button"
            data-coverage-seg=""
            data-covered={seg.covered ? "true" : "false"}
            data-coverage-color={seg.covered ? color : undefined}
            aria-label={`${seg.covered ? "Covered" : "Unlabeled"} ${seg.start}–${seg.end}`}
            title={seg.covered ? `Covered ${seg.start}–${seg.end}` : `Unlabeled gap ${seg.start}–${seg.end}`}
            className={`absolute inset-y-[3px] box-border rounded-[2px] ${
              seg.covered
                ? "cursor-pointer border-r border-black/50"
                : "cursor-pointer border border-dashed border-border bg-white/[0.04]"
            }`}
            style={{
              left: `${(seg.start / coverage.total) * 100}%`,
              width: `${((seg.end - seg.start + 1) / coverage.total) * 100}%`,
              backgroundColor: seg.covered ? color : undefined,
            }}
            onPointerDown={onSegPointerDown}
          />
        ))}
      </div>
    </div>
  );
}
