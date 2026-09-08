import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test.describe.configure({ mode: "serial" });

const API = "http://127.0.0.1:7881";
// Down-worker sitting: same compose app, SAM predictor failed to load.
const DOWN_API = "http://127.0.0.1:7893";

const here = path.dirname(fileURLToPath(import.meta.url));
const maskRoot = path.join(here, ".work", "mask");

type MemoryPin = { x: number; y: number; positive: boolean };
type SessionState = {
  active: boolean;
  clip_id?: string;
  tracks?: Array<{ track_id: number; label: string; geometric_memory?: MemoryPin[] }>;
};
type FrameMask = { track_id: number; source?: string; counts: number[] };

async function ensureVocab(request: APIRequestContext, base: string, lists: Record<string, string[]>) {
  const vocab = (await (await request.get(`${base}/api/vocab`)).json()) as Record<string, string[]>;
  for (const [listName, names] of Object.entries(lists)) {
    for (const name of names) {
      if ((vocab[listName] ?? []).includes(name)) {
        continue;
      }
      const response = await request.post(`${base}/api/vocab/${listName}`, { data: { name } });
      expect(response.ok()).toBeTruthy();
    }
  }
}

/** Each mask test starts from a fresh sitting: no Session, no Annotation, no vocab frame writes. */
async function resetSitting(request: APIRequestContext) {
  await request.delete(`${API}/api/session`);
  const frameCounts: Record<string, number> = { CLIP_E2E: 2, CLIP_E2E_B: 1 };
  for (const [clipId, count] of Object.entries(frameCounts)) {
    rmSync(path.join(maskRoot, clipId), { recursive: true, force: true });
    for (let index = 0; index < count; index += 1) {
      await request.put(`${API}/api/phase/${clipId}/frames/${index}`, { data: { phase: null } });
      await request.put(`${API}/api/class/${clipId}/frames/${index}`, { data: { tags: [] } });
    }
    const doc = (await (await request.get(`${API}/api/triplet/${clipId}`)).json()) as {
      frames?: Record<string, Array<{ id: number }>>;
    };
    for (const [index, rows] of Object.entries(doc.frames ?? {})) {
      for (const row of rows) {
        await request.delete(`${API}/api/triplet/${clipId}/frames/${index}/${row.id}`);
      }
    }
  }
}

test.beforeEach(async ({ request }) => {
  await ensureVocab(request, API, { phases: ["Preparation", "Clipping and cutting"], class_tags: ["grasper", "hook"] });
  await resetSitting(request);
});

async function videoReady(page: Page) {
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(() =>
    page.locator("video").evaluate((el) => (el as HTMLVideoElement).readyState),
  ).toBeGreaterThanOrEqual(1);
}

async function scrubToFrame(page: Page, index: number) {
  await page.locator("video").evaluate((el, seconds) => {
    (el as HTMLVideoElement).currentTime = seconds;
  }, index / 25);
}

/** Displayed image rect (page coords) — the overlay maps clicks through it, letterbox included. */
async function imageRect(page: Page) {
  const box = await page.locator("[data-mask-overlay]").boundingBox();
  const media = await page.locator("video").evaluate((el) => ({
    width: (el as HTMLVideoElement).videoWidth,
    height: (el as HTMLVideoElement).videoHeight,
  }));
  if (!box || media.width <= 0 || media.height <= 0) {
    return null;
  }
  const scale = Math.min(box.width / media.width, box.height / media.height);
  const width = media.width * scale;
  const height = media.height * scale;
  return {
    box,
    rect: {
      left: box.x + (box.width - width) / 2,
      top: box.y + (box.height - height) / 2,
      width,
      height,
    },
  };
}

async function toPagePoint(page: Page, rx: number, ry: number) {
  const layout = await imageRect(page);
  if (!layout) {
    throw new Error("overlay or media not ready");
  }
  return {
    x: layout.rect.left + rx * layout.rect.width,
    y: layout.rect.top + ry * layout.rect.height,
    layout,
  };
}

async function clickAt(page: Page, rx: number, ry: number, options?: { button?: "left" | "right" }) {
  const point = await toPagePoint(page, rx, ry);
  await page.mouse.click(point.x, point.y, options);
}

async function dragStroke(page: Page, from: [number, number], to: [number, number]) {
  const a = await toPagePoint(page, from[0], from[1]);
  const b = await toPagePoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

/** One pixel of the overlay canvas at a relative image point (device px). */
async function overlayPixel(page: Page, rx: number, ry: number) {
  const point = await toPagePoint(page, rx, ry);
  return page.locator("[data-mask-overlay]").evaluate(
    (el, args) => {
      const canvas = el as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("overlay has no 2d context");
      }
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round((args.x - args.box.x) * dpr);
      const y = Math.round((args.y - args.box.y) * dpr);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    { x: point.x, y: point.y, box: point.layout.box },
  );
}

function trackPredicts(page: Page) {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/session/predict") && request.method() === "POST") {
      urls.push(request.url());
    }
  });
  return urls;
}

async function sessionState(request: APIRequestContext, frameIndex?: number): Promise<SessionState> {
  const url = frameIndex == null ? `${API}/api/session` : `${API}/api/session?frame_index=${frameIndex}`;
  return (await (await request.get(url)).json()) as SessionState;
}

async function frameAnnotation(request: APIRequestContext, clipId: string, index: number) {
  const response = await request.get(`${API}/api/clips/${clipId}/annotations/frames/${index}`);
  if (response.status() === 404) {
    return null;
  }
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { masks: FrameMask[] };
}

function trackRow(page: Page, label: string): Locator {
  return page.getByRole("list", { name: "Track list" }).getByRole("button", { name: label, exact: true });
}

async function pickLibraryName(page: Page, kind: "phase" | "class", name: string) {
  await page.getByRole("tab", { name: kind }).click();
  const row = page.getByRole("list", { name: "Library" }).getByRole("button", { name, exact: true });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
}

test("point → silhouette + Track row; picture click never plays; Space does", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);

  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  await expect
    .poll(async () => (await overlayPixel(page, 0.5, 0.5)).a)
    .toBeGreaterThan(0);
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  await expect(page.locator("video")).toHaveJSProperty("paused", true);

  const state = await sessionState(request);
  expect(state.active).toBe(true);
  const annotation = await frameAnnotation(request, "CLIP_E2E", 0);
  expect(annotation?.masks).toHaveLength(1);
  expect(annotation?.masks[0].source).toBe("manual");

  // Track list stays on the rail while the vocab editor shows class.
  await page.getByRole("tab", { name: "class" }).click();
  await expect(trackRow(page, "track-1")).toBeVisible();

  await page.keyboard.press("Space");
  await expect(page.getByText("Frame 1 of 2")).toBeVisible({ timeout: 5_000 });
});

test("reload shows the silhouette from disk with no Save control", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();

  const countsBefore = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;
  expect(countsBefore?.length).toBeGreaterThan(0);

  await page.reload();
  await videoReady(page);
  await expect
    .poll(async () => (await overlayPixel(page, 0.5, 0.5)).a)
    .toBeGreaterThan(0);
  const countsAfter = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;
  expect(countsAfter).toEqual(countsBefore);
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
});

test("leftover pin is visible, a click on it deletes only the pin", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.4, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  await clickAt(page, 0.62, 0.5);
  await expect
    .poll(async () => (await sessionState(request, 0)).tracks?.[0].geometric_memory?.length)
    .toBe(2);

  const countsBefore = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;
  await expect.poll(async () => (await overlayPixel(page, 0.4, 0.5)).a).toBe(255);

  await clickAt(page, 0.4, 0.5);
  // The delete round-trips before the Session reflects it; poll the result.
  await expect
    .poll(async () => (await sessionState(request, 0)).tracks?.[0].geometric_memory ?? [])
    .toHaveLength(1);
  const memory = (await sessionState(request, 0)).tracks?.[0].geometric_memory ?? [];
  expect(memory[0].x).toBeCloseTo(0.62, 2);
  await expect.poll(async () => (await overlayPixel(page, 0.4, 0.5)).a).toBe(120);
  const countsAfter = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;
  expect(countsAfter).toEqual(countsBefore);
});

test("Active Track comes from the rail only; a picture click refines it", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();

  await page.getByRole("button", { name: "New Track" }).click();
  await clickAt(page, 0.2, 0.2);
  await expect(trackRow(page, "track-2")).toBeVisible();
  await expect(trackRow(page, "track-2")).toHaveAttribute("aria-pressed", "true");

  let predicted = page.waitForRequest(
    (r) => r.url().includes("/api/session/predict") && r.method() === "POST",
  );
  await clickAt(page, 0.75, 0.75);
  expect(((await predicted).postDataJSON() as { track_id?: number }).track_id).toBe(2);
  await expect(trackRow(page, "track-2")).toHaveAttribute("aria-pressed", "true");

  await trackRow(page, "track-1").click();
  await expect(trackRow(page, "track-1")).toHaveAttribute("aria-pressed", "true");
  predicted = page.waitForRequest(
    (r) => r.url().includes("/api/session/predict") && r.method() === "POST",
  );
  await clickAt(page, 0.8, 0.2);
  expect(((await predicted).postDataJSON() as { track_id?: number }).track_id).toBe(1);
  await expect(trackRow(page, "track-1")).toHaveAttribute("aria-pressed", "true");
  const state = await sessionState(request, 0);
  expect(state.tracks).toHaveLength(2);
});

test("drag is a Scribble stroke that creates a Track; right-click never opens the menu", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  const prevented = await page.locator("[data-mask-overlay]").evaluate((el) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);

  // Negative click alone must not create a Track; the desk says why.
  await clickAt(page, 0.5, 0.5, { button: "right" });
  await expect(page.getByRole("alert")).toContainText(/positive point or stroke/i, { timeout: 5_000 });
  await expect(trackRow(page, "track-1")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await dragStroke(page, [0.35, 0.35], [0.65, 0.35]);
  await expect(trackRow(page, "track-1")).toBeVisible();
  await expect
    .poll(async () => (await overlayPixel(page, 0.5, 0.35)).a)
    .toBeGreaterThan(0);
  const state = await sessionState(request, 0);
  expect(state.tracks).toHaveLength(1);
});

test("Undo (keyboard and rail) restores this Frame; there is no Save", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.4, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  const countsOne = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;

  await clickAt(page, 0.62, 0.5);
  await expect
    .poll(async () => (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts)
    .not.toEqual(countsOne);

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts)
    .toEqual(countsOne);
  await expect
    .poll(async () => (await sessionState(request, 0)).tracks?.[0].geometric_memory?.length)
    .toBe(1);
  await expect.poll(async () => (await overlayPixel(page, 0.62, 0.5)).a).toBe(0);

  await clickAt(page, 0.3, 0.75);
  await expect
    .poll(async () => (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts)
    .not.toEqual(countsOne);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts)
    .toEqual(countsOne);
  await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
});

test("short forward Propagate fills the neighbor Frame; the seed stays manual", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  const seedCounts = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;

  await page.getByRole("button", { name: "Propagate" }).click();
  await expect(page.getByText("Propagate complete: 1 of 1 Frames filled")).toBeVisible({ timeout: 10_000 });

  const filled = await frameAnnotation(request, "CLIP_E2E", 1);
  expect(filled?.masks).toHaveLength(1);
  expect(filled?.masks[0].source).toBe("propagated");
  const seed = await frameAnnotation(request, "CLIP_E2E", 0);
  expect(seed?.masks[0].source).toBe("manual");
  expect(seed?.masks[0].counts).toEqual(seedCounts);

  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect
    .poll(async () => (await overlayPixel(page, 0.5, 0.5)).a)
    .toBeGreaterThan(0);
});

test("scrubbing drops pending marks: no Predict, no extra Track", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  const predicts = trackPredicts(page);

  await clickAt(page, 0.5, 0.5);
  await expect.poll(async () => (await overlayPixel(page, 0.5, 0.5)).a).toBe(255);
  await scrubToFrame(page, 1);
  await page.waitForTimeout(1_300);

  expect(predicts).toHaveLength(0);
  expect((await sessionState(request)).active).toBe(false);
  await expect(page.getByText("No Tracks")).toBeVisible();

  await scrubToFrame(page, 0);
  await expect.poll(async () => (await overlayPixel(page, 0.5, 0.5)).a).toBe(0);
});

test("changing Clip closes the Session; the old Clip's Annotation is still GET-able", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  expect((await sessionState(request)).active).toBe(true);

  await page.locator('a[href="/clips/CLIP_E2E_B"]').click();
  await expect(page).toHaveURL(/\/clips\/CLIP_E2E_B$/);
  await videoReady(page);
  await expect.poll(async () => (await sessionState(request)).active).toBe(false);

  const previous = await frameAnnotation(request, "CLIP_E2E", 0);
  expect(previous?.masks).toHaveLength(1);
  await expect.poll(async () => (await overlayPixel(page, 0.5, 0.5)).a).toBe(0);
});

test("mixed sitting: phase span then a point — each store keeps only its own kind", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  await pickLibraryName(page, "phase", "Preparation");
  await expect
    .poll(async () => (await (await request.get(`${API}/api/phase/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": "Preparation" });
  await expect.poll(async () => (await sessionState(request)).active).toBe(false);

  // Mark from needs a Brush (dev1); Library name only toggles this Frame.
  await page
    .getByRole("list", { name: "Library" })
    .locator("li")
    .filter({ hasText: "Preparation" })
    .getByRole("button", { name: "Brush", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect
    .poll(async () => (await (await request.get(`${API}/api/phase/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": "Preparation", "1": "Preparation" });

  await scrubToFrame(page, 0);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();

  const phase = (await (await request.get(`${API}/api/phase/CLIP_E2E`)).json()).frames;
  expect(phase).toMatchObject({ "0": "Preparation", "1": "Preparation" });
  const classDoc = (await (await request.get(`${API}/api/class/CLIP_E2E`)).json()).frames;
  expect(Object.keys(classDoc ?? {})).toHaveLength(0);
  const tripletDoc = (await (await request.get(`${API}/api/triplet/CLIP_E2E`)).json()).frames;
  expect(Object.keys(tripletDoc ?? {})).toHaveLength(0);

  const frame0 = await frameAnnotation(request, "CLIP_E2E", 0);
  expect(frame0?.masks).toHaveLength(1);
  const frame1 = await frameAnnotation(request, "CLIP_E2E", 1);
  expect(frame1?.masks ?? []).toHaveLength(0);
  expect((await sessionState(request, 0)).tracks).toHaveLength(1);

  // And the way back: a vocab write never touches the mask store.
  const countsBefore = frame0?.masks[0].counts;
  await pickLibraryName(page, "class", "grasper");
  await expect
    .poll(async () => (await (await request.get(`${API}/api/class/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": ["grasper"] });
  const countsAfter = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].counts;
  expect(countsAfter).toEqual(countsBefore);
});

test("worker-down sitting still edits phase, class, and triplet", async ({ page, request }) => {
  // This test sits on the :7893 process, whose SAM worker failed to load.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${DOWN_API}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });

  const health = (await (await request.get(`${DOWN_API}/api/health`)).json()) as {
    worker: { ready: boolean; message: string };
  };
  expect(health.worker.ready).toBe(false);
  // The down sitting has its own labels root, so its vocab starts empty.
  // Seed before the page loads: SWR caches the first vocab read.
  await ensureVocab(request, DOWN_API, { phases: ["Preparation"], class_tags: ["grasper"] });

  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  await pickLibraryName(page, "phase", "Preparation");
  await expect
    .poll(async () => (await (await request.get(`${DOWN_API}/api/phase/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": "Preparation" });
  await pickLibraryName(page, "class", "grasper");
  await expect
    .poll(async () => (await (await request.get(`${DOWN_API}/api/class/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": ["grasper"] });
  await page.getByRole("tab", { name: "triplet" }).click();
  await page.getByRole("combobox", { name: "instrument" }).fill("DownTool");
  await page.getByRole("combobox", { name: "verb" }).fill("grasp");
  await page.getByRole("combobox", { name: "target" }).fill("gallbladder");
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const row = page
    .getByRole("table", { name: "Library" })
    .getByRole("button", { name: "DownTool / grasp / gallbladder", exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect
    .poll(async () => (await (await request.get(`${DOWN_API}/api/triplet/CLIP_E2E`)).json()).frames)
    .toMatchObject({ "0": [{ instrument: "DownTool" }] });

  // The mask Predict fails with the worker's message and opens no Session.
  await clickAt(page, 0.5, 0.5);
  await expect(page.getByRole("alert")).toContainText(/SAM 3.1 load failed|not ready/i, { timeout: 5_000 });
  expect((await (await request.get(`${DOWN_API}/api/session`)).json()).active).toBe(false);
  await expect(trackRow(page, "track-1")).toHaveCount(0);

  // The vocab writes from before the failed Predict are all still on disk.
  const phase = (await (await request.get(`${DOWN_API}/api/phase/CLIP_E2E`)).json()).frames;
  expect(phase).toMatchObject({ "0": "Preparation" });
  const classDoc = (await (await request.get(`${DOWN_API}/api/class/CLIP_E2E`)).json()).frames;
  expect(classDoc).toMatchObject({ "0": ["grasper"] });
  const tripletDoc = (await (await request.get(`${DOWN_API}/api/triplet/CLIP_E2E`)).json()).frames;
  expect(tripletDoc).toMatchObject({ "0": [{ instrument: "DownTool" }] });
});

// --- Closeout for tickets 08–10 (run once here, ticket 10) ---

function trackStateBadge(page: Page, state: string): Locator {
  return page.getByRole("list", { name: "Track list" }).locator(`[data-track-state="${state}"]`);
}

test("leftover pins stay on their Frame: hidden after scrub, back on return", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.4, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  await clickAt(page, 0.62, 0.5);
  await expect
    .poll(async () => (await sessionState(request, 0)).tracks?.[0].geometric_memory?.length)
    .toBe(2);
  await expect.poll(async () => (await overlayPixel(page, 0.62, 0.5)).a).toBe(255);

  // Frame 1: no pins render, and the rail reads the frame-scoped state.
  await scrubToFrame(page, 1);
  await expect(trackStateBadge(page, "empty")).toBeVisible();
  await expect.poll(async () => (await overlayPixel(page, 0.62, 0.5)).a).toBe(0);
  expect((await sessionState(request, 1)).tracks?.[0].geometric_memory ?? []).toHaveLength(0);

  await scrubToFrame(page, 0);
  await expect.poll(async () => (await overlayPixel(page, 0.62, 0.5)).a).toBe(255);
});

test("Track rail shows per-Track state: manual, refined, empty, propagated", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  const manual = trackStateBadge(page, "manual");
  await expect(manual).toBeVisible();
  await expect(manual).toHaveAttribute("data-protected", "true");
  await expect(manual).toContainText("manual");

  // A second Predict with the prior on this Track-on-Frame refines it.
  await clickAt(page, 0.62, 0.5);
  await expect(trackStateBadge(page, "refined")).toBeVisible();
  expect((await frameAnnotation(request, "CLIP_E2E", 0))?.masks[0].source).toBe("refined");

  await scrubToFrame(page, 1);
  await expect(trackStateBadge(page, "empty")).toBeVisible();
  await scrubToFrame(page, 0);

  await page.getByRole("button", { name: "Propagate" }).click();
  await expect(page.getByText("Propagate complete: 1 of 1 Frames filled")).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => (await frameAnnotation(request, "CLIP_E2E", 1))?.masks[0]?.source)
    .toBe("propagated");

  // The filled neighbor reads propagated and not Protected.
  await scrubToFrame(page, 1);
  const propagated = trackStateBadge(page, "propagated");
  await expect(propagated).toBeVisible({ timeout: 10_000 });
  await expect(propagated).not.toHaveAttribute("data-protected", "true");
  expect((await frameAnnotation(request, "CLIP_E2E", 1))?.masks[0].source).toBe("propagated");

  // The seed Frame kept its refined (Protected) Source.
  await scrubToFrame(page, 0);
  await expect(trackStateBadge(page, "refined")).toBeVisible();
});

test("a Scribble stroke shows the handoff provenance next to the state", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  await dragStroke(page, [0.35, 0.35], [0.65, 0.35]);
  await expect(trackRow(page, "track-1")).toBeVisible();
  const badge = trackStateBadge(page, "manual");
  await expect(badge).toContainText("manual");
  await expect(badge).toContainText("handoff");
  const masks = (await frameAnnotation(request, "CLIP_E2E", 0))?.masks ?? [];
  expect(masks[0]?.model_provenance?.mask_handoff).toBe(true);
  await expect(badge).toHaveAttribute("data-protected", "true");
});

test("Propagate leaves a Protected slot and the desk says kept", async ({ page, request }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);

  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();
  await page.getByRole("button", { name: "Propagate" }).click();
  await expect(page.getByText("Propagate complete: 1 of 1 Frames filled")).toBeVisible({ timeout: 10_000 });

  // Refine the filled Frame: refined is Protected, so a re-run must skip it.
  await scrubToFrame(page, 1);
  await clickAt(page, 0.3, 0.3);
  await expect(trackStateBadge(page, "refined")).toBeVisible();

  await scrubToFrame(page, 0);
  await page.getByRole("button", { name: "Propagate" }).click();
  await expect(page.getByText("Propagate complete: 1 of 1 Frames filled")).toBeVisible({ timeout: 10_000 });

  // The seed Frame is not a Job target: manual without a kept marker.
  const seed = trackStateBadge(page, "manual");
  await expect(seed).toBeVisible();
  await expect(seed).not.toHaveAttribute("data-kept", "true");

  await scrubToFrame(page, 1);
  const kept = page.getByRole("list", { name: "Track list" }).locator('[data-kept="true"]');
  await expect(kept).toBeVisible();
  await expect(kept).toHaveAttribute("data-track-state", "refined");
  expect((await frameAnnotation(request, "CLIP_E2E", 1))?.masks[0].source).toBe("refined");
});

test("footer shows the SAM loading state while the worker loads, then clears", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        service: "endo_label",
        version: "test",
        worker: { ready: false, status: "loading", message: "Loading SAM 3.1 checkpoint" },
      }),
    });
  });
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await expect(page.getByText("Loading SAM model…")).toBeVisible();

  // Once health stops saying loading, the footer state clears on the next poll.
  await page.unroute("**/api/health");
  await expect(page.getByText("Loading SAM model…")).toBeHidden({ timeout: 8_000 });
});

test("rail shows the indeterminate Propagating line while the Job runs", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await videoReady(page);
  await clickAt(page, 0.5, 0.5);
  await expect(trackRow(page, "track-1")).toBeVisible();

  // Hold the first status poll so the running state stays observable.
  await page.route("**/api/jobs/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  await page.getByRole("button", { name: "Propagate" }).click();
  const running = page.locator("[data-propagate-progress]");
  await expect(running).toContainText("Propagating…");
  await expect(running).toContainText("from Frame 0");
  await expect(page.getByText("Propagate complete: 1 of 1 Frames filled")).toBeVisible({ timeout: 15_000 });
  await expect(running).toHaveCount(0);
});
