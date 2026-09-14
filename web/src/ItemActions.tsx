import { useState, type FormEvent } from "react";
import {
  itemActionPath,
  saveErrorMessage,
  sendJson,
  type ItemAction,
  type MyItem,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import type { SubmitHintSource } from "./submitHint";
import { rejectNoteIsValid, taskActions } from "./taskList";

const NOTE_PLACEHOLDER = "What needs fixing?";

/** Pass / reject / reopen for one item, straight from its capability payload.

Both the desk header and the task list render this: the buttons are the same
server-derived set, and a reject collects its one short note before it posts.

`submitNotice` is the Submit hint's source: where the desk knows the focused
Task type's coverage map it names the gap, and the submit it names still goes
through (ADR 0029).
*/
export function ItemActions({
  clipId,
  taskType,
  item,
  onCompleted,
  className,
  submitNotice,
}: {
  clipId: string;
  taskType: string;
  item: MyItem;
  onCompleted: () => unknown;
  className?: string;
  submitNotice?: SubmitHintSource;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [submitHint, setSubmitHint] = useState<string | null>(null);

  /**
   * Read the hint at submit time, never letting it stand in the way: a coverage
   * map that cannot be read says nothing rather than blocking the submit.
   */
  async function announceSubmitHint() {
    if (!submitNotice) {
      return;
    }
    try {
      setSubmitHint((await submitNotice()) ?? null);
    } catch {
      setSubmitHint(null);
    }
  }

  async function run(action: ItemAction, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      if (action === "submit") {
        // How much is missing, said before the submit it does not stop.
        await announceSubmitHint();
      }
      await sendJson(itemActionPath(clipId, taskType, action), "POST", body);
      setRejecting(false);
      setNote("");
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      // The transition moved the item: the capability payload is stale now.
      await onCompleted();
      setBusy(false);
    }
  }

  async function submitReject(event: FormEvent) {
    event.preventDefault();
    if (!rejectNoteIsValid(note)) {
      return;
    }
    await run("reject", { note: note.trim() });
  }

  const buttons = taskActions(item);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((button) =>
          button.action === "reject" ? (
            <Button
              key={button.action}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-expanded={rejecting}
              onClick={() => setRejecting((open) => !open)}
            >
              {button.label}
            </Button>
          ) : (
            <Button
              key={button.action}
              type="button"
              size="sm"
              variant={button.action === "re_review" ? "outline" : "default"}
              disabled={busy}
              onClick={() => void run(button.action)}
            >
              {button.label}
            </Button>
          ),
        )}
        {submitHint ? (
          <span role="status" data-submit-hint="" className="text-xs text-muted-foreground">
            {submitHint}
          </span>
        ) : null}
      </div>
      {rejecting ? (
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={submitReject}>
          <Input
            aria-label="Reject note"
            className="h-7 max-w-64 text-xs"
            autoFocus
            placeholder={NOTE_PLACEHOLDER}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={busy || !rejectNoteIsValid(note)}
          >
            Send back
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setNote("");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
