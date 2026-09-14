import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { frameFromClientX } from "../timeline";
import { MASK_STRIP_COLOR, coverageSegments, maskCoverageSummary } from "../maskCoverage";
import { usePlayback } from "./playback";

/**
 * The mask row of the strip area: the Frames carrying at least one Track's mask,
 * with the rest as gaps. mask has no Task focus tab, so it never shares the
 * focused Task type's strip (05) — it gets a row of its own, in the same grammar:
 * a thin read-only band, hollow gaps, and a click that seeks the Playhead to the
 * Frame under the pointer. It is not a Lane: nothing here paints or trims.
 */
export function MaskCoverageStrip({
  clipRailWidth,
  frameCount,
  covered,
}: {
  clipRailWidth: number;
  frameCount: number;
  /** Frame indexes with a mask; the strip answers for every Track at once. */
  covered: number[];
}) {
  const { seek } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(
    () => coverageSegments(frameCount, covered),
    [covered, frameCount],
  );
  // Counted off the drawn runs, so the readout can never disagree with the band.
  const coveredCount = segments.reduce(
    (total, seg) => total + (seg.covered ? seg.end - seg.start + 1 : 0),
    0,
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const rect = track.getBoundingClientRect();
      seek(frameFromClientX(clientX, rect.left, rect.width, frameCount));
    },
    [frameCount, seek],
  );

  function onSegPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    // Same rule as a Lane bar: the Frame under the pointer, not the run's first.
    event.preventDefault();
    seekFromClientX(event.clientX);
  }

  return (
    <div className="flex" data-mask-strip="">
      <div
        data-mask-head=""
        className="flex h-3.5 shrink-0 items-center overflow-hidden border-r border-border px-2"
        style={{ width: clipRailWidth }}
      >
        <span className="truncate text-[10px] leading-none text-muted-foreground">coverage · mask</span>
      </div>
      <div className="w-1 shrink-0" />
      <div
        ref={trackRef}
        role="group"
        data-mask-track=""
        aria-label={maskCoverageSummary(coveredCount, frameCount)}
        className="relative h-3.5 min-w-0 flex-1 touch-none"
      >
        {segments.map((seg) => (
          <button
            key={seg.start}
            type="button"
            data-mask-seg=""
            data-covered={seg.covered ? "true" : "false"}
            data-mask-color={seg.covered ? MASK_STRIP_COLOR : undefined}
            aria-label={
              seg.covered
                ? `Masked ${seg.start}–${seg.end}`
                : `Unlabeled gap ${seg.start}–${seg.end}`
            }
            title={seg.covered ? `Masked ${seg.start}–${seg.end}` : `Unlabeled gap ${seg.start}–${seg.end}`}
            className={`absolute inset-y-[3px] box-border rounded-[2px] cursor-pointer ${
              seg.covered
                ? "border-r border-black/50"
                : "border border-dashed border-border bg-white/[0.04]"
            }`}
            style={{
              left: `${(seg.start / frameCount) * 100}%`,
              width: `${((seg.end - seg.start + 1) / frameCount) * 100}%`,
              backgroundColor: seg.covered ? MASK_STRIP_COLOR : undefined,
            }}
            onPointerDown={onSegPointerDown}
          />
        ))}
      </div>
    </div>
  );
}
