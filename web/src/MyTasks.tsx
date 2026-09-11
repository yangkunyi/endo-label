import { Link } from "react-router-dom";
import useSWR, { mutate } from "swr";
import {
  clipDeskPath,
  getJson,
  mePath,
  myItemsPath,
  type Me,
  type MyItem,
  type MyItemsResponse,
} from "./api";
import { ItemActions } from "./ItemActions";
import { cn } from "./lib/utils";
import { rejectNote, splitItems, stateBadge, taskHeading } from "./taskList";

function ItemRow({
  item,
  showAssignee,
}: {
  item: MyItem;
  showAssignee: boolean;
}) {
  const note = rejectNote(item);
  const badge = stateBadge(item.state);

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
        {showAssignee && item.assignee ? (
          <span className="text-xs text-muted-foreground">label: {item.assignee}</span>
        ) : null}
        <ItemActions
          className="ml-auto"
          clipId={item.clip_id}
          taskType={item.task_type}
          item={item}
          onCompleted={() => mutate(myItemsPath())}
        />
      </div>
      {note ? (
        <p
          data-reject-note=""
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          Reviewer note: {note}
        </p>
      ) : null}
    </li>
  );
}

function ItemSection({
  title,
  hint,
  items,
  showAssignee,
  empty,
}: {
  title: string;
  hint: string;
  items: MyItem[];
  showAssignee: boolean;
  empty: string;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">{hint}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <ItemRow
              key={`${item.clip_id}:${item.task_type}`}
              item={item}
              showAssignee={showAssignee}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function MyTasks() {
  const { data: me } = useSWR(mePath(), getJson<Me>);
  const { data, error } = useSWR(myItemsPath(), getJson<MyItemsResponse>);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-3 text-xl font-semibold">My Tasks</h1>
        <p role="alert">{error instanceof Error ? error.message : "Could not load My Tasks"}</p>
      </main>
    );
  }
  if (!data || !me) {
    return <p className="p-6">Loading My Tasks…</p>;
  }

  const username = me.username;
  const { mine, review } = splitItems(data.items, username);
  const isReviewer = Boolean(me.capabilities?.review);

  return (
    <main className="mx-auto h-full max-w-3xl overflow-auto p-6">
      <h1 className="mb-1 text-xl font-semibold">My Tasks</h1>
      <p className="mb-4 text-muted-foreground">
        The (Clip, Task type) items assigned to you, with the state the server reports.
      </p>
      {isReviewer ? (
        <ItemSection
          title="To review"
          hint="Items assigned to you for review. Pass them, or send one back with a note."
          items={review}
          showAssignee
          empty="Nothing is waiting for your review."
        />
      ) : null}
      <ItemSection
        title={isReviewer ? "My labeling" : "Assigned to me"}
        hint="Items you label; submit from here or from the desk."
        items={mine}
        showAssignee={false}
        empty="No items are assigned to you yet."
      />
    </main>
  );
}
