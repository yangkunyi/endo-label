/**
 * The Assignments board's batch gesture: which rows an action may take, what the
 * bar says while it takes them, and how the account picker reads Project membership.
 *
 * The server owns the state machine and answers per item (02's rule: a refused
 * write explains itself). This module owns the board's rendering of that answer —
 * the button that names the count, the confirm that names the holder *before* the
 * work moves, and the `12 assigned · 3 skipped (Done)` notice — so the sentences
 * and the grouping rules are testable without a browser.
 *
 * Project membership (09) is the picker's only source: an Account that is a member
 * of none of the Projects in scope is not offered, and one that is a member of
 * several is offered once.
 */

import type { ProjectRow } from "./api";

export type BatchAction = "assign" | "reassign" | "reviewer";

export type BatchActionSpec = {
  action: BatchAction;
  label: string;
  /** The one state this action takes; every other state answers for itself. */
  state: string;
};

/** The bar's actions, in the order it shows them: each state has exactly one move. */
export const BATCH_ACTIONS: BatchActionSpec[] = [
  { action: "assign", label: "Assign", state: "Unassigned" },
  { action: "reassign", label: "Reassign", state: "Labeling" },
  { action: "reviewer", label: "Assign reviewer", state: "Submitted" },
];

/** The reasons a row cannot be ticked at all — spoken where the checkbox would be. */
const LOCKED_STATES: Record<string, string> = {
  Reviewing: "Reviewing is not assignable",
  Done: "Done is final",
};

const STATES = ["Unassigned", "Labeling", "Submitted", "Reviewing", "Done"];

/** One batch's answer, as `POST /api/items/batch-assign` returns it. */
export type BatchSkipped = { clip_id: string; task_type: string; reason: string };
export type BatchAssignResult = { assigned: unknown[]; skipped: BatchSkipped[] };

export function batchActionOf(action: BatchAction): BatchActionSpec {
  const spec = BATCH_ACTIONS.find((row) => row.action === action);
  if (!spec) {
    throw new Error(`unknown batch action ${action}`);
  }
  return spec;
}

/** A row the board lets you tick: the three states a batch can still move. */
export function batchSelectable(state: string): boolean {
  return BATCH_ACTIONS.some((row) => row.state === state);
}

/** Why this row's checkbox is off, or null when it can be ticked. */
export function rowLockReason(state: string): string | null {
  if (batchSelectable(state)) {
    return null;
  }
  return LOCKED_STATES[state] ?? "This state is not assignable";
}

/** The ticked rows this action may take, in board order. Rows of other states are not. */
export function eligibleItems<T extends { state: string }>(
  items: T[],
  action: BatchAction,
): T[] {
  const wanted = batchActionOf(action).state;
  return items.filter((item) => item.state === wanted);
}

/** Who a reassign would take the work from, once each, in the order they appear. */
export function holders(items: { assignee: string | null }[]): string[] {
  return [
    ...new Set(items.map((item) => item.assignee).filter((name): name is string => Boolean(name))),
  ];
}

export function itemCount(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/** The primary button: the count and the Account, in the action's own words. */
export function batchButtonLabel(
  action: BatchAction,
  count: number,
  account: string,
): string {
  const { label } = batchActionOf(action);
  if (!account) {
    return `${label} ${itemCount(count)}`;
  }
  if (action === "reviewer") {
    return `Assign ${account} as reviewer for ${itemCount(count)}`;
  }
  return `${label} ${itemCount(count)} to ${account}`;
}

/** The reassign confirm: it names the holder the work would come from. */
export function reassignConfirm(count: number, from: string[]): string {
  if (from.length === 0) {
    return `Takes ${itemCount(count)}`;
  }
  return `Takes ${itemCount(count)} from ${from.join(", ")}`;
}

/** The notice: what landed, and why the rest did not, tagged the way the rows are. */
export function batchNotice(assigned: number, skipped: BatchSkipped[]): string {
  const parts = [`${assigned} assigned`];
  if (skipped.length > 0) {
    parts.push(`${skipped.length} skipped (${skipTags(skipped).join(", ")})`);
  }
  return parts.join(" · ");
}

/** The distinct tags of a batch's refusals, most common first, then alphabetically. */
export function skipTags(skipped: BatchSkipped[]): string[] {
  const counts = new Map<string, number>();
  for (const row of skipped) {
    const tag = skipTag(row.reason);
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tag]) => tag);
}

/**
 * One server refusal, reduced to the tag the notice groups by.
 *
 * The server's sentences lead with their cause — the state, the Account, the
 * Project — so a refusal the board did not foresee still lands in the notice
 * rather than being dropped from the count.
 */
export function skipTag(reason: string): string {
  const state = STATES.find((name) => reason.startsWith(name));
  if (state) {
    return state;
  }
  if (reason.includes("not a member")) {
    return "Not a member";
  }
  if (reason.includes("assignee")) {
    return "Reviewer is the assignee";
  }
  if (reason === "No such item") {
    return "No such item";
  }
  return "Skipped";
}

export type AccountGroup = { project: string; accounts: string[] };

/** Ascending by name, comparing case-insensitively, so the picker never depends on locale. */
function byName(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Accounts by the Project that makes them eligible, for the batch picker.
 *
 * `scope` is the Projects the batch actually touches (an empty scope means the
 * whole board). A Project with nobody left in it keeps no group, and an Account
 * that is a member of several Projects is offered once — where it first appears,
 * so the list stays one option per person.
 */
export function accountGroups(
  projects: ProjectRow[],
  scope?: string[],
): AccountGroup[] {
  const wanted = scope ? new Set(scope) : null;
  const seen = new Set<string>();
  const groups: AccountGroup[] = [];
  for (const project of projects) {
    if (wanted && !wanted.has(project.name)) {
      continue;
    }
    const accounts = [...(project.members ?? [])].sort(byName).filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    if (accounts.length > 0) {
      groups.push({ project: project.name, accounts });
    }
  }
  return groups;
}

/**
 * The Accounts one row's control may offer: its own Project's members.
 *
 * `excludeAssignee` is the reviewer control: an item's annotator cannot review
 * it, so the picker does not offer the choice the server would refuse.
 */
export function rowAccountOptions(
  item: { project: string; assignee: string | null },
  projects: ProjectRow[],
  options: { excludeAssignee?: boolean } = {},
): string[] {
  const project = projects.find((row) => row.name === item.project);
  return [...new Set(project?.members ?? [])]
    .sort(byName)
    .filter((name) => !options.excludeAssignee || name !== item.assignee);
}

/**
 * Whether the Account the bar still holds has fallen outside the current groups.
 *
 * The choice survives between batches, so a selection that moves to another
 * Project must not silently blank the picker: the Account is kept and named, and
 * the server's per-item refusal is the answer rather than a surprise.
 */
export function outsideScope(groups: AccountGroup[], account: string): boolean {
  return Boolean(account) && !groups.some((group) => group.accounts.includes(account));
}

export function outsideScopeLabel(account: string): string {
  return `${account} — not a member of these Projects`;
}
