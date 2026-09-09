import { useState, type FormEvent } from "react";
import useSWR, { mutate } from "swr";
import { getJson, sendJson } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type AssignmentItem = {
  clip_id: string;
  task_type: string;
  state: string;
  assignee: string | null;
  reviewer: string | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  delivered_at: string | null;
  version: number;
};

type ItemsResponse = { items: AssignmentItem[] };

function ItemRow({
  item,
  action,
}: {
  item: AssignmentItem;
  action: "assign" | "reassign";
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await sendJson(
        `/api/items/${encodeURIComponent(item.clip_id)}/${encodeURIComponent(item.task_type)}/${action}`,
        "POST",
        { assignee: username },
      );
      setUsername("");
      await mutate("/api/items");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Assignment");
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="text-sm">
        <span className="font-medium">{item.clip_id}</span>
        <span className="text-muted-foreground"> · {item.task_type}</span>
        {item.assignee ? (
          <span className="text-muted-foreground"> · {item.assignee}</span>
        ) : null}
      </div>
      <form className="flex gap-2" onSubmit={onSubmit}>
        <Input
          aria-label={`Username for ${item.clip_id} ${item.task_type}`}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Button type="submit" size="sm">
          {action === "assign" ? "Assign" : "Reassign"}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

export function AssignmentsBoard() {
  const { data, error } = useSWR("/api/items", getJson<ItemsResponse>);
  if (!data && !error) {
    return <p className="p-6">Loading…</p>;
  }
  if (error || !data) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Assignments</h1>
        <p role="alert">{error instanceof Error ? error.message : "Could not load Assignments"}</p>
      </main>
    );
  }
  const unassigned = data.items.filter((item) => item.state === "Unassigned");
  const labeling = data.items.filter((item) => item.state === "Labeling");
  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="text-xl font-semibold">Assignments</h1>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <section>
          <h2 className="mb-2 text-sm font-medium">Unassigned</h2>
          <ul>
            {unassigned.map((item) => (
              <ItemRow key={`${item.clip_id}:${item.task_type}`} item={item} action="assign" />
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium">Labeling</h2>
          <ul>
            {labeling.map((item) => (
              <ItemRow key={`${item.clip_id}:${item.task_type}`} item={item} action="reassign" />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
