import { useState } from "react";
import { Link } from "react-router-dom";
import useSWR, { mutate } from "swr";
import {
  clipDeskPath,
  getJson,
  itemActionPath,
  myItemsPath,
  saveErrorMessage,
  sendJson,
  type MyItem,
  type MyItemsResponse,
} from "./api";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";
import { rejectNote, stateBadge, taskActions, taskHeading } from "./taskList";

function ItemRow({ item }: { item: MyItem }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const note = rejectNote(item);
  const badge = stateBadge(item.state);

  async function run(action: "submit" | "recall") {
    setError(null);
    setBusy(true);
    try {
      await sendJson(itemActionPath(item.clip_id, item.task_type, action), "POST");
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      // Any mutation, and any conflict, revalidates the list either way.
      await mutate(myItemsPath());
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="font-medium underline"
          title={taskHeading(item)}
          to={clipDeskPath(item.clip_id)}
        >
          {taskHeading(item)}
        </Link>
        <span
          data-state={item.state}
          className={cn("rounded-md px-2 py-0.5 text-xs font-medium", badge.className)}
        >
          {badge.label}
        </span>
        <span className="ml-auto flex gap-2">
          {taskActions(item).map((button) => (
            <Button
              key={button.action}
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void run(button.action)}
            >
              {button.label}
            </Button>
          ))}
        </span>
      </div>
      {note ? (
        <p
          data-reject-note=""
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          Reviewer note: {note}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

export function MyTasks() {
  const { data, error } = useSWR(myItemsPath(), getJson<MyItemsResponse>);

  if (!data && !error) {
    return <p className="p-6">Loading My Tasks…</p>;
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-3 text-xl font-semibold">My Tasks</h1>
        <p role="alert">{error instanceof Error ? error.message : "Could not load My Tasks"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto h-full max-w-3xl overflow-auto p-6">
      <h1 className="mb-1 text-xl font-semibold">My Tasks</h1>
      <p className="mb-4 text-muted-foreground">
        The (Clip, Task type) items assigned to you, with the state the server reports.
      </p>
      {data.items.length === 0 ? (
        <p className="text-muted-foreground">No items are assigned to you yet.</p>
      ) : (
        <ul>
          {data.items.map((item) => (
            <ItemRow key={`${item.clip_id}:${item.task_type}`} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}
