import { expect, test } from "vitest";
import type { ProjectRow } from "./api";
import {
  accountGroups,
  batchButtonLabel,
  batchNotice,
  batchSelectable,
  eligibleItems,
  holders,
  outsideScope,
  outsideScopeLabel,
  rowAccountOptions,
  rowLockReason,
  skipTag,
  skipTags,
  reassignConfirm,
} from "./batchAssign";

function row(over: Partial<ProjectRow> = {}): ProjectRow {
  return { id: 1, name: "Pilot", hospital: "First", clips: [], members: ["alice"], ...over };
}

function item(over: Partial<{ state: string; assignee: string | null }> = {}) {
  return { clip_id: "CLIPA", task_type: "phase", state: "Unassigned", assignee: null, ...over };
}

test("the three states a batch can move are tickable; the other two say why not", () => {
  expect(["Unassigned", "Labeling", "Submitted"].map(batchSelectable)).toEqual([true, true, true]);
  expect(batchSelectable("Reviewing")).toBe(false);
  expect(batchSelectable("Done")).toBe(false);

  expect(rowLockReason("Unassigned")).toBeNull();
  expect(rowLockReason("Labeling")).toBeNull();
  expect(rowLockReason("Submitted")).toBeNull();
  expect(rowLockReason("Reviewing")).toBe("Reviewing is not assignable");
  expect(rowLockReason("Done")).toBe("Done is final");
});

test("one action only ever takes its own state", () => {
  const rows = [
    item({ state: "Unassigned" }),
    item({ state: "Labeling", assignee: "alice" }),
    item({ state: "Submitted", assignee: "bob" }),
  ];
  expect(eligibleItems(rows, "assign").map((one) => one.state)).toEqual(["Unassigned"]);
  expect(eligibleItems(rows, "reassign").map((one) => one.state)).toEqual(["Labeling"]);
  expect(eligibleItems(rows, "reviewer").map((one) => one.state)).toEqual(["Submitted"]);
});

test("the primary button names the count and the Account", () => {
  expect(batchButtonLabel("assign", 12, "boss")).toBe("Assign 12 items to boss");
  expect(batchButtonLabel("assign", 1, "boss")).toBe("Assign 1 item to boss");
  expect(batchButtonLabel("reassign", 3, "boss")).toBe("Reassign 3 items to boss");
  expect(batchButtonLabel("reviewer", 2, "carol")).toBe(
    "Assign carol as reviewer for 2 items",
  );
  // No Account chosen yet: the count is still named, so the press is never a guess.
  expect(batchButtonLabel("assign", 12, "")).toBe("Assign 12 items");
});

test("a reassign names the holder before it takes the work", () => {
  expect(reassignConfirm(3, ["alice"])).toBe("Takes 3 items from alice");
  expect(reassignConfirm(1, ["alice"])).toBe("Takes 1 item from alice");
  expect(reassignConfirm(4, ["alice", "bob"])).toBe("Takes 4 items from alice, bob");
  expect(reassignConfirm(2, [])).toBe("Takes 2 items");
});

test("holders are the ticked rows' Accounts, once each", () => {
  expect(
    holders([
      item({ state: "Labeling", assignee: "alice" }),
      item({ state: "Labeling", assignee: "alice" }),
      item({ state: "Labeling", assignee: "bob" }),
    ]),
  ).toEqual(["alice", "bob"]);
});

test("the notice counts what landed and tags why the rest did not", () => {
  const done = { clip_id: "CLIPA", task_type: "phase", reason: "Done is final" };
  expect(batchNotice(12, [done, done, done])).toBe("12 assigned · 3 skipped (Done)");
  expect(batchNotice(12, [])).toBe("12 assigned");
  expect(batchNotice(0, [done])).toBe("0 assigned · 1 skipped (Done)");
  expect(
    batchNotice(2, [
      done,
      { clip_id: "CLIPB", task_type: "phase", reason: "Reviewing is not assignable" },
      {
        clip_id: "CLIPB",
        task_type: "class",
        reason: "alice is not a member of Project Ward — add them first.",
      },
    ]),
  ).toBe("2 assigned · 3 skipped (Done, Not a member, Reviewing)");
});

test("a server reason is tagged by its cause, whatever the sentence adds", () => {
  expect(skipTag("Done is final")).toBe("Done");
  expect(skipTag("Reviewing is not assignable")).toBe("Reviewing");
  expect(skipTag("Labeling — alice holds it")).toBe("Labeling");
  expect(skipTag("Submitted — assign a reviewer instead")).toBe("Submitted");
  expect(skipTag("Unassigned has nothing to review")).toBe("Unassigned");
  expect(skipTag("alice is not a member of Project Ward — add them first.")).toBe("Not a member");
  expect(skipTag("alice is the assignee — pick another reviewer")).toBe(
    "Reviewer is the assignee",
  );
  expect(skipTag("No such item")).toBe("No such item");
  // An unforeseen sentence still lands in the notice instead of vanishing.
  expect(skipTag("Changed while you were picking")).toBe("Skipped");
  expect(skipTags([{ clip_id: "A", task_type: "phase", reason: "Done is final" }])).toEqual([
    "Done",
  ]);
});

test("the picker groups Accounts by Project and offers each one once", () => {
  const projects = [
    row({ id: 1, name: "Pilot", members: ["bob", "alice"] }),
    row({ id: 2, name: "Ward", members: ["carol", "alice"] }),
    row({ id: 3, name: "Empty", members: [] }),
  ];
  expect(accountGroups(projects)).toEqual([
    { project: "Pilot", accounts: ["alice", "bob"] },
    { project: "Ward", accounts: ["carol"] },
  ]);
});

test("the picker's scope is the Projects the batch touches, so non-members are hidden", () => {
  const projects = [
    row({ id: 1, name: "Pilot", members: ["alice", "bob"] }),
    row({ id: 2, name: "Ward", members: ["carol"] }),
  ];
  expect(accountGroups(projects, ["Ward"])).toEqual([{ project: "Ward", accounts: ["carol"] }]);
  expect(accountGroups(projects, ["Nowhere"])).toEqual([]);
  // An Account in no Project at all is in no group, and so never offered.
  expect(accountGroups(projects, ["Pilot", "Ward"]).flatMap((group) => group.accounts)).toEqual([
    "alice",
    "bob",
    "carol",
  ]);
});

test("a row offers its own Project's members", () => {  const projects = [
    row({ id: 1, name: "Pilot", members: ["bob", "alice"] }),
    row({ id: 2, name: "Ward", members: ["carol"] }),
  ];
  expect(rowAccountOptions({ project: "Pilot", assignee: null }, projects)).toEqual([
    "alice",
    "bob",
  ]);
  // The reviewer control drops the item's annotator: that refusal is not offered.
  expect(
    rowAccountOptions({ project: "Pilot", assignee: "alice" }, projects, {
      excludeAssignee: true,
    }),
  ).toEqual(["bob"]);
  // A Project with nobody in it has nothing to offer, and an unknown one has less.
  expect(rowAccountOptions({ project: "Ward", assignee: "carol" }, projects, {
    excludeAssignee: true,
  })).toEqual([]);
  expect(rowAccountOptions({ project: "Ghost", assignee: null }, projects)).toEqual([]);
});

test("the chosen Account survives a selection that leaves its Projects behind", () => {
  const groups = accountGroups([row({ name: "Pilot", members: ["alice"] })], ["Pilot"]);
  expect(outsideScope(groups, "alice")).toBe(false);
  expect(outsideScope(groups, "carol")).toBe(true);
  // Nothing chosen yet is not outside anything.
  expect(outsideScope(groups, "")).toBe(false);
  expect(outsideScopeLabel("carol")).toBe("carol — not a member of these Projects");
});
