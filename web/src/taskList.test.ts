import { expect, test } from "vitest";
import type { MyItem } from "./api";
import { rejectNote, stateBadge, taskActions, taskHeading } from "./taskList";

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
