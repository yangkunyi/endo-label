import { expect, test } from "vitest";
import type { MyItem } from "./api";
import { rejectNote, rejectNoteIsValid, splitItems, stateBadge, taskActions, taskHeading } from "./taskList";

function item(over: Partial<MyItem> = {}): MyItem {
  return {
    clip_id: "CLIPA",
    task_type: "phase",
    state: "Labeling",
    assignee: "alice",
    reviewer: null,
    note: null,
    reviewed_by: null,
    reviewed_at: null,
    delivered_at: null,
    version: 3,
    capabilities: {},
    ...over,
  };
}

test("a Labeling item offers submit when the server says so", () => {
  expect(taskActions(item({ capabilities: { submit: true, recall: false } }))).toEqual([
    { action: "submit", label: "Submit" },
  ]);
});

test("a Submitted item offers recall instead of submit", () => {
  expect(
    taskActions(item({ state: "Submitted", capabilities: { submit: false, recall: true } })),
  ).toEqual([{ action: "recall", label: "Recall" }]);
});

test("no capability means no button, whatever the state", () => {
  expect(taskActions(item({ state: "Submitted", capabilities: {} }))).toEqual([]);
  expect(
    taskActions(item({ state: "Reviewing", capabilities: { submit: false, recall: false } })),
  ).toEqual([]);
});

test("the reject note shows as a banner only while Labeling", () => {
  expect(rejectNote(item({ note: "fix frame 3" }))).toBe("fix frame 3");
  expect(rejectNote(item({ state: "Submitted", note: "fix frame 3" }))).toBeNull();
  expect(rejectNote(item({ note: null }))).toBeNull();
  expect(rejectNote(item({ note: "   " }))).toBeNull();
});

test("every state gets its own badge", () => {
  const badges = ["Unassigned", "Labeling", "Submitted", "Reviewing", "Done"].map(
    (state) => stateBadge(state),
  );
  expect(badges.map((badge) => badge.label)).toEqual([
    "Unassigned",
    "Labeling",
    "Submitted",
    "Reviewing",
    "Done",
  ]);
  expect(new Set(badges.map((badge) => badge.className)).size).toBe(5);
  expect(stateBadge("Something else")).toEqual({
    label: "Something else",
    className: "bg-muted text-muted-foreground",
  });
});

test("an item heading names the Clip and the Task type", () => {
  expect(taskHeading(item())).toBe("CLIPA · phase");
});

test("a Reviewing item offers Pass and Reject when the server says so", () => {
  expect(
    taskActions(
      item({
        state: "Reviewing",
        reviewer: "carol",
        capabilities: { pass: true, reject: true, edit_labels: true },
      }),
    ),
  ).toEqual([
    { action: "pass", label: "Pass" },
    { action: "reject", label: "Reject" },
  ]);
});

test("a Done item offers Reject and reopen for a reviewer", () => {
  expect(
    taskActions(
      item({
        state: "Done",
        reviewer: "carol",
        capabilities: { reject: true, re_review: true },
      }),
    ),
  ).toEqual([
    { action: "reject", label: "Reject" },
    { action: "re_review", label: "Reopen for review" },
  ]);
});

test("My Tasks splits the annotator's own items from the review queue", () => {
  const mine = item({ clip_id: "CLIPA", assignee: "alice" });
  const reviewing = item({
    clip_id: "CLIPB",
    state: "Reviewing",
    assignee: "bob",
    reviewer: "carol",
  });
  const done = item({ clip_id: "CLIPC", state: "Done", assignee: "bob", reviewer: "carol" });
  const other = item({ clip_id: "CLIPD", assignee: "bob" });

  expect(splitItems([mine, reviewing, done, other], "carol")).toEqual({
    mine: [],
    review: [reviewing, done],
  });
  expect(splitItems([mine, reviewing, done, other], "alice")).toEqual({
    mine: [mine],
    review: [],
  });
});

test("a reject needs a non-blank note", () => {
  expect(rejectNoteIsValid("fix frame 3")).toBe(true);
  expect(rejectNoteIsValid("   ")).toBe(false);
  expect(rejectNoteIsValid("")).toBe(false);
});
