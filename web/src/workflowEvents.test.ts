import { expect, test } from "vitest";
import {
  WORKFLOW_EVENTS_PATH,
  subscribeWorkflowEvents,
  workflowKey,
} from "./workflowEvents";

/** A stand-in for the browser's EventSource: it records listeners and replays frames. */
class FakeSource {
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const current = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...current, listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function collector() {
  const filters: ((key: unknown) => boolean)[] = [];
  return {
    filters,
    revalidate: (filter: (key: unknown) => boolean) => {
      filters.push(filter);
    },
  };
}

test("the stream lives at the app's event endpoint", () => {
  expect(WORKFLOW_EVENTS_PATH).toBe("/api/events");
});

test("workflow keys are the lists, the board, the Clip directory and the desk's item view", () => {
  expect(workflowKey("/api/me/items")).toBe(true);
  expect(workflowKey("/api/items?project=Study&tag=west")).toBe(true);
  expect(workflowKey("/api/clips")).toBe(true);
  expect(workflowKey("/api/clips?scope=mine&tag=west")).toBe(true);
  expect(workflowKey("/api/me?clip_id=CLIPA&task_type=phase")).toBe(true);
});

test("workflow keys leave identity, labels and vocab alone", () => {
  expect(workflowKey("/api/me")).toBe(false);
  expect(workflowKey("/api/vocab?clip_id=CLIPA")).toBe(false);
  expect(workflowKey("/api/registry")).toBe(false);
  expect(workflowKey(["CLIPA", "phase"])).toBe(false);
  expect(workflowKey(null)).toBe(false);
});

test("a resync frame refetches every list the app shows", () => {
  const source = new FakeSource();
  const { filters, revalidate } = collector();
  subscribeWorkflowEvents(source, revalidate);

  source.emit("resync", { reason: "connected" });

  expect(filters).toHaveLength(1);
  expect(filters[0]("/api/items")).toBe(true);
});

test("a transition frame refetches them too", () => {
  const source = new FakeSource();
  const { filters, revalidate } = collector();
  subscribeWorkflowEvents(source, revalidate);

  source.emit("transition", {
    action: "pass",
    clip_id: "CLIPA",
    task_type: "phase",
    state: "Done",
  });

  expect(filters).toHaveLength(1);
  expect(filters[0]("/api/me/items")).toBe(true);
});

test("the subscription is closed when the app shell goes away", () => {
  const source = new FakeSource();
  const { revalidate } = collector();
  const unsubscribe = subscribeWorkflowEvents(source, revalidate);

  unsubscribe();

  expect(source.closed).toBe(true);
});
