import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import useSWR from "swr";
import { getJson, healthPath, type ClipMeta, type HealthResponse, type Vocab } from "../api";
import { Button } from "../components/ui/button";
import { useDeskStore, type EditorKind } from "../deskStore";
import { labelColor } from "../timeline";
import { WORKER_LOADING_LABEL, workerStatusIsLoading } from "../workerStatus";
import { isEditableTarget } from "./keyboard";
import { brushColorKey, brushLabel, useBrushRange } from "./lanes";
import type { DeskNotice } from "./notice";
import type { IdentityWriter } from "./writer";

/** The Frame controls bar: the Brush contents, the range actions that paint
 * with them, and the desk's notice line. */
export function FrameControls({
  clip,
  frameIndex,
  focus,
  vocab,
  writer,
  notify,
  notice,
  height,
}: {
  clip: ClipMeta | undefined;
  frameIndex: number;
  focus: EditorKind;
  vocab: Vocab | undefined;
  writer: IdentityWriter;
  notify: (notice: DeskNotice) => void;
  notice: DeskNotice;
  height: number;
}) {
  const { markedFrom, rangeFrom, rangeTo, focusedBrush, hasBrush } = useBrushRange({
    clipId: clip?.id,
    frameIndex,
    focus,
    vocab,
  });
  const setSpanStart = useDeskStore((s) => s.setSpanStart);
  const dropBrush = useDeskStore((s) => s.dropBrush);
  const { data: health } = useSWR(healthPath(), getJson<HealthResponse>, {
    refreshInterval: 5000,
  });
  const workerLoading = workerStatusIsLoading(health?.worker);

  const applyRange = useCallback(async (remove: boolean) => {
    if (!clip || focusedBrush.length === 0) {
      return;
    }
    try {
      await writer.runExclusive(async () => {
        notify(null);
        for (const identity of focusedBrush) {
          await writer.commitIdentityRange(identity, rangeFrom, rangeTo, remove);
        }
        setSpanStart(null);
        notify({
          text: `${remove ? "Removed" : "Wrote"} ${focusedBrush.map(brushLabel).join(", ")} on frames ${rangeFrom}–${rangeTo}`,
          error: false,
        });
      });
    } catch (err) {
      notify({ text: err instanceof Error ? err.message : "Write failed", error: true });
    }
  }, [clip, focusedBrush, notify, rangeFrom, rangeTo, setSpanStart, writer]);

  // "[" marks the range start, "]" paints the whole range with the Brush.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const bracket = key === "[" || key === "]";
      const typing = isEditableTarget(event.target);
      // Brackets act even from inside a Vocab field: they never belong to a
      // name, and marking a range should not mean leaving the typeahead.
      // Letters stay typeable, so "i"/"o" keep the editable-target guard.
      if (typing && !bracket) {
        return;
      }
      if (!clip || clip.frame_count <= 0) {
        return;
      }
      if (!hasBrush) {
        // Silence here reads as "the key was swallowed" (trial feedback).
        if (bracket && !typing) {
          notify({ text: "Brush is empty — pick an identity in the Library first", error: true });
        }
        return;
      }
      if (key === "[" || key === "i") {
        event.preventDefault();
        setSpanStart({ clipId: clip.id, frameIndex });
        return;
      }
      if (key === "]" || key === "o") {
        event.preventDefault();
        void applyRange(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [applyRange, clip, frameIndex, hasBrush, notify, setSpanStart]);

  return (
      <footer aria-label="Player controls" className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-border bg-card px-4 py-2" style={{ height }}>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Playback in player</span>
        <output className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{clip ? `Frame ${frameIndex} of ${clip.frame_count}` : "No Clip"}</output>
        {markedFrom != null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rangeFrom} → {rangeTo}</span>
        ) : null}
        <div data-brush="" className="flex min-w-0 items-center gap-2">
          {focusedBrush.map((identity) => {
            const id = brushColorKey(identity);
            return (
              <span
                key={`${identity.kind}:${id}`}
                data-label-color={labelColor(id)}
                className="flex max-w-48 items-center gap-0.5 truncate text-xs font-medium"
                style={{ borderLeft: `3px solid ${labelColor(id)}`, paddingLeft: 6 }}
              >
                <span className="truncate">{brushLabel(identity)}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  aria-label={`Remove ${brushLabel(identity)} from Brush`}
                  onClick={() => dropBrush(identity)}
                >
                  <X size={12} />
                </Button>
              </span>
            );
          })}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasBrush || !clip}
          onClick={() => {
            if (clip && hasBrush) {
              setSpanStart({ clipId: clip.id, frameIndex });
            }
          }}
        >
          Mark from
        </Button>
        <Button type="button" size="sm" disabled={!hasBrush} onClick={() => void applyRange(false)}>
          Apply to frames {rangeFrom}–{rangeTo}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!hasBrush} onClick={() => void applyRange(true)}>
          Remove from frames {rangeFrom}–{rangeTo}
        </Button>
        {workerLoading ? (
          // Health poll says the SAM 3.1 worker is still loading (ticket 09).
          <span role="status" className="shrink-0 text-xs text-muted-foreground">
            {WORKER_LOADING_LABEL}
          </span>
        ) : null}
        {notice ? (
          <span role={notice.error ? "alert" : "status"} className={notice.error ? "text-xs text-destructive" : "text-xs text-foreground"}>
            {notice.text}
          </span>
        ) : null}
      </footer>
  );
}
