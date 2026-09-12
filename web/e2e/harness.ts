import { expect, type APIRequestContext } from "@playwright/test";
import { E2E_PASS, E2E_USER } from "./auth";

/** The isolated sitting: one Project holding the three fixture Clips. */
export const E2E_PROJECT = "E2E";
export const E2E_CLIPS = ["CLIP_E2E", "CLIP_E2E_B", "CLIP_VID"] as const;
export const TASK_TYPES = ["phase", "class", "triplet", "mask"] as const;

export type Account = { username: string; password: string };
export type Roles = { admin?: boolean; reviewer?: boolean; annotator?: boolean };

export const ADMIN: Account = { username: E2E_USER, password: E2E_PASS };
export const ANNOTATOR: Account = { username: "e2e-annotator", password: "annotator-pass" };
export const REVIEWER: Account = { username: "e2e-reviewer", password: "reviewer-pass" };

export type ItemRow = {
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

/** One request context, one Account: log in and the context carries the cookie. */
export async function loginAs(request: APIRequestContext, account: Account): Promise<void> {
  const response = await request.post("/api/auth/login", {
    data: { username: account.username, password: account.password },
  });
  expect(response.ok(), `login ${account.username}: ${response.status()}`).toBeTruthy();
}

/** Log the caller in as the admin, then make `account` exist with those roles. */
export async function ensureAccount(
  request: APIRequestContext,
  account: Account,
  roles: Roles,
): Promise<void> {
  const response = await request.post("/api/admin/users", {
    data: {
      username: account.username,
      password: account.password,
      roles: { admin: false, reviewer: false, annotator: false, ...roles },
    },
  });
  expect(
    [200, 409],
    `create ${account.username}: ${response.status()} ${await response.text()}`,
  ).toContain(response.status());
}

export async function boardItems(request: APIRequestContext): Promise<ItemRow[]> {
  const response = await request.get("/api/items");
  expect(response.ok(), `items: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { items: ItemRow[] }).items;
}

export async function itemFor(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
): Promise<ItemRow> {
  const items = await boardItems(request);
  const item = items.find((row) => row.clip_id === clipId && row.task_type === taskType);
  expect(item, `no item ${clipId}/${taskType}`).toBeTruthy();
  return item as ItemRow;
}

/** The state the server stores for one item — the seam every board assertion reads. */
export async function stateOf(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
): Promise<string> {
  return (await itemFor(request, clipId, taskType)).state;
}

async function postItem(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
  action: string,
  data?: unknown,
): Promise<void> {
  const response = await request.post(
    `/api/items/${encodeURIComponent(clipId)}/${encodeURIComponent(taskType)}/${action}`,
    { data },
  );
  expect(response.ok(), `${action} ${clipId}/${taskType}: ${response.status()} ${await response.text()}`).toBeTruthy();
}

/** One transition, asserted: the spec never posts a state change blind. */
export async function itemAction(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
  action: string,
  data?: unknown,
): Promise<ItemRow> {
  const response = await request.post(
    `/api/items/${encodeURIComponent(clipId)}/${encodeURIComponent(taskType)}/${action}`,
    { data },
  );
  expect(
    response.ok(),
    `${action} ${clipId}/${taskType}: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return itemFor(request, clipId, taskType);
}

export async function assign(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
  username: string,
): Promise<void> {
  await postItem(request, clipId, taskType, "assign", { assignee: username });
}

export async function assignReviewer(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
  reviewer: string,
): Promise<void> {
  await postItem(request, clipId, taskType, "reviewer", { reviewer });
}

/** One item every clip x task type is Labeling for `username` — the desk is writable. */
export async function ensureLabelingFor(
  request: APIRequestContext,
  username: string,
  clips: readonly string[] = E2E_CLIPS,
  taskTypes: readonly string[] = TASK_TYPES,
): Promise<void> {
  const items = await boardItems(request);
  for (const clipId of clips) {
    for (const taskType of taskTypes) {
      const item = items.find((row) => row.clip_id === clipId && row.task_type === taskType);
      expect(item, `no item ${clipId}/${taskType}`).toBeTruthy();
      if (item!.state === "Labeling" && item!.assignee === username) {
        continue;
      }
      if (item!.state === "Unassigned") {
        await assign(request, clipId, taskType, username);
      } else if (item!.state === "Submitted") {
        await postItem(request, clipId, taskType, "recall");
        const recalled = await itemFor(request, clipId, taskType);
        if (recalled.assignee !== username) {
          await postItem(request, clipId, taskType, "reassign", { assignee: username });
        }
      } else if (item!.state === "Labeling") {
        await postItem(request, clipId, taskType, "reassign", { assignee: username });
      } else {
        throw new Error(`${clipId}/${taskType} is ${item!.state}; cannot make it labelable`);
      }
    }
  }
}

export type RegistryRow = {
  id: number;
  kind: string;
  name: string;
  instrument: string;
  verb: string;
  target: string;
  archived: boolean;
};

export async function registryRows(request: APIRequestContext): Promise<RegistryRow[]> {
  const response = await request.get("/api/registry");
  expect(response.ok(), `registry: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { items: RegistryRow[] }).items;
}

/** Strip every label from these Clips, so each spec starts from a clean Frame set. */
export async function clearLabels(
  request: APIRequestContext,
  clips: readonly string[] = E2E_CLIPS,
): Promise<void> {
  for (const clipId of clips) {
    const meta = await request.get(`/api/clips/${encodeURIComponent(clipId)}`);
    expect(meta.ok(), `clip ${clipId}: ${meta.status()}`).toBeTruthy();
    const frameCount = ((await meta.json()) as { frame_count: number }).frame_count;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      // Label writes are the assignee's, so a caller without the item would get
      // a silent no-op here: every wipe has to be asserted.
      const phase = await request.put(`/api/phase/${clipId}/frames/${frameIndex}`, {
        data: { phase: null },
      });
      expect(phase.ok(), `clear phase ${clipId}/${frameIndex}: ${phase.status()}`).toBeTruthy();
      const klass = await request.put(`/api/class/${clipId}/frames/${frameIndex}`, {
        data: { tags: [] },
      });
      expect(klass.ok(), `clear class ${clipId}/${frameIndex}: ${klass.status()}`).toBeTruthy();
    }
    const tripletDoc = (await (await request.get(`/api/triplet/${clipId}`)).json()) as {
      frames?: Record<string, { id: number }[]>;
    };
    for (const [frameIndex, rows] of Object.entries(tripletDoc.frames ?? {})) {
      for (const row of rows) {
        const cleared = await request.delete(
          `/api/triplet/${clipId}/frames/${frameIndex}/${row.id}`,
        );
        expect(cleared.ok(), `clear triplet ${clipId}/${frameIndex}: ${cleared.status()}`).toBeTruthy();
      }
    }
  }
}

/** Put one item back to Unassigned, clearing its note and reviewer on the way. */
export async function resetItem(
  request: APIRequestContext,
  clipId: string,
  taskType: string,
): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    const state = await stateOf(request, clipId, taskType);
    if (state === "Unassigned") {
      return;
    }
    if (state === "Done") {
      // The capability is `re_review`; the route spells it `re-review`.
      await postItem(request, clipId, taskType, "re-review");
    } else if (state === "Reviewing") {
      await postItem(request, clipId, taskType, "pass");
    } else if (state === "Submitted") {
      await postItem(request, clipId, taskType, "recall");
    } else if (state === "Labeling") {
      await postItem(request, clipId, taskType, "unassign");
    } else {
      throw new Error(`cannot reset ${clipId}/${taskType} from ${state}`);
    }
  }
  throw new Error(`${clipId}/${taskType} would not settle to Unassigned`);
}

export async function resetItems(
  request: APIRequestContext,
  clips: readonly string[] = E2E_CLIPS,
  taskTypes: readonly string[] = TASK_TYPES,
): Promise<void> {
  for (const clipId of clips) {
    for (const taskType of taskTypes) {
      await resetItem(request, clipId, taskType);
    }
  }
}

export type VocabSeed = {
  phases?: string[];
  class_tags?: string[];
  triples?: [string, string, string][];
};

/** The admin's desk add: write the registry entry and enable it for this Clip. */
export async function enableVocab(
  request: APIRequestContext,
  clipId: string,
  seed: VocabSeed,
): Promise<void> {
  for (const name of seed.phases ?? []) {
    const response = await request.post("/api/vocab/phases", {
      data: { name, clip_id: clipId },
    });
    expect(response.ok(), `enable phase ${name}: ${response.status()}`).toBeTruthy();
  }
  for (const name of seed.class_tags ?? []) {
    const response = await request.post("/api/vocab/class_tags", {
      data: { name, clip_id: clipId },
    });
    expect(response.ok(), `enable class ${name}: ${response.status()}`).toBeTruthy();
  }
  for (const [instrument, verb, target] of seed.triples ?? []) {
    const response = await request.post("/api/vocab/triples", {
      data: { instrument, verb, target, clip_id: clipId },
    });
    expect(response.ok(), `enable triple ${instrument}: ${response.status()}`).toBeTruthy();
  }
}
