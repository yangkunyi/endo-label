import { useState, type FormEvent } from "react";
import useSWR, { mutate } from "swr";
import {
  deliverPath,
  getJson,
  itemsPath,
  projectsPath,
  sendJson,
  tagsPath,
  type Me,
  type ProjectsResponse,
  type TagsResponse,
} from "./api";
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
  project: string;
  tags: string[];
};

type ItemsResponse = { items: AssignmentItem[] };
type AutoAssignResponse = { assigned: AssignmentItem[]; counts: Record<string, number> };

/** State columns in workflow order; `action` is the in-row move each column offers. */
const COLUMNS: { state: string; action: "assign" | "reassign" | "reviewer" | null }[] = [
  { state: "Unassigned", action: "assign" },
  { state: "Labeling", action: "reassign" },
  { state: "Submitted", action: "reviewer" },
  { state: "Reviewing", action: null },
  { state: "Done", action: null },
];

function itemKey(item: AssignmentItem): string {
  return `${item.clip_id}:${item.task_type}`;
}

function DeliveredMarker({
  item,
  canDeliver,
  itemsKey,
}: {
  item: AssignmentItem;
  canDeliver: boolean;
  itemsKey: string;
}) {
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    try {
      await sendJson(
        deliverPath(item.clip_id, item.task_type),
        item.delivered_at ? "DELETE" : "POST",
      );
      await mutate(itemsKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update delivery");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.delivered_at ? (
        <span className="text-xs text-muted-foreground">
          Delivered {new Date(item.delivered_at).toLocaleString()}
        </span>
      ) : null}
      {canDeliver ? (
        <Button type="button" size="sm" variant="outline" onClick={toggle}>
          {item.delivered_at ? "Clear delivery" : "Mark delivered"}
        </Button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function ItemRow({
  item,
  action,
  selected,
  onSelect,
  canDeliver,
  itemsKey,
}: {
  item: AssignmentItem;
  action: "assign" | "reassign" | "reviewer" | null;
  selected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  canDeliver: boolean;
  itemsKey: string;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reviewerAction = action === "reviewer";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const base = `/api/items/${encodeURIComponent(item.clip_id)}/${encodeURIComponent(item.task_type)}`;
      await sendJson(`${base}/${action}`, "POST", {
        [reviewerAction ? "reviewer" : "assignee"]: username,
      });
      setUsername("");
      await mutate(itemsKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Assignment");
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="text-sm">
        {action === "assign" ? (
          <label className="mr-2 align-middle">
            <input
              type="checkbox"
              aria-label={`Select ${item.clip_id} ${item.task_type}`}
              checked={selected}
              onChange={(event) => onSelect(itemKey(item), event.target.checked)}
            />
          </label>
        ) : null}
        <span className="font-medium">{item.clip_id}</span>
        <span className="text-muted-foreground"> · {item.task_type}</span>
        {item.assignee ? (
          <span className="text-muted-foreground"> · {item.assignee}</span>
        ) : null}
        {item.reviewer ? (
          <span className="text-muted-foreground"> · review: {item.reviewer}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{item.project}</span>
        {item.tags.length ? <span>{item.tags.join(", ")}</span> : null}
      </div>
      {item.reviewed_by ? (
        <p className="text-xs text-muted-foreground">Reviewed by {item.reviewed_by}</p>
      ) : null}
      {item.note ? <p className="text-xs text-muted-foreground">Note: {item.note}</p> : null}
      <DeliveredMarker item={item} canDeliver={canDeliver} itemsKey={itemsKey} />
      {action ? (
        <form className="flex gap-2" onSubmit={onSubmit}>
          <Input
            aria-label={`${reviewerAction ? "Reviewer" : "Username"} for ${item.clip_id} ${item.task_type}`}
            placeholder={reviewerAction ? "Reviewer" : "Username"}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button type="submit" size="sm">
            {action === "assign" ? "Assign" : action === "reassign" ? "Reassign" : "Assign reviewer"}
          </Button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

function AutoAssign({
  unassigned,
  selected,
  clear,
  itemsKey,
}: {
  unassigned: AssignmentItem[];
  selected: Set<string>;
  clear: () => void;
  itemsKey: string;
}) {
  const [assignees, setAssignees] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const picks = unassigned.filter((item) => selected.has(itemKey(item)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const usernames = assignees
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (usernames.length === 0 || picks.length === 0) {
      setError("Pick at least one item and one assignee");
      return;
    }
    try {
      const result = await sendJson<AutoAssignResponse>("/api/items/auto-assign", "POST", {
        assignees: usernames,
        items: picks.map((item) => ({ clip_id: item.clip_id, task_type: item.task_type })),
      });
      setNotice(`Assigned ${result.assigned.length} item(s)`);
      clear();
      await mutate(itemsKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not auto-assign");
    }
  }

  return (
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={submit}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Assignees (comma separated)
        <Input
          aria-label="Auto-assign assignees"
          value={assignees}
          onChange={(event) => setAssignees(event.target.value)}
        />
      </label>
      <Button type="submit" size="sm" disabled={picks.length === 0}>
        Auto-assign selected ({picks.length})
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
    </form>
  );
}

export function AssignmentsBoard() {
  const [project, setProject] = useState("");
  const [tag, setTag] = useState("");
  const itemsKey = itemsPath({ project, tag });
  const { data, error } = useSWR(itemsKey, getJson<ItemsResponse>);
  const { data: projects } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const { data: tags } = useSWR(tagsPath(), getJson<TagsResponse>);
  const { data: me } = useSWR("/api/me", getJson<Me>);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canDeliver = Boolean(me?.roles.admin || me?.roles.reviewer);

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

  function onSelect(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="text-xl font-semibold">Assignments</h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project
          <select
            aria-label="Filter by Project"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <option value="">All Projects</option>
            {projects?.projects.map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Clip tag
          <select
            aria-label="Filter by Clip tag"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            <option value="">All tags</option>
            {tags?.tags.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-4">
        {COLUMNS.map((column) => {
          const items = data.items.filter((item) => item.state === column.state);
          return (
            <section key={column.state} className="min-w-0">
              <h2 className="mb-2 text-sm font-medium">
                {column.state} <span className="text-muted-foreground">({items.length})</span>
              </h2>
              <ul>
                {items.map((item) => (
                  <ItemRow
                    key={itemKey(item)}
                    item={item}
                    action={column.action}
                    selected={selected.has(itemKey(item))}
                    onSelect={onSelect}
                    canDeliver={canDeliver}
                    itemsKey={itemsKey}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <AutoAssign
        unassigned={unassigned}
        selected={selected}
        clear={() => setSelected(new Set())}
        itemsKey={itemsKey}
      />
    </main>
  );
}
