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
  type ProjectRow,
  type ProjectsResponse,
  type TagsResponse,
} from "./api";
import {
  BATCH_ACTIONS,
  accountGroups,
  batchButtonLabel,
  batchNotice,
  eligibleItems,
  holders,
  itemCount,
  outsideScope,
  outsideScopeLabel,
  reassignConfirm,
  rowAccountOptions,
  rowLockReason,
  type AccountGroup,
  type BatchAction,
  type BatchAssignResult,
  type BatchSkipped,
} from "./batchAssign";
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
type RowAction = BatchAction;

/** State columns in workflow order; `action` is the move each column offers, if any. */
const COLUMNS: { state: string; action: RowAction | null }[] = [
  { state: "Unassigned", action: "assign" },
  { state: "Labeling", action: "reassign" },
  { state: "Submitted", action: "reviewer" },
  { state: "Reviewing", action: null },
  { state: "Done", action: null },
];

/** One item's key: the (Clip, Task type) pair every board call is addressed by. */
function itemKey(item: { clip_id: string; task_type: string }): string {
  return `${item.clip_id}:${item.task_type}`;
}

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50";

/**
 * The one account control, twice: the batch bar's (grouped by Project membership,
 * so a Project's people are one block) and a row's (that row's Project alone).
 */
function AccountSelect({
  ariaLabel,
  value,
  groups,
  placeholder,
  onChange,
  grouped = true,
  disabled = false,
  extra = null,
}: {
  ariaLabel: string;
  value: string;
  groups: AccountGroup[];
  placeholder: string;
  onChange: (name: string) => void;
  grouped?: boolean;
  disabled?: boolean;
  extra?: { value: string; label: string } | null;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={SELECT_CLASS}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {extra ? <option value={extra.value}>{extra.label}</option> : null}
      {grouped
        ? groups.map((group) => (
            <optgroup key={group.project} label={group.project}>
              {group.accounts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))
        : groups.flatMap((group) =>
            group.accounts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            )),
          )}
    </select>
  );
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
  projects,
}: {
  item: AssignmentItem;
  action: RowAction | null;
  selected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  canDeliver: boolean;
  itemsKey: string;
  projects: ProjectRow[];
}) {
  const [account, setAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reviewerAction = action === "reviewer";
  // A row's picker offers its own Project's members — and, for a reviewer, not
  // the item's annotator, since that pairing is refused anyway.
  const options = action
    ? rowAccountOptions(item, projects, { excludeAssignee: reviewerAction })
    : [];
  const lock = action === null ? rowLockReason(item.state) : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      return;
    }
    setError(null);
    try {
      const base = `/api/items/${encodeURIComponent(item.clip_id)}/${encodeURIComponent(item.task_type)}`;
      await sendJson(`${base}/${action}`, "POST", {
        [reviewerAction ? "reviewer" : "assignee"]: account,
      });
      setAccount("");
      await mutate(itemsKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Assignment");
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="text-sm">
        {action ? (
          <label className="mr-2 align-middle">
            <input
              type="checkbox"
              aria-label={`Select ${item.clip_id} ${item.task_type}`}
              checked={selected}
              onChange={(event) => onSelect(itemKey(item), event.target.checked)}
            />
          </label>
        ) : (
          // Not selectable, and the reason sits where the checkbox would be.
          <span className="mr-2 align-middle text-xs text-muted-foreground">{lock}</span>
        )}
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
        <form className="flex flex-wrap gap-2" onSubmit={onSubmit}>
          <AccountSelect
            ariaLabel={`${reviewerAction ? "Reviewer" : "Account"} for ${item.clip_id} ${item.task_type}`}
            value={account}
            groups={[{ project: item.project, accounts: options }]}
            grouped={false}
            placeholder={
              options.length ? "Pick an Account" : `No members in ${item.project}`
            }
            disabled={options.length === 0}
            onChange={setAccount}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!account}
            aria-label={`${action === "assign" ? "Assign" : action === "reassign" ? "Reassign" : "Assign reviewer"} ${item.clip_id} ${item.task_type}`}
          >
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
    if (usernames.length === 0) {
      setError("Name at least one assignee");
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
        Auto-assign {itemCount(picks.length)} across these Accounts
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
    </form>
  );
}

/**
 * The sticky bar: pick an Account (or a reviewer), pick an action, press the
 * button that names the count. Either order works — the Account survives between
 * batches, so an Account-first round is one gesture per batch of rows.
 */
function BatchBar({
  groups,
  account,
  onAccount,
  action,
  onAction,
  eligible,
  from,
  confirming,
  busy,
  error,
  result,
  onPress,
  onCancel,
  onClear,
  selectionCount,
}: {
  groups: AccountGroup[];
  account: string;
  onAccount: (name: string) => void;
  action: BatchAction;
  onAction: (next: BatchAction) => void;
  eligible: AssignmentItem[];
  from: string[];
  confirming: boolean;
  busy: boolean;
  error: string | null;
  result: { assigned: number; skipped: BatchSkipped[] } | null;
  onPress: () => void;
  onCancel: () => void;
  onClear: () => void;
  selectionCount: number;
}) {
  return (
    <section
      aria-label="Batch assign"
      className="sticky bottom-0 z-10 -mx-6 mt-6 flex flex-col gap-2 border-t border-border bg-background/95 px-6 py-3 backdrop-blur"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Account
          <AccountSelect
            ariaLabel="Batch account"
            value={account}
            groups={groups}
            placeholder="Pick an Account"
            onChange={onAccount}
            extra={
              outsideScope(groups, account)
                ? { value: account, label: outsideScopeLabel(account) }
                : null
            }
          />
        </label>
        {outsideScope(groups, account) ? (
          <p className="pb-2 text-xs text-muted-foreground">
            {outsideScopeLabel(account)} — the items outside their Projects come back skipped.
          </p>
        ) : null}
        <div
          role="group"
          aria-label="Batch action"
          className="flex flex-wrap items-end gap-1"
        >
          {BATCH_ACTIONS.map((spec) => (
            <Button
              key={spec.action}
              type="button"
              size="sm"
              variant={spec.action === action ? "default" : "outline"}
              aria-pressed={spec.action === action}
              onClick={() => onAction(spec.action)}
            >
              {spec.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || !account || eligible.length === 0}
          onClick={onPress}
        >
          {batchButtonLabel(action, eligible.length, account)}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selectionCount === 0}
          onClick={onClear}
        >
          Clear selection
        </Button>
        <p className="pb-2 text-xs text-muted-foreground">
          {selectionCount === 0
            ? "Tick rows in any column, or start with the Account."
            : `${selectionCount} selected · ${eligible.length} for this action`}
        </p>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm">{reassignConfirm(eligible.length, from)}</span>
          <Button type="button" size="sm" disabled={busy} onClick={onPress}>
            Confirm reassign
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No Project has members yet — add them on the Projects page, or with add-member.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {batchNotice(result.assigned, result.skipped)}
          </p>
          {result.skipped.length ? (
            <ul aria-label="Skipped items" className="flex flex-col gap-0.5 text-xs">
              {result.skipped.map((row) => (
                <li key={itemKey(row)} className="text-muted-foreground">
                  Skipped {row.clip_id}/{row.task_type} — {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
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
  const [account, setAccount] = useState("");
  const [action, setAction] = useState<BatchAction>("assign");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assigned: number; skipped: BatchSkipped[] } | null>(
    null,
  );
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

  const projectRows = projects?.projects ?? [];
  const unassigned = data.items.filter((item) => item.state === "Unassigned");
  const picked = data.items.filter((item) => selected.has(itemKey(item)));
  const eligible = eligibleItems(picked, action);
  // The picker hides non-members of the Projects this action would touch; with
  // nothing ticked yet it offers every Project, so the Account can come first.
  const scope = eligible.length
    ? [...new Set(eligible.map((item) => item.project))]
    : undefined;
  const groups = accountGroups(projectRows, scope);
  const from = holders(eligible);

  function onSelect(key: string, checked: boolean) {
    setConfirming(false);
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

  function onAccount(name: string) {
    setConfirming(false);
    setAccount(name);
  }

  function onAction(next: BatchAction) {
    setConfirming(false);
    setAction(next);
  }

  function clearSelection() {
    setConfirming(false);
    setSelected(new Set());
  }

  async function runBatch() {
    if (busy || !account || eligible.length === 0) {
      return;
    }
    if (action === "reassign" && !confirming) {
      // Name the holder before taking the work: the first press only asks.
      setConfirming(true);
      return;
    }
    setBusy(true);
    setBatchError(null);
    try {
      const items = eligible.map((item) => ({
        clip_id: item.clip_id,
        task_type: item.task_type,
      }));
      const answer = await sendJson<BatchAssignResult>("/api/items/batch-assign", "POST", {
        items,
        ...(action === "reviewer"
          ? { reviewer: account }
          : { assignee: account, allow_reassign: action === "reassign" }),
      });
      setResult({ assigned: answer.assigned.length, skipped: answer.skipped });
      clearSelection();
      await mutate(itemsKey);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Could not update Assignments");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="text-xl font-semibold">Assignments</h1>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project
          <select
            aria-label="Filter by Project"
            className={SELECT_CLASS}
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <option value="">All Projects</option>
            {projectRows.map((row) => (
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
            className={SELECT_CLASS}
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
                    projects={projectRows}
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
        clear={clearSelection}
        itemsKey={itemsKey}
      />
      <BatchBar
        groups={groups}
        account={account}
        onAccount={onAccount}
        action={action}
        onAction={onAction}
        eligible={eligible}
        from={from}
        confirming={confirming}
        busy={busy}
        error={batchError}
        result={result}
        onPress={runBatch}
        onCancel={() => setConfirming(false)}
        onClear={clearSelection}
        selectionCount={picked.length}
      />
    </main>
  );
}
