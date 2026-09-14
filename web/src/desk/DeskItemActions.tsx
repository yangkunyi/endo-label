import useSWR from "swr";
import { getJson, mePath, type Me, type MyItem } from "../api";
import { ItemActions as ItemActionsPanel } from "../ItemActions";
import { cn } from "../lib/utils";
import { submitGapNotice, type FrameCoverage } from "../timeline";
import { rejectNote, stateBadge, taskActions } from "../taskList";
import type { EditorKind } from "../deskStore";

/** The focused (Clip, Task type)'s transitions, from the /api/me capability payload.

Submit / recall are the annotator's; pass / reject / reopen are the reviewer's —
the same server-derived buttons the task list shows, rendered on the desk.

The Submit hint is read off the same coverage map the Coverage Strip draws, so
the sentence and the band count one set of Unlabeled gaps (ADR 0029).
*/
export function DeskItemActions({
  clipId,
  taskType,
  coverage,
}: {
  clipId: string;
  taskType: EditorKind;
  /** The focused Task type's coverage, folded once by the desk (ADR 0029). */
  coverage: FrameCoverage;
}) {
  const { data, mutate } = useSWR(mePath(clipId, taskType), getJson<Me>);
  const item: MyItem | undefined = data?.item;
  const note = item ? rejectNote(item) : null;
  const badge = item ? stateBadge(item.state) : null;

  if (!item || (!badge && taskActions(item).length === 0)) {
    return null;
  }

  return (
    <>
      {badge ? (
        <span
          data-state={item.state}
          className={cn("rounded-md px-2 py-0.5 text-xs font-medium", badge.className)}
        >
          {badge.label}
        </span>
      ) : null}
      <ItemActionsPanel
        clipId={clipId}
        taskType={taskType}
        item={item}
        onCompleted={mutate}
        submitNotice={() => submitGapNotice(coverage)}
      />
      {note ? (
        <p
          data-reject-note=""
          className="basis-full rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          Reviewer note: {note}
        </p>
      ) : null}
    </>
  );
}
