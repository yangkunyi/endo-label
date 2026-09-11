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

/** Every transition button, in the order the desk and the list show them. */
const TASK_BUTTONS: TaskButton[] = [
  { action: "submit", label: "Submit" },
  { action: "recall", label: "Recall" },
  { action: "pass", label: "Pass" },
  { action: "reject", label: "Reject" },
  { action: "re_review", label: "Reopen for review" },
];

/** The buttons an item row offers, straight from the server's capability payload. */
export function taskActions(item: MyItem): TaskButton[] {
  return TASK_BUTTONS.filter((button) => item.capabilities?.[button.action]);
}

/** A reject needs one short note; whitespace is not a note. */
export function rejectNoteIsValid(note: string): boolean {
  return note.trim().length > 0;
}

/** One `/api/me/items` payload serves both sides: the assignee's work, the reviewer's queue. */
export function splitItems(
  items: MyItem[],
  username: string,
): { mine: MyItem[]; review: MyItem[] } {
  const mine: MyItem[] = [];
  const review: MyItem[] = [];
  for (const item of items) {
    if (item.assignee === username) {
      mine.push(item);
    } else if (item.reviewer === username) {
      review.push(item);
    }
  }
  return { mine, review };
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
