import type { ItemAction, MyItem } from "./api";

export type TaskButton = { action: ItemAction; label: string };

const STATE_BADGES: Record<string, { label: string; className: string }> = {
  Unassigned: { label: "Unassigned", className: "bg-muted text-muted-foreground" },
  Labeling: { label: "Labeling", className: "bg-primary/20 text-primary" },
  Submitted: { label: "Submitted", className: "bg-sky-500/15 text-sky-300" },
  Reviewing: { label: "Reviewing", className: "bg-amber-500/15 text-amber-300" },
  Done: { label: "Done", className: "bg-emerald-500/15 text-emerald-300" },
};

/** The badge for one item state; an unknown state still shows its own name. */
export function stateBadge(state: string): { label: string; className: string } {
  return STATE_BADGES[state] ?? { label: state, className: "bg-muted text-muted-foreground" };
}

/** The buttons an item row offers, straight from the server's capability payload. */
export function taskActions(item: MyItem): TaskButton[] {
  const buttons: TaskButton[] = [];
  if (item.capabilities?.submit) {
    buttons.push({ action: "submit", label: "Submit" });
  }
  if (item.capabilities?.recall) {
    buttons.push({ action: "recall", label: "Recall" });
  }
  return buttons;
}

/** The reviewer's reject note; it is a banner only while the item is back in Labeling. */
export function rejectNote(item: MyItem): string | null {
  const note = item.note?.trim();
  if (!note || item.state !== "Labeling") {
    return null;
  }
  return note;
}

export function taskHeading(item: MyItem): string {
  return `${item.clip_id} · ${item.task_type}`;
}
