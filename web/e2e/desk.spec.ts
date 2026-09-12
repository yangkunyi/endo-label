import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";
import { E2E_USER, loginApi } from "./auth";
import { clearLabels, ensureLabelingFor } from "./harness";

test.describe.configure({ mode: "serial" });

async function ensureVocab(request: APIRequestContext, lists: Record<string, string[]>) {
  const vocab = (await (await request.get("/api/vocab")).json()) as Record<string, string[]>;
  for (const [listName, names] of Object.entries(lists)) {
    for (const name of names) {
      if ((vocab[listName] ?? []).includes(name)) {
        continue;
      }
      const response = await request.post(`/api/vocab/${listName}`, { data: { name } });
      expect(response.ok()).toBeTruthy();
      (vocab[listName] ??= []).push(name);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await loginApi(page.request);
  // Label writes need the Account to hold the (Clip, Task type) item: every item
  // the desk touches is Labeling for the spec Account.
  await ensureLabelingFor(page.request, E2E_USER);
  // Serial specs share one sitting: strip the labels a previous test left, so a
  // retired word from an earlier test cannot make this Frame unwritable.
  await clearLabels(page.request);
  await ensureVocab(page.request, {
    phases: ["Preparation", "Clipping and cutting"],
    class_tags: ["grasper", "hook", "clipper", "scissors", "blurred"],
  });
});

async function scrubToFrame(page: Page, index: number) {
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  await expect.poll(async () =>
    video.evaluate((el, seconds) => {
      const v = el as HTMLVideoElement;
      if (v.readyState < 1) {
        return "not-ready";
      }
      v.currentTime = seconds;
      return "ok";
    }, index / 25),
  ).toBe("ok");
}

async function clipFrames(page: Page, kind: "phase" | "class" | "triplet", clipId = "CLIP_E2E") {
  const response = await page.request.get(`/api/${kind}/${clipId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).frames as Record<string, unknown>;
}

async function cssBackground(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** media-chrome is removed from the desk: no media-* custom element may render. */
async function expectNoMediaChrome(page: Page) {
  const count = await page.evaluate(
    () => Array.from(document.querySelectorAll("*")).filter((el) => el.tagName.toLowerCase().startsWith("media-")).length,
  );
  expect(count).toBe(0);
}

/** Pixel probe on the playing surface (ADR 0022 reproduction pattern): share of pixels that are not black. */
async function nonBlackRatio(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement) || video.readyState < 2) {
      return -1;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return -1;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 60) {
        nonBlack += 1;
      }
    }
    return nonBlack / (data.length / 4);
  });
}

async function expectSurfaceOpaque(page: Page) {
  const opacities = await page.evaluate(() => {
    const surface = document.querySelector('section[aria-label="Player"]');
    return [surface, surface?.querySelector(":scope > div"), surface?.querySelector("video")].map((el) =>
      el instanceof Element ? getComputedStyle(el).opacity : "missing",
    );
  });
  expect(opacities).toEqual(["1", "1", "1"]);
}

async function focusTask(page: Page, kind: "class" | "phase" | "triplet") {
  await page.getByRole("tab", { name: kind }).click();
}

async function addVocabOnly(page: Page, kind: string, name: string) {
  const box = page.getByRole("textbox", { name: `Add ${kind} name` });
  await box.fill(name);
  await box.press("Enter");
}

async function pickName(page: Page, ariaLabel: "class" | "phase", name: string) {
  await focusTask(page, ariaLabel);
  const list = page.getByRole("list", { name: "Library" });
  if (await list.getByRole("button", { name, exact: true }).count() === 0) {
    await addVocabOnly(page, ariaLabel, name);
  }
  const row = list.getByRole("button", { name, exact: true });
  const wasOn = await row.getAttribute("aria-pressed");
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", wasOn === "true" ? "false" : "true");
}

async function fillTriplet(page: Page, instrument: string, verb: string, target: string) {
  await focusTask(page, "triplet");
  const library = page.getByRole("table", { name: "Library" });
  const name = `${instrument} / ${verb} / ${target}`;
  const row = library.getByRole("button", { name, exact: true });
  if ((await row.count()) === 0) {
    await page.getByRole("combobox", { name: "instrument" }).fill(instrument);
    await page.getByRole("combobox", { name: "verb" }).fill(verb);
    await page.getByRole("combobox", { name: "target" }).fill(target);
    await page.getByRole("button", { name: "Add triplet row" }).click();
    await expect(row).toBeVisible();
  }
  const wasOn = await row.getAttribute("aria-pressed");
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", wasOn === "true" ? "false" : "true");
}

async function clearClipLabels(page: Page, clipId = "CLIP_E2E") {
  for (const index of [0, 1]) {
    await page.request.put(`/api/phase/${clipId}/frames/${index}`, { data: { phase: null } });
    await page.request.put(`/api/class/${clipId}/frames/${index}`, { data: { tags: [] } });
  }
  const tripletDoc = (await (await page.request.get(`/api/triplet/${clipId}`)).json()) as {
    frames?: Record<string, { id: number }[]>;
  };
  for (const [index, rows] of Object.entries(tripletDoc.frames ?? {})) {
    for (const row of rows) {
      await page.request.delete(`/api/triplet/${clipId}/frames/${index}/${row.id}`);
    }
  }
}

function libraryRow(page: Page, name: string) {
  return page.getByRole("list", { name: "Library" }).locator("li").filter({ hasText: name });
}

/** Toggle the Brush membership of a class/phase identity; adds the Vocab name if missing. Never writes a Frame. */
async function setBrush(page: Page, kind: "class" | "phase", name: string) {
  await focusTask(page, kind);
  const list = page.getByRole("list", { name: "Library" });
  if ((await list.getByRole("button", { name, exact: true }).count()) === 0) {
    await addVocabOnly(page, kind, name);
  }
  const button = libraryRow(page, name).getByRole("button", { name: "Brush", exact: true });
  const pressed = await button.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function seedClassTags(
  request: APIRequestContext,
  frames: Record<number, string[]>,
  clipId = "CLIP_E2E",
) {
  for (const [index, tags] of Object.entries(frames)) {
    const response = await request.put(`/api/class/${clipId}/frames/${index}`, { data: { tags } });
    expect(response.ok()).toBeTruthy();
  }
}

async function expectClassFrames(page: Page, expected: unknown, clipId = "CLIP_E2E") {
  await expect.poll(async () => await clipFrames(page, "class", clipId)).toEqual(expected);
}

test("root and Clip routes share one workbench shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose a Clip" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Clips" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "class" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "triplet" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "phase" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("img")).toHaveCount(0);

  await page.locator('a[href="/clips/CLIP_E2E"]').click();
  await expect(page).toHaveURL(/\/clips\/CLIP_E2E$/);
  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  await expect(page.locator("video[aria-label='Frame 0']")).toBeVisible();
});

test("Clip rail has counts, player seeks, and no Frame filmstrip", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const rail = page.getByRole("navigation", { name: "Clips" });
  await expect(rail.getByRole("link", { name: "CLIP_E2E 2 Frames" })).toBeVisible();
  await expect(rail.getByRole("button")).toHaveCount(0);
  await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);

  const jpeg = page.locator("video[aria-label='Frame 0']");
  await expect(jpeg).toBeVisible();
  expect(await jpeg.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");

  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("Pick+Create writes this Frame and there are no HeroUI tables", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByText("Write to span")).toHaveCount(0);

  await pickName(page, "class", "grasper");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("grasper");
  await expect(page.getByRole("button", { name: "Turn off grasper" })).toHaveCount(0);

  await pickName(page, "phase", "Preparation");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("Preparation");

  await fillTriplet(page, "grasper", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "grasper");
  }).toBe(true);
});

test("Now is read-only; Library writes this Frame", async ({ page }) => {
  await page.request.put("/api/class/CLIP_E2E/frames/0", { data: { tags: [] } });
  await page.request.put("/api/phase/CLIP_E2E/frames/0", { data: { phase: null } });
  const tripletDoc = (await (await page.request.get("/api/triplet/CLIP_E2E")).json()) as {
    frames?: Record<string, { id: number }[]>;
  };
  for (const row of tripletDoc.frames?.["0"] ?? []) {
    await page.request.delete(`/api/triplet/CLIP_E2E/frames/0/${row.id}`);
  }
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "class", "grasper");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("grasper");
  await expect(page.getByRole("button", { name: /Turn off / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete row / })).toHaveCount(0);
  await page.locator('[data-editor-card="class"] [data-now]').getByText("grasper", { exact: true }).click();
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("grasper");
  await pickName(page, "class", "grasper");
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("grasper")).toBe(false);

  await pickName(page, "phase", "Preparation");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("Preparation");
  await page.locator('[data-editor-card="phase"] [data-now]').click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("Preparation");
  await pickName(page, "phase", "Preparation");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBeUndefined();

  await fillTriplet(page, "grasper", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "grasper");
  }).toBe(true);
  await expect(page.getByRole("button", { name: /Delete row / })).toHaveCount(0);
  await fillTriplet(page, "grasper", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "grasper");
  }).toBe(false);
});

test("Library selected toggles this Frame; Plus does not write; trash confirms; List gone", async ({ page }) => {
  await page.request.put("/api/phase/CLIP_E2E/frames/0", { data: { phase: null } });
  await page.request.put("/api/class/CLIP_E2E/frames/0", { data: { tags: [] } });
  await page.goto("/clips/CLIP_E2E");

  await focusTask(page, "phase");
  await expect(page.locator('[data-editor-card="phase"]').getByRole("button", { name: "List" })).toHaveCount(0);
  const phaseBefore = await clipFrames(page, "phase");
  await addVocabOnly(page, "phase", "LibToggleP");
  await expect.poll(async () => {
    const vocab = await (await page.request.get("/api/vocab")).json();
    return (vocab.phases as string[]).includes("LibToggleP");
  }).toBe(true);
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual(phaseBefore);
  const phaseLib = page.getByRole("list", { name: "Library" });
  const phaseRow = phaseLib.getByRole("button", { name: "LibToggleP", exact: true });
  await expect(phaseRow).toHaveAttribute("aria-pressed", "false");
  await phaseRow.click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("LibToggleP");
  await expect(phaseRow).toHaveAttribute("aria-pressed", "true");
  await phaseRow.click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBeUndefined();
  await expect(phaseRow).toHaveAttribute("aria-pressed", "false");

  await phaseRow.click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("LibToggleP");
  page.once("dialog", (dialog) => dialog.dismiss());
  await phaseLib.getByRole("button", { name: "Delete phase LibToggleP" }).click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("LibToggleP");
  page.once("dialog", (dialog) => dialog.accept());
  await phaseLib.getByRole("button", { name: "Delete phase LibToggleP" }).click();
  // Retiring a name leaves the labels that already carry it alone (ticket 17):
  // the row goes, this Frame keeps its Phase.
  await expect(phaseRow).toHaveCount(0);
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("LibToggleP");

  await focusTask(page, "class");
  await expect(page.locator('[data-editor-card="class"]').getByRole("button", { name: "List" })).toHaveCount(0);
  const classBefore = await clipFrames(page, "class");
  await addVocabOnly(page, "class", "LibToggleC");
  await expect.poll(async () => {
    const vocab = await (await page.request.get("/api/vocab")).json();
    return (vocab.class_tags as string[]).includes("LibToggleC");
  }).toBe(true);
  await expect.poll(async () => await clipFrames(page, "class")).toEqual(classBefore);
  const classLib = page.getByRole("list", { name: "Library" });
  const classRow = classLib.getByRole("button", { name: "LibToggleC", exact: true });
  await expect(classRow).toHaveAttribute("aria-pressed", "false");
  await classRow.click();
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("LibToggleC");
  await expect(classRow).toHaveAttribute("aria-pressed", "true");
  await classRow.click();
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("LibToggleC")).toBe(false);
  await expect(classRow).toHaveAttribute("aria-pressed", "false");

  await classRow.click();
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("LibToggleC");
  page.once("dialog", (dialog) => dialog.dismiss());
  await classLib.getByRole("button", { name: "Delete class tag LibToggleC" }).click();
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("LibToggleC");
  page.once("dialog", (dialog) => dialog.accept());
  await classLib.getByRole("button", { name: "Delete class tag LibToggleC" }).click();
  // Same for a class tag: archived, not rewritten out of the labels.
  await expect(classRow).toHaveCount(0);
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("LibToggleC");
});

test("class re-pick toggles off; phase re-pick clears; triplet same triple toggles", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "class", "hook");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("hook");
  await pickName(page, "class", "hook");
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("hook")).toBe(false);

  await pickName(page, "class", "blurred");
  await pickName(page, "class", "blurred");
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("blurred")).toBe(false);

  await pickName(page, "phase", "Clipping and cutting");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("Clipping and cutting");
  await pickName(page, "phase", "Clipping and cutting");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBeUndefined();

  await fillTriplet(page, "hook", "cut", "cystic-duct");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (frames["0"] ?? []).some(
      (row) => row.instrument === "hook" && row.verb === "cut" && row.target === "cystic-duct",
    );
  }).toBe(true);
  await fillTriplet(page, "hook", "cut", "cystic-duct");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (frames["0"] ?? []).some(
      (row) => row.instrument === "hook" && row.verb === "cut" && row.target === "cystic-duct",
    );
  }).toBe(false);
});

test("empty add-name placeholder is Type to add", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "class");
  await expect(page.getByRole("textbox", { name: "Add class name" })).toHaveAttribute("placeholder", "Type to add");
  await focusTask(page, "phase");
  await expect(page.getByRole("textbox", { name: "Add phase name" })).toHaveAttribute("placeholder", "Type to add");
  await focusTask(page, "triplet");
  await expect(page.getByRole("combobox", { name: "instrument" })).toHaveAttribute("placeholder", "instrument");
  await expect(page.getByRole("combobox", { name: "verb" })).toHaveAttribute("placeholder", "verb");
  await expect(page.getByRole("combobox", { name: "target" })).toHaveAttribute("placeholder", "target");
});

test("playback advances without looping from the hand-built transport", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("video[aria-label='Frame 0']")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((el) => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.locator("select")).toHaveCount(0);
  const transport = page.getByRole("toolbar", { name: "Transport" });
  await expect(transport).toBeVisible();
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Playback rate" })).toBeVisible();
  await expect(page.locator("[data-transport-time]")).toHaveText("0:00 / 0:00");
  await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Ruler" })).toBeVisible();
  await expectNoMediaChrome(page);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("rate menu opens a list including 0.25 and applies the choice on jpeg and video Clips", async ({ page }) => {
  for (const path of ["/clips/CLIP_E2E", "/clips/CLIP_VID"]) {
    await page.goto(path);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
    expect(await video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1);
    const rate = page.getByRole("button", { name: "Playback rate" });
    await expect(rate).toBeVisible();
    await rate.click();
    // a list, not a cycle: opening the menu never changes the rate
    expect(await video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1);
    const menu = page.getByRole("menu", { name: "Playback rate" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "0.25×" })).toHaveAttribute("aria-checked", "false");
    await expect(menu.getByRole("menuitemradio", { name: "0.5×" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "1×" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitemradio", { name: "1.5×" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "2×" })).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "0.25×" }).click();
    await expect(menu).toHaveCount(0);
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(0.25);
    await expect(rate).toHaveText("0.25×");
  }
});

test("jpeg player shows the hand-built transport and Frame print", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("region", { name: "Player" })).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  const transport = page.getByRole("toolbar", { name: "Transport" });
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Playback rate" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Mute" })).toBeVisible();
  await expect(transport.getByRole("slider", { name: "Volume" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Fullscreen" })).toBeVisible();
  await expect(page.locator("[data-transport-time]")).toHaveText("0:00 / 0:00");
  await expectNoMediaChrome(page);
  await expect(page.getByLabel("Player controls").getByText("Frame 0 of 2")).toBeVisible();
  // transport row sits directly under the Ruler and above the Lane well, in the player column
  const playerBox = await page.getByRole("region", { name: "Player", exact: true }).boundingBox();
  const rulerBox = await page.getByRole("slider", { name: "Ruler" }).boundingBox();
  const transportBox = await transport.boundingBox();
  const wellBox = await page.getByRole("region", { name: "Lane well" }).boundingBox();
  expect(playerBox && rulerBox && transportBox && wellBox).toBeTruthy();
  expect(transportBox!.y).toBeGreaterThanOrEqual(rulerBox!.y + rulerBox!.height - 1);
  expect(wellBox!.y).toBeGreaterThanOrEqual(transportBox!.y + transportBox!.height - 1);
  expect(transportBox!.x).toBeGreaterThanOrEqual(playerBox!.x - 2);
  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("fresh open shows the first frame with no hover; the player surface never fades", async ({ page }) => {
  await page.goto("/clips/CLIP_VID");
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect(page.locator("[data-transport-time]")).toHaveText("0:00 / 0:04");
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  // no mouse movement: give the old ~1s autohide fade (ADR 0022) its window, then probe
  await page.waitForTimeout(1200);
  await expectSurfaceOpaque(page);
  await expect.poll(async () => await nonBlackRatio(page)).toBeGreaterThan(0.9);
});

test("playing with the mouse away keeps the picture fully visible", async ({ page }) => {
  await page.goto("/clips/CLIP_VID");
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await page.mouse.move(2, 2);
  // old autohide faded the whole controller within ~1s of mouse-out (ADR 0022)
  await page.waitForTimeout(1200);
  await expectSurfaceOpaque(page);
  await expect.poll(async () => await nonBlackRatio(page)).toBeGreaterThan(0.9);
  // time display follows timeupdate while the picture stays up
  await expect(page.locator("[data-transport-time]")).not.toHaveText("0:00 / 0:04");
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
});

test("mute, volume, and fullscreen drive the native video element and Fullscreen API", async ({ page }) => {
  await page.goto("/clips/CLIP_VID");
  const video = page.locator("video");
  await expect(video).toBeVisible();
  const transport = page.getByRole("toolbar", { name: "Transport" });
  await transport.getByRole("button", { name: "Mute" }).click();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
  await expect(transport.getByRole("button", { name: "Unmute" })).toBeVisible();
  await transport.getByRole("button", { name: "Unmute" }).click();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);
  await transport.getByRole("slider", { name: "Volume" }).fill("0.3");
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.volume)).toBe(0.3);

  await transport.getByRole("button", { name: "Fullscreen" }).click();
  await expect.poll(async () => page.evaluate(() => document.fullscreenElement?.getAttribute("aria-label"))).toBe("Player");
  // headless chrome does not route the Esc key to the fullscreen handler; exit via the API
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(async () => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.getByRole("region", { name: "Player", exact: true })).toBeVisible();
});

test("transport walkthrough on jpeg and video Clips: Space, rate list, mute/volume, fullscreen, time display, Ruler-only seek", async ({ page }) => {
  test.setTimeout(60_000);
  for (const [path, durationText, lastFrame] of [
    ["/clips/CLIP_E2E", "0:00 / 0:00", "Frame 1 of 2"],
    ["/clips/CLIP_VID", "0:00 / 0:04", "Frame 99 of 100"],
  ] as const) {
    await page.goto(path);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
    const transport = page.getByRole("toolbar", { name: "Transport" });
    await expect(transport).toBeVisible();
    await expectNoMediaChrome(page);
    // English copy on every hand-built control
    await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(transport.getByRole("button", { name: "Playback rate" })).toBeVisible();
    await expect(transport.getByRole("button", { name: "Mute" })).toBeVisible();
    await expect(transport.getByRole("slider", { name: "Volume" })).toBeVisible();
    await expect(transport.getByRole("button", { name: "Fullscreen" })).toBeVisible();
    await expect(page.locator("[data-transport-time]")).toHaveText(durationText);

    // the rate list applies; 0.25× also slows the short jpeg playback for the toggle below
    await transport.getByRole("button", { name: "Playback rate" }).click();
    await page.getByRole("menu", { name: "Playback rate" }).getByRole("menuitemradio", { name: "0.25×" }).click();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(0.25);

    // leave the rate button so Space toggles playback instead of activating it
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v instanceof HTMLVideoElement) {
        v.currentTime = 0;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press("Space");
    // jpeg is ~0.08 s; 0.25× still ends quickly, so accept playing, ended, or time advanced
    await expect.poll(async () =>
      video.evaluate((el: HTMLVideoElement) => !el.paused || el.ended || el.currentTime > 0),
    ).toBe(true);
    if (path === "/clips/CLIP_VID") {
      await expect(transport.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    }
    const stillPlaying = await video.evaluate((el: HTMLVideoElement) => !el.paused);
    if (stillPlaying) {
      await transport.getByRole("button", { name: "Pause", exact: true }).click();
    }
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    // mute and volume drive the native element on both kinds
    await transport.getByRole("button", { name: "Mute" }).click();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
    await transport.getByRole("button", { name: "Unmute" }).click();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);
    await transport.getByRole("slider", { name: "Volume" }).fill("0.4");
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.volume)).toBe(0.4);

    // fullscreen wraps the player section on both kinds
    await transport.getByRole("button", { name: "Fullscreen" }).click();
    await expect.poll(async () => page.evaluate(() => document.fullscreenElement?.getAttribute("aria-label"))).toBe("Player");
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(async () => page.evaluate(() => document.fullscreenElement)).toBeNull();

    // the Ruler is the only seek: the footer has no slider. Picture click is a
    // mask prompt (ADR 0024), so do not click the video here.
    await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);
    const framePrint = page.getByLabel("Player controls").locator("output");
    const frameText = await framePrint.innerText();
    await page.getByRole("toolbar", { name: "Transport" }).click();
    await expect(framePrint).toHaveText(frameText);

    // Ruler click seeks frame-snapped: the far right edge clamps to the last Frame
    const ruler = page.getByRole("slider", { name: "Ruler" });
    const rulerBox = await ruler.boundingBox();
    expect(rulerBox).not.toBeNull();
    await ruler.click({ position: { x: rulerBox!.width - 2, y: rulerBox!.height / 2 } });
    await expect(page.getByLabel("Player controls").getByText(lastFrame)).toBeVisible();
  }
});

test("Library double-click rename phase and class is desk-wide", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("DeskRenameP1");

  await page.goto("/clips/CLIP_E2E_B");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase", "CLIP_E2E_B"))["0"]).toBe("DeskRenameP1");

  await focusTask(page, "phase");
  await page.getByRole("list", { name: "Library" }).getByRole("button", { name: "DeskRenameP1", exact: true }).dblclick();
  const rename = page.getByLabel("Rename phase");
  await expect(rename).toBeVisible();
  await rename.fill("DeskRenameP2");
  await rename.press("Enter");
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "DeskRenameP2" });
  await expect.poll(async () => await clipFrames(page, "phase", "CLIP_E2E_B")).toMatchObject({ "0": "DeskRenameP2" });

  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "class", "DeskRenameC1");
  await fillTriplet(page, "grasper", "retract", "gallbladder");
  await page.goto("/clips/CLIP_E2E_B");
  await pickName(page, "class", "DeskRenameC1");
  await focusTask(page, "class");
  await page.getByRole("list", { name: "Library" }).getByRole("button", { name: "DeskRenameC1", exact: true }).dblclick();
  const renameClass = page.getByLabel("Rename class tag");
  await renameClass.fill("DeskRenameC2");
  await renameClass.press("Enter");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("DeskRenameC2");
  const vocab = await (await page.request.get("/api/vocab")).json();
  expect(vocab.class_tags).toContain("DeskRenameC2");
  expect(vocab.triples).toEqual(
    expect.arrayContaining([
      { instrument: "grasper", verb: "retract", target: "gallbladder" },
    ]),
  );
});

test("dark sitting, compact rail, no HeroUI, no filmstrip, no Arm", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /light mode|dark mode|theme/i })).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveClass(/stone-/);
  await expect(page.getByLabel("Player controls")).not.toHaveClass(/stone-/);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.locator("video[aria-label='Frame 0']")).toHaveCount(1);
  await expect(page.getByRole("grid")).toHaveCount(0);

  const editors = page.getByRole("region", { name: "Editors" });
  const railBox = await editors.boundingBox();
  expect(railBox?.width).toBeGreaterThanOrEqual(260);
  expect(railBox?.width).toBeLessThanOrEqual(300);
});

test("Library click is this Frame; Library trash confirms then removes the desk name", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "DeskTrashP");
  await scrubToFrame(page, 1);
  await pickName(page, "phase", "DeskTrashP");
  await scrubToFrame(page, 0);
  await pickName(page, "phase", "DeskTrashP");
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual({ "1": "DeskTrashP" });

  await pickName(page, "class", "DeskTrashC");
  await scrubToFrame(page, 1);
  await pickName(page, "class", "DeskTrashC");
  await scrubToFrame(page, 0);
  await pickName(page, "class", "DeskTrashC");
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("DeskTrashC")).toBe(false);
  await expect.poll(async () => ((await clipFrames(page, "class"))["1"] as string[]) ?? []).toContain("DeskTrashC");

  await focusTask(page, "phase");
  const phaseLibrary = page.getByRole("list", { name: "Library" });
  page.once("dialog", (dialog) => dialog.accept());
  await phaseLibrary.getByRole("button", { name: "Delete phase DeskTrashP" }).click();
  // Retiring a name drops the row but leaves the labels already carrying it.
  await expect(phaseLibrary.getByRole("button", { name: "DeskTrashP", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await clipFrames(page, "phase"))["1"]).toBe("DeskTrashP");

  await focusTask(page, "class");
  const classLibrary = page.getByRole("list", { name: "Library" });
  page.once("dialog", (dialog) => dialog.accept());
  await classLibrary.getByRole("button", { name: "Delete class tag DeskTrashC" }).click();
  await expect(classLibrary.getByRole("button", { name: "DeskTrashC", exact: true })).toHaveCount(0);
  await expect.poll(async () => ((await clipFrames(page, "class"))["1"] as string[]) ?? []).toContain("DeskTrashC");
});

test("trashing a Vocab triple confirms, retires the picker row, and keeps the labels", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await fillTriplet(page, "DeskTrashTool", "grasp", "gallbladder");
  await page.goto("/clips/CLIP_E2E_B");
  await fillTriplet(page, "DeskTrashTool", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(true);

  await focusTask(page, "triplet");
  const trash = page.getByRole("button", { name: "Delete triple DeskTrashTool / grasp / gallbladder" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await trash.click();
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet", "CLIP_E2E")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await trash.click();
  await expect(page.getByRole("button", { name: "DeskTrashTool / grasp / gallbladder", exact: true })).toHaveCount(0);
  // Archiving is desk-wide retirement, not a label rewrite: both Clips keep the
  // rows they already carry (ticket 17).
  await expect.poll(async () => {
    const framesA = (await clipFrames(page, "triplet", "CLIP_E2E")) as Record<string, { instrument: string }[]>;
    const framesB = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string }[]>;
    return (framesA["0"] ?? []).some((row) => row.instrument === "DeskTrashTool")
      && (framesB["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(true);
});

test("trashing a Brushed identity drops its footer chip; surviving kinds keep theirs; non-Brushed trash changes nothing", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "class", "clipper");
  const brushBox = page.locator("[data-brush]");
  await expect(brushBox.getByText("class: clipper", { exact: true })).toBeVisible();

  await setBrush(page, "phase", "Preparation");
  const phaseChip = brushBox.locator("span[data-label-color]").filter({ hasText: "phase: Preparation" });
  await expect(phaseChip).toBeVisible();
  const phaseColor = await phaseChip.getAttribute("data-label-color");
  expect(phaseColor).toBeTruthy();

  await focusTask(page, "triplet");
  await page.getByRole("combobox", { name: "instrument" }).fill("BrushTrashTool");
  await page.getByRole("combobox", { name: "verb" }).fill("grasp");
  await page.getByRole("combobox", { name: "target" }).fill("gallbladder");
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const tripleRow = page
    .getByRole("table", { name: "Library" })
    .getByRole("row")
    .filter({ hasText: "BrushTrashTool" });
  await tripleRow.getByRole("button", { name: "Brush", exact: true }).click();
  const tripletChipText = "triplet: BrushTrashTool / grasp / gallbladder";
  await expect(brushBox.getByText(tripletChipText, { exact: true })).toBeVisible();
  // each kind's Brush survives a Task focus switch
  await focusTask(page, "class");
  await expect(brushBox.getByText("class: clipper", { exact: true })).toBeVisible();

  // trash the Brushed class tag: its chip disappears, the other kinds' chips and colors stay
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("list", { name: "Library" }).getByRole("button", { name: "Delete class tag clipper" }).click();
  await expect(brushBox.getByText("class: clipper", { exact: true })).toHaveCount(0);
  // the emptied class Brush disables the commit controls like any empty Brush
  await expect(page.getByRole("button", { name: "Mark from" })).toBeDisabled();
  await focusTask(page, "phase");
  await expect(phaseChip).toBeVisible();
  await expect(phaseChip).toHaveAttribute("data-label-color", phaseColor!);
  await focusTask(page, "triplet");
  await expect(brushBox.getByText(tripletChipText, { exact: true })).toBeVisible();

  // trash the Brushed exact triple: same for its chip
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete triple BrushTrashTool / grasp / gallbladder" }).click();
  await expect(brushBox.getByText(tripletChipText, { exact: true })).toHaveCount(0);
  await focusTask(page, "phase");
  await expect(phaseChip).toBeVisible();
  await expect(phaseChip).toHaveAttribute("data-label-color", phaseColor!);

  // trash a name that was never in the Brush: chips do not move
  await focusTask(page, "phase");
  const chipsBefore = await brushBox.locator("span[data-label-color]").allInnerTexts();
  await focusTask(page, "class");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("list", { name: "Library" }).getByRole("button", { name: "Delete class tag hook" }).click();
  await expect(page.getByRole("list", { name: "Library" }).getByRole("button", { name: "hook", exact: true })).toHaveCount(0);
  await focusTask(page, "phase");
  const chipsAfter = await brushBox.locator("span[data-label-color]").allInnerTexts();
  expect(chipsAfter).toEqual(chipsBefore);
  await expect(phaseChip).toHaveAttribute("data-label-color", phaseColor!);
});

test("empty Brush: span keys and commit controls do nothing", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("[data-paint-chip]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark from" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Apply to frames/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Remove from frames/ })).toBeDisabled();
  const before = await clipFrames(page, "class");
  await page.keyboard.press("]");
  await expect.poll(async () => await clipFrames(page, "class")).toEqual(before);
  await page.keyboard.press("o");
  await expect.poll(async () => await clipFrames(page, "class")).toEqual(before);
  await page.keyboard.press("[");
  await page.keyboard.press("i");
  await expect(page.getByText(/→/)).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
});

test("Brush arm does not write this Frame; Mark from + Apply writes the range, toasts, Brush stays", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  const before = await clipFrames(page, "class");
  await setBrush(page, "class", "clipper");
  await expectClassFrames(page, before);
  await expect(page.locator("[data-brush]").getByText("class: clipper", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark from" }).click();
  await expect(page.getByText("0 → 0")).toBeVisible();
  await scrubToFrame(page, 1);
  await expect(page.getByText("0 → 1")).toBeVisible();
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect(page.getByText("Wrote class: clipper on frames 0–1")).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "class")).toMatchObject({
    "0": expect.arrayContaining(["clipper"]),
    "1": expect.arrayContaining(["clipper"]),
  });
  const bar = page.getByRole("button", { name: "clipper 0–1" });
  const head = page.locator("[data-lane-head]").filter({ hasText: "clipper" });
  await expect(bar).toBeVisible();
  await expect(head).toHaveCount(1);
  await expect(page.getByRole("slider", { name: "Ruler" })).toBeVisible();
  const clipsBox = await page.getByRole("navigation", { name: "Clips" }).boundingBox();
  const playerBox = await page.getByRole("region", { name: "Player", exact: true }).boundingBox();
  const timelineBox = await page.getByRole("region", { name: "Timeline" }).boundingBox();
  const headBox = await head.boundingBox();
  const barBox = await bar.boundingBox();
  expect(clipsBox && playerBox && timelineBox && headBox && barBox).toBeTruthy();
  expect(Math.abs(timelineBox!.x - clipsBox!.x)).toBeLessThan(2);
  expect(Math.abs(timelineBox!.x + timelineBox!.width - (playerBox!.x + playerBox!.width))).toBeLessThan(2);
  expect(Math.abs(headBox!.width - clipsBox!.width)).toBeLessThan(2);
  expect(barBox!.x).toBeGreaterThanOrEqual(playerBox!.x - 2);
  await expect(page.locator("[data-brush]").getByText("class: clipper", { exact: true })).toBeVisible();
  await expect(page.getByText("0 → 1")).toHaveCount(0);
  await expect(page.locator("[data-ruler-range]")).toHaveCount(0);
});

test("] applies this Frame; Remove without Mark from erases this Frame", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "phase", "ChipApplyP");
  await expect(page.locator("[data-brush]").getByText("phase: ChipApplyP", { exact: true })).toBeVisible();
  await page.keyboard.press("]");
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "ChipApplyP" });
  expect((await clipFrames(page, "phase"))["1"]).toBeUndefined();
  await expect(page.getByRole("button", { name: "ChipApplyP 0–0" })).toBeVisible();
  await page.getByRole("button", { name: "Remove from frames 0–0" }).click();
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual({});
  await expect(page.getByRole("button", { name: "ChipApplyP 0–0" })).toHaveCount(0);
});

test("i/o/[ paint a span onto the timeline while the player is focused", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "phase", "ChipApplyP");
  // Picture is the mask canvas; click the Brush well, not the video.
  await page.locator("[data-brush]").click();
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    el.pause();
    el.currentTime = 0;
  });
  await page.keyboard.press("[");
  await expect(page.getByText("0 → 0")).toBeVisible();
  await page.keyboard.press("i");
  await expect(page.getByText("0 → 0")).toBeVisible();
  await scrubToFrame(page, 1);
  await page.keyboard.press("o");
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "ChipApplyP", "1": "ChipApplyP" });
  const bar = page.getByRole("button", { name: "ChipApplyP 0–1" });
  await expect(bar).toBeVisible();
  await expect(page.locator("[data-lane-head]").filter({ hasText: "ChipApplyP" })).toHaveCount(1);
  await expect(page.getByRole("slider", { name: "Ruler" })).toBeVisible();
  const playerBox = await page.getByRole("region", { name: "Player", exact: true }).boundingBox();
  const barBox = await bar.boundingBox();
  expect(playerBox && barBox).toBeTruthy();
  expect(barBox!.x).toBeGreaterThanOrEqual(playerBox!.x - 2);
});

test("two class tags in one Apply; tags outside the Brush stay", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 1: ["hook"] });
  await page.goto("/clips/CLIP_E2E");
  const before = await clipFrames(page, "class");
  await setBrush(page, "class", "grasper");
  await expectClassFrames(page, before);
  await setBrush(page, "class", "blurred");
  await expectClassFrames(page, before);
  await expect(page.locator("[data-brush]").getByText("class: grasper", { exact: true })).toBeVisible();
  await expect(page.locator("[data-brush]").getByText("class: blurred", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect(page.getByText("Wrote class: grasper, class: blurred on frames 0–1")).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "class")).toMatchObject({
    "0": expect.arrayContaining(["grasper", "blurred"]),
    "1": expect.arrayContaining(["hook", "grasper", "blurred"]),
  });
  await expect(page.locator("[data-brush]").getByText("class: grasper", { exact: true })).toBeVisible();
  await expect(page.locator("[data-brush]").getByText("class: blurred", { exact: true })).toBeVisible();
  await expect(page.getByText("0 → 1")).toHaveCount(0);
});

test("Ruler shows from–to and ghost bars while Mark from is set; both go after Apply", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "class");
  // grasper is unused on this Clip: its Lane starts hidden, the labeler shows it
  await libraryRow(page, "grasper").getByRole("button", { name: "Show lane" }).click();
  const lane = page.locator('[data-timeline-lane="grasper"]');
  await expect(lane).toBeVisible();
  await expect(lane.locator("[data-timeline-seg]")).toHaveCount(0);
  await setBrush(page, "class", "grasper");
  await page.getByRole("button", { name: "Mark from" }).click();
  await expect(page.getByText("0 → 0")).toBeVisible();
  const rulerRange = page.locator("[data-ruler-range]");
  await expect(rulerRange).toBeVisible();
  const ghost = page.locator('[data-timeline-lane="grasper"] [data-ghost]');
  await expect(ghost).toHaveCount(1);
  expect(await ghost.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await scrubToFrame(page, 1);
  await expect(page.getByText("0 → 1")).toBeVisible();
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect(page.getByText("Wrote class: grasper on frames 0–1")).toBeVisible();
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });
  await expect(rulerRange).toHaveCount(0);
  await expect(page.locator("[data-ghost]")).toHaveCount(0);
  await expect(page.getByText("0 → 1")).toHaveCount(0);
});

test("clicking a Lane bar seeks to the Frame under the pointer and clears selection", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper", "hook"], 1: ["grasper", "hook"] });
  await page.goto("/clips/CLIP_E2E");
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  const hookBar = page.getByRole("button", { name: "hook 0–1" });
  await expect(grasperBar).toBeVisible();
  const barBox = await grasperBar.boundingBox();
  expect(barBox).not.toBeNull();
  // right quarter of the bar is Frame 1: a bar click must not jump to the bar start
  await grasperBar.click({ position: { x: barBox!.width * 0.75, y: barBox!.height / 2 } });
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  // Shift-click selects without seeking
  await grasperBar.click({ modifiers: ["Shift"], position: { x: barBox!.width * 0.25, y: barBox!.height / 2 } });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  // unmodified click on another bar seeks and drops the stale selection
  await hookBar.click({ position: { x: barBox!.width * 0.25, y: barBox!.height / 2 } });
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  await expect(page.locator('[data-timeline-seg][data-selected="true"]')).toHaveCount(0);
});

test("Shift-click selects bars; Backspace drops the selected segments", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper", "hook"], 1: ["grasper", "hook"] });
  await page.goto("/clips/CLIP_E2E");
  await scrubToFrame(page, 1);
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  const hookBar = page.getByRole("button", { name: "hook 0–1" });
  await grasperBar.click({ modifiers: ["Shift"] });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await hookBar.click({ modifiers: ["Shift"] });
  await expect(hookBar).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Backspace");
  await expectClassFrames(page, {});
  await expect(grasperBar).toHaveCount(0);
  await expect(hookBar).toHaveCount(0);
});

test("Backspace/Delete drops only the selected identity; other Lanes stay", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper", "hook"], 1: ["grasper", "hook"] });
  await page.goto("/clips/CLIP_E2E");
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  const hookBar = page.getByRole("button", { name: "hook 0–1" });
  await grasperBar.click({ modifiers: ["Shift"] });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Delete");
  await expectClassFrames(page, { "0": ["hook"], "1": ["hook"] });
  await expect(hookBar).toBeVisible();
  await expect(grasperBar).toHaveCount(0);
});

test("Escape clears bar selection without writing disk", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper", "hook"], 1: ["grasper", "hook"] });
  await page.goto("/clips/CLIP_E2E");
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  await grasperBar.click({ modifiers: ["Shift"] });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-timeline-seg][data-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expectClassFrames(page, { "0": ["grasper", "hook"], "1": ["grasper", "hook"] });
});

test("show an unused Lane, click it to seek, drag-paint it; visibility persists", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "class");
  // an unused identity starts hidden
  await expect(page.locator('[data-timeline-lane="blurred"]')).toHaveCount(0);
  await libraryRow(page, "blurred").getByRole("button", { name: "Show lane" }).click();
  const lane = page.locator('[data-timeline-lane="blurred"]');
  await expect(lane).toBeVisible();
  await expect(lane.locator("[data-timeline-seg]")).toHaveCount(0);

  // click without drag on empty track seeks and paints nothing
  const laneBox = await lane.boundingBox();
  expect(laneBox).not.toBeNull();
  await lane.click({ position: { x: laneBox!.width * 0.75, y: laneBox!.height / 2 } });
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expectClassFrames(page, {});

  // drag on empty track paints the identity on the dragged inclusive range
  await page.mouse.move(laneBox!.x + laneBox!.width * 0.25, laneBox!.y + laneBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(laneBox!.x + laneBox!.width * 0.75, laneBox!.y + laneBox!.height / 2);
  await page.mouse.up();
  await expectClassFrames(page, { "0": ["blurred"], "1": ["blurred"] });
  await expect(page.getByRole("button", { name: "blurred 0–1" })).toBeVisible();

  // visibility persists on this machine across reloads
  await expect.poll(() =>
    page.evaluate(() => window.localStorage.getItem("endo_label:lane-visibility-v1")),
  ).toContain('"class:blurred":true');
  await page.reload();
  await expect(page.locator('[data-timeline-lane="blurred"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "blurred 0–1" })).toBeVisible();
});

test("dragging the end of a selected bar trims the segment", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper"] });
  await page.goto("/clips/CLIP_E2E");
  const lane = page.locator('[data-timeline-lane="grasper"]');
  const laneBox = await lane.boundingBox();
  expect(laneBox).not.toBeNull();
  const bar = page.getByRole("button", { name: "grasper 0–0" });
  await bar.click({ modifiers: ["Shift"] });
  await expect(bar).toHaveAttribute("data-selected", "true");
  const endHandle = bar.locator('[data-trim="end"]');
  const handleBox = await endHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  // widen 0–0 to 0–1: release paints the grown Frames
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(laneBox!.x + laneBox!.width * 0.75, handleBox!.y + handleBox!.height / 2);
  await page.mouse.up();
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });
  const grown = page.getByRole("button", { name: "grasper 0–1" });
  await expect(grown).toBeVisible();
  await expect(grown).toHaveAttribute("data-selected", "true");

  // shrink back to 0–0: release removes the cut Frames
  const grownHandle = grown.locator('[data-trim="end"]');
  const grownHandleBox = await grownHandle.boundingBox();
  expect(grownHandleBox).not.toBeNull();
  await page.mouse.move(grownHandleBox!.x + grownHandleBox!.width / 2, grownHandleBox!.y + grownHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(laneBox!.x + laneBox!.width * 0.25, grownHandleBox!.y + grownHandleBox!.height / 2);
  await page.mouse.up();
  await expectClassFrames(page, { "0": ["grasper"] });
  await expect(page.getByRole("button", { name: "grasper 0–0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "grasper 0–1" })).toHaveCount(0);
});

test("eye hides a labeled Lane (well omits it, disk keeps it); hidden Brush identity still writes", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper"], 1: ["grasper"] });
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("button", { name: "grasper 0–1" })).toBeVisible();
  await libraryRow(page, "grasper").getByRole("button", { name: "Hide lane" }).click();
  await expect(page.locator('[data-timeline-lane="grasper"]')).toHaveCount(0);
  await expect(page.locator("[data-lane-head]").filter({ hasText: "grasper" })).toHaveCount(0);
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });
  // an explicit stored hide wins over present-on-Clip after reload
  await page.reload();
  await expect(page.locator('[data-timeline-lane="grasper"]')).toHaveCount(0);
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });

  // Brush writes still reach disk for a hidden identity
  await setBrush(page, "class", "grasper");
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Remove from frames 0–1" }).click();
  await expect(page.getByText("Removed class: grasper on frames 0–1")).toBeVisible();
  await expectClassFrames(page, {});
});

test("Task-focus tabs, Library write, + does not write Frame, summary does not seek", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "class");
  await expect(page.locator('[data-editor-card="class"]')).toBeVisible();
  await expect(page.locator('[data-editor-card="phase"]')).toHaveCount(0);
  await expect(page.locator('[data-editor-card="triplet"]')).toHaveCount(0);

  await addVocabOnly(page, "class", "TaskFocusLib");
  await page.getByRole("list", { name: "Library" }).getByRole("button", { name: "TaskFocusLib", exact: true }).click();
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("TaskFocusLib");

  const beforePhase = await clipFrames(page, "phase");
  await focusTask(page, "phase");
  await addVocabOnly(page, "phase", "PlusOnlyPhase");
  await expect.poll(async () => {
    const vocab = await (await page.request.get("/api/vocab")).json();
    return (vocab.phases as string[]).includes("PlusOnlyPhase");
  }).toBe(true);
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual(beforePhase);

  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: /class:/ }).click();
  await expect(page.locator('[data-editor-card="class"]')).toBeVisible();
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("Task focus switch rebuilds the well, clears bar selection, and keeps each kind's Brush", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper"], 1: ["grasper"] });
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "class", "grasper");
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  await grasperBar.click({ modifiers: ["Shift"] });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");

  await focusTask(page, "phase");
  await expect(page.locator('[data-timeline-lane="grasper"]')).toHaveCount(0);
  await expect(page.locator("[data-brush] span[data-label-color]")).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });

  await setBrush(page, "phase", "Preparation");
  await expect(page.locator("[data-brush]").getByText("phase: Preparation", { exact: true })).toBeVisible();

  await focusTask(page, "class");
  await expect(page.locator('[data-timeline-lane="grasper"]')).toBeVisible();
  await expect(page.locator('[data-timeline-seg][data-selected="true"]')).toHaveCount(0);
  await expect(page.locator("[data-brush]").getByText("class: grasper", { exact: true })).toBeVisible();
  await focusTask(page, "phase");
  await expect(page.locator("[data-brush]").getByText("phase: Preparation", { exact: true })).toBeVisible();
});

test("timeline folds span, click seeks under the pointer, focus rebuilds", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "phase", "BandPhase");
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect(page.getByText("Wrote phase: BandPhase on frames 0–1")).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "BandPhase", "1": "BandPhase" });
  const bar = page.getByRole("button", { name: "BandPhase 0–1" });
  await expect(bar).toBeVisible();
  await expect(page.locator("[data-lane-head]").filter({ hasText: "BandPhase" })).toHaveCount(1);
  const barBox = await bar.boundingBox();
  expect(barBox).not.toBeNull();
  // a bar click seeks to the Frame under the pointer, not the bar start
  await bar.click({ position: { x: barBox!.width * 0.25, y: barBox!.height / 2 } });
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  await bar.click({ position: { x: barBox!.width * 0.75, y: barBox!.height / 2 } });
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await focusTask(page, "class");
  await expect(page.getByRole("button", { name: "BandPhase 0–1" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
});

test("colored named intervals match Library and Now", async ({ page }) => {
  await page.request.put("/api/phase/CLIP_E2E/frames/0", { data: { phase: null } });
  await page.request.put("/api/phase/CLIP_E2E/frames/1", { data: { phase: null } });
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "ColorPhaseA");
  await scrubToFrame(page, 1);
  await pickName(page, "phase", "ColorPhaseB");
  const barA = page.getByRole("button", { name: "ColorPhaseA 0–0" });
  const barB = page.getByRole("button", { name: "ColorPhaseB 1–1" });
  const headA = page.locator("[data-lane-head]").filter({ hasText: "ColorPhaseA" });
  const headB = page.locator("[data-lane-head]").filter({ hasText: "ColorPhaseB" });
  await expect(headA).toHaveCount(1);
  await expect(headB).toHaveCount(1);
  await expect(barA).not.toHaveText("ColorPhaseA");
  await expect(barB).not.toHaveText("ColorPhaseB");
  const lib = page.getByRole("list", { name: "Library" });
  const colorA = await lib.getByRole("button", { name: "ColorPhaseA", exact: true }).getAttribute("data-label-color");
  const colorB = await lib.getByRole("button", { name: "ColorPhaseB", exact: true }).getAttribute("data-label-color");
  expect(colorA).toBeTruthy();
  expect(colorB).toBeTruthy();
  expect(colorA).not.toBe(colorB);
  await expect(barA).toHaveAttribute("data-label-color", colorA!);
  await expect(barB).toHaveAttribute("data-label-color", colorB!);
  await expect(page.locator("[data-now]")).toHaveAttribute("data-label-color", colorB!);
  await lib.getByRole("button", { name: "ColorPhaseB", exact: true }).click();
  const gap = page.locator("[data-timeline-seg][data-unlabeled]").first();
  await expect(gap).toBeVisible();
  await expect(gap).toHaveText("");
});

test("labeled Now fills with label color; empty Now does not", async ({ page }) => {
  await page.request.put("/api/class/CLIP_E2E/frames/0", { data: { tags: [] } });
  await page.request.put("/api/phase/CLIP_E2E/frames/0", { data: { phase: null } });
  const tripletDoc = (await (await page.request.get("/api/triplet/CLIP_E2E")).json()) as {
    frames?: Record<string, { id: number }[]>;
  };
  for (const row of tripletDoc.frames?.["0"] ?? []) {
    await page.request.delete(`/api/triplet/CLIP_E2E/frames/0/${row.id}`);
  }
  await page.goto("/clips/CLIP_E2E");

  await focusTask(page, "class");
  const classNow = page.locator('[data-editor-card="class"] [data-now]');
  await expect(classNow.getByText("No class tags on frame 0")).toBeVisible();
  const classEmptyBg = await cssBackground(classNow);
  await pickName(page, "class", "FillClass");
  const classChip = classNow.locator("[data-label-color]");
  await expect(classChip).toHaveText("FillClass");
  const classBar = page.getByRole("button", { name: "FillClass 0–0" });
  await expect(classBar).toBeVisible();
  const classFill = await cssBackground(classChip);
  expect(classFill).toBe(await cssBackground(classBar));
  expect(classFill).not.toBe(classEmptyBg);
  expect(
    await cssBackground(page.getByRole("list", { name: "Library" }).getByRole("button", { name: "FillClass", exact: true })),
  ).not.toBe(classFill);
  await pickName(page, "class", "FillClass");
  await expect(classNow.getByText("No class tags on frame 0")).toBeVisible();
  expect(await cssBackground(classNow)).not.toBe(classFill);

  await pickName(page, "phase", "FillPhase");
  const phaseNow = page.locator('[data-editor-card="phase"] [data-now]');
  await expect(phaseNow).toHaveText("FillPhase");
  const phaseBar = page.getByRole("button", { name: "FillPhase 0–0" });
  await expect(phaseBar).toBeVisible();
  const phaseFill = await cssBackground(phaseNow);
  expect(phaseFill).toBe(await cssBackground(phaseBar));
  expect(
    await cssBackground(page.getByRole("list", { name: "Library" }).getByRole("button", { name: "FillPhase", exact: true })),
  ).not.toBe(phaseFill);
  await pickName(page, "phase", "FillPhase");
  await expect(phaseNow).toHaveText("No phase on frame 0");
  expect(await cssBackground(phaseNow)).not.toBe(phaseFill);

  await fillTriplet(page, "FillTool", "FillAct", "FillOrg");
  const tripletNow = page.locator('[data-editor-card="triplet"] [data-now] [data-label-color]').first();
  await expect(tripletNow).toContainText("FillTool");
  const tripletBar = page.getByRole("button", { name: "FillTool / FillAct / FillOrg 0–0" });
  await expect(tripletBar).toBeVisible();
  const tripletFill = await cssBackground(tripletNow);
  expect(tripletFill).toBe(await cssBackground(tripletBar));
  expect(
    await cssBackground(
      page.getByRole("table", { name: "Library" }).getByRole("button", { name: "FillTool / FillAct / FillOrg", exact: true }),
    ),
  ).not.toBe(tripletFill);
  await fillTriplet(page, "FillTool", "FillAct", "FillOrg");
  await expect(page.locator('[data-editor-card="triplet"] [data-now] [data-label-color]')).toHaveCount(0);
  await expect(page.locator('[data-editor-card="triplet"] [data-now]').getByText("No triplets on frame 0")).toBeVisible();
});

test("empty Clip shows Ruler and Lane well; picture height stays put when a Lane appears", async ({ page }) => {
  await clearClipLabels(page);
  await clearClipLabels(page, "CLIP_VID");
  await page.goto("/clips/CLIP_E2E");
  const timeline = page.getByRole("region", { name: "Timeline" });
  const ruler = page.getByRole("slider", { name: "Ruler" });
  const well = page.getByRole("region", { name: "Lane well" });
  const clips = page.getByRole("navigation", { name: "Clips" });
  const player = page.getByRole("region", { name: "Player", exact: true });
  const editors = page.getByRole("region", { name: "Editors" });
  await expect(timeline).toBeVisible();
  await expect(ruler).toBeVisible();
  await expect(well).toBeVisible();
  const transport = page.getByRole("toolbar", { name: "Transport" });
  await expect(transport).toBeVisible();
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Playback rate" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Mute" })).toBeVisible();
  await expect(transport.getByRole("slider", { name: "Volume" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Fullscreen" })).toBeVisible();
  await expect(page.locator("[data-transport-time]")).toBeVisible();
  await expectNoMediaChrome(page);
  await expect(page.locator("[data-timeline-lane]")).toHaveCount(0);
  await expect(page.locator("[data-timeline-seg]")).toHaveCount(0);
  await expect(page.locator("[data-lane-head]")).toHaveCount(0);
  await expect(page.locator('[role="region"][aria-label="Editors"] [data-timeline]')).toHaveCount(0);
  const clipsBox = await clips.boundingBox();
  const playerBox = await player.boundingBox();
  const timelineBox = await timeline.boundingBox();
  const editorsBox = await editors.boundingBox();
  const rulerBox = await ruler.boundingBox();
  const transportBox = await transport.boundingBox();
  const wellBox = await well.boundingBox();
  expect(clipsBox && playerBox && timelineBox && editorsBox && rulerBox && transportBox && wellBox).toBeTruthy();
  expect(timelineBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  expect(rulerBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  expect(transportBox!.y).toBeGreaterThanOrEqual(rulerBox!.y + rulerBox!.height - 1);
  expect(wellBox!.y).toBeGreaterThanOrEqual(transportBox!.y + transportBox!.height - 1);
  expect(Math.abs(timelineBox!.x - clipsBox!.x)).toBeLessThan(2);
  expect(Math.abs(timelineBox!.x + timelineBox!.width - (playerBox!.x + playerBox!.width))).toBeLessThan(2);
  expect(timelineBox!.x + timelineBox!.width).toBeLessThanOrEqual(editorsBox!.x + 1);
  // ~6rem reserved strip (h-24 at 16px root)
  expect(wellBox!.height).toBeGreaterThanOrEqual(88);
  expect(wellBox!.height).toBeLessThanOrEqual(104);
  const emptyPlayerHeight = playerBox!.height;
  const emptyWellHeight = wellBox!.height;

  await pickName(page, "class", "clipper");
  await expect(page.locator("[data-timeline-lane]")).toHaveCount(1);
  const afterOnePlayer = await player.boundingBox();
  const afterOneWell = await well.boundingBox();
  expect(afterOnePlayer && afterOneWell).toBeTruthy();
  expect(Math.abs(afterOnePlayer!.height - emptyPlayerHeight)).toBeLessThan(2);
  expect(Math.abs(afterOneWell!.height - emptyWellHeight)).toBeLessThan(2);
  const head = page.locator("[data-lane-head]").filter({ hasText: "clipper" });
  const bar = page.getByRole("button", { name: "clipper 0–0" });
  await expect(head).toHaveCount(1);
  await expect(bar).toBeVisible();
  const headBox = await head.boundingBox();
  const barBox = await bar.boundingBox();
  expect(headBox && barBox).toBeTruthy();
  expect(Math.abs(headBox!.width - clipsBox!.width)).toBeLessThan(2);
  expect(barBox!.x).toBeGreaterThanOrEqual(playerBox!.x - 2);

  for (const name of ["grasper", "hook", "scissors", "blurred", "WellExtra"]) {
    await pickName(page, "class", name);
  }
  await expect(page.locator("[data-timeline-lane]")).toHaveCount(6);
  const afterManyPlayer = await player.boundingBox();
  const afterManyWell = await well.boundingBox();
  expect(afterManyPlayer && afterManyWell).toBeTruthy();
  expect(Math.abs(afterManyPlayer!.height - emptyPlayerHeight)).toBeLessThan(2);
  expect(Math.abs(afterManyWell!.height - emptyWellHeight)).toBeLessThan(2);
  expect(await well.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);

  await page.goto("/clips/CLIP_VID");
  const videoPlayer = page.getByRole("region", { name: "Player", exact: true });
  const videoRuler = page.getByRole("slider", { name: "Ruler" });
  const videoTransport = page.getByRole("toolbar", { name: "Transport" });
  const videoWell = page.getByRole("region", { name: "Lane well" });
  await expect(videoWell).toBeVisible();
  await expect(videoRuler).toBeVisible();
  await expect(videoTransport).toBeVisible();
  const videoPlayerBox = await videoPlayer.boundingBox();
  const videoRulerBox = await videoRuler.boundingBox();
  const videoTransportBox = await videoTransport.boundingBox();
  const videoWellBox = await videoWell.boundingBox();
  expect(videoPlayerBox && videoRulerBox && videoTransportBox && videoWellBox).toBeTruthy();
  expect(videoRulerBox!.y).toBeGreaterThanOrEqual(videoPlayerBox!.y + videoPlayerBox!.height - 1);
  expect(videoTransportBox!.y).toBeGreaterThanOrEqual(videoRulerBox!.y + videoRulerBox!.height - 1);
  expect(videoWellBox!.y).toBeGreaterThanOrEqual(videoTransportBox!.y + videoTransportBox!.height - 1);
  expect(Math.abs(videoWellBox!.height - emptyWellHeight)).toBeLessThan(2);
});

test("Ruler drag stays frame-snapped; a bar drag seeks but never relocates or paints", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toBeVisible();
  const player = page.getByRole("region", { name: "Player", exact: true });
  const clips = page.getByRole("navigation", { name: "Clips" });
  await expect(page.locator('[role="region"][aria-label="Editors"] [data-timeline]')).toHaveCount(0);
  await expect(player.locator("[data-timeline]")).toHaveCount(0);
  const playerBox = await player.boundingBox();
  const timelineBox = await timeline.boundingBox();
  const clipsBox = await clips.boundingBox();
  expect(playerBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(clipsBox).not.toBeNull();
  expect(timelineBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  expect(Math.abs(timelineBox!.x - clipsBox!.x)).toBeLessThan(2);
  expect(Math.abs(timelineBox!.x + timelineBox!.width - (playerBox!.x + playerBox!.width))).toBeLessThan(2);
  const video = page.locator("video");
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  const playhead = page.locator("[data-playhead]");
  const ruler = page.getByRole("slider", { name: "Ruler" });
  await expect(playhead).toBeVisible();
  await expect(ruler).toBeVisible();
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  // drag Ruler to ~90%: frame 1 of 2
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.9, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  // drag back to ~10%: frame 0
  await page.mouse.move(box!.x + box!.width * 0.9, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();

  // a bar is not display-only and not relocatable: unmodified drag seeks along the pointer, paints nothing
  await pickName(page, "phase", "DragPhase");
  const bar = page.getByRole("button", { name: "DragPhase 0–0" });
  await expect(bar).toBeVisible();
  await expect(bar).not.toHaveAttribute("draggable", "true");
  const head = page.locator("[data-lane-head]").filter({ hasText: "DragPhase" });
  const headBox = await head.boundingBox();
  const trackBox = await page.locator("[data-timeline-track]").boundingBox();
  expect(headBox).not.toBeNull();
  expect(trackBox).not.toBeNull();
  expect(Math.abs(headBox!.width - clipsBox!.width)).toBeLessThan(2);
  expect(Math.abs(trackBox!.x - playerBox!.x)).toBeLessThan(2);
  const barBox = await bar.boundingBox();
  expect(barBox).not.toBeNull();
  await page.mouse.move(barBox!.x + barBox!.width * 0.5, barBox!.y + barBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.9, barBox!.y + barBox!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "DragPhase 0–0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "DragPhase 0–1" })).toHaveCount(0);
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual({ "0": "DragPhase" });

  await bar.click();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
});

test("triplet Library rows toggle; + does not write Frame", async ({ page }) => {
  const tripletDoc = (await (await page.request.get("/api/triplet/CLIP_E2E")).json()) as {
    frames?: Record<string, { id: number }[]>;
  };
  for (const [index, rows] of Object.entries(tripletDoc.frames ?? {})) {
    for (const row of rows) {
      await page.request.delete(`/api/triplet/CLIP_E2E/frames/${index}/${row.id}`);
    }
  }
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "triplet");
  const library = page.getByRole("table", { name: "Library" });
  await expect(library.getByRole("columnheader", { name: "instrument" })).toBeVisible();
  await expect(library.getByRole("columnheader", { name: "verb" })).toBeVisible();
  await expect(library.getByRole("columnheader", { name: "target" })).toBeVisible();
  await expect(page.getByRole("list", { name: "instrument library" })).toHaveCount(0);

  const before = await clipFrames(page, "triplet");
  await page.getByRole("combobox", { name: "instrument" }).fill("RowTool");
  await page.getByRole("combobox", { name: "verb" }).fill("RowAct");
  await page.getByRole("combobox", { name: "target" }).fill("RowOrg");
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const row = library.getByRole("button", { name: "RowTool / RowAct / RowOrg", exact: true });
  await expect(row).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "triplet")).toEqual(before);
  await expect(page.getByRole("button", { name: "bipolar / dissect / omentum", exact: true })).toHaveCount(0);

  await row.click();
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (frames["0"] ?? []).some((item) => item.instrument === "RowTool" && item.verb === "RowAct" && item.target === "RowOrg");
  }).toBe(true);
  await expect(page.locator("[data-now]")).toContainText("RowTool");
  await expect(page.locator("[data-now]")).toContainText("RowAct");
  await expect(page.locator("[data-now]")).toContainText("RowOrg");
  await page.locator("[data-now]").getByText("RowTool").click();
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((item) => item.instrument === "RowTool");
  }).toBe(true);

  await row.click();
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((item) => item.instrument === "RowTool");
  }).toBe(false);
});

test("composed triplet row survives a Task focus switch", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "triplet");
  await page.getByRole("combobox", { name: "instrument" }).fill("FocusTool");
  await page.getByRole("combobox", { name: "verb" }).fill("FocusAct");
  await page.getByRole("combobox", { name: "target" }).fill("FocusOrg");
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const row = page.getByRole("table", { name: "Library" }).getByRole("button", { name: "FocusTool / FocusAct / FocusOrg", exact: true });
  await expect(row).toBeVisible();
  await focusTask(page, "phase");
  await focusTask(page, "triplet");
  await expect(row).toBeVisible();
});

test("editor cards enclose Now and Library with micro-headers and count badges", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  for (const kind of ["class", "phase", "triplet"] as const) {
    await focusTask(page, kind);
    const editor = page.locator(`[data-editor-card="${kind}"]`);
    const nowCard = editor.locator('[data-card="now"]');
    const libraryCard = editor.locator('[data-card="library"]');
    await expect(nowCard).toBeVisible();
    await expect(libraryCard).toBeVisible();
    await expect(nowCard.getByText("Now", { exact: true })).toBeVisible();
    await expect(libraryCard.getByText("Library", { exact: true })).toBeVisible();
    // Micro-header count badge pill checks
    await expect(nowCard.locator(".rounded-full.bg-secondary")).toBeVisible();
    await expect(libraryCard.locator(".rounded-full.bg-secondary")).toBeVisible();
    await expect(editor.getByRole("button", { name: "List" })).toHaveCount(0);
    const seps = editor.getByRole("separator");
    await expect(seps).toHaveCount(0);
    const nowBox = await nowCard.boundingBox();
    const libraryBox = await libraryCard.boundingBox();
    expect(nowBox && libraryBox).toBeTruthy();
    expect(libraryBox!.y).toBeGreaterThan(nowBox!.y);
  }
});

test("video Clip uses video element and seek updates Now", async ({ page }) => {
  await page.goto("/clips/CLIP_VID");
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Transport" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expectNoMediaChrome(page);
  await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);
  const player = page.getByRole("region", { name: "Player", exact: true });
  const clips = page.getByRole("navigation", { name: "Clips" });
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toBeVisible();
  await expect(page.getByRole("slider", { name: "Ruler" })).toBeVisible();
  await expect(page.locator("[data-playhead]")).toBeVisible();
  const playerBox = await player.boundingBox();
  const clipsBox = await clips.boundingBox();
  const timelineBox = await timeline.boundingBox();
  expect(playerBox && clipsBox && timelineBox).toBeTruthy();
  expect(timelineBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  expect(Math.abs(timelineBox!.x - clipsBox!.x)).toBeLessThan(2);
  expect(Math.abs(timelineBox!.x + timelineBox!.width - (playerBox!.x + playerBox!.width))).toBeLessThan(2);
  await expect(page.getByText("Frame 0 of 100")).toBeVisible();
  await pickName(page, "phase", "VidPhase");
  await expect(page.getByRole("tabpanel").getByRole("paragraph").filter({ hasText: /^VidPhase$/ })).toBeVisible();
  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 100")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByRole("paragraph").filter({ hasText: /^No phase on frame 1$/ })).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "phase", "CLIP_VID")).toMatchObject({ "0": "VidPhase" });
});

test("double-clicking a Vocab triple cell rewrites desk-wide; collision is refused", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await fillTriplet(page, "RenameTool", "RenameAct", "RenameOrg");
  await page.goto("/clips/CLIP_E2E_B");
  await fillTriplet(page, "RenameTool", "RenameAct", "RenameOrg");

  await focusTask(page, "triplet");
  const rowA = page
    .getByRole("table", { name: "Library" })
    .getByRole("button", { name: "RenameTool / RenameAct / RenameOrg", exact: true });
  await rowA.getByText("RenameAct", { exact: true }).dblclick();
  const input = page.getByRole("textbox", { name: "Rename verb" });
  await expect(input).toBeVisible();
  await input.fill("RenamedAct");
  await input.press("Enter");

  const renamedRow = page
    .getByRole("table", { name: "Library" })
    .getByRole("button", { name: "RenameTool / RenamedAct / RenameOrg", exact: true });
  await expect(renamedRow).toBeVisible();

  await expect.poll(async () => {
    const framesB = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (framesB["0"] ?? []).some((r) => r.instrument === "RenameTool" && r.verb === "RenamedAct" && r.target === "RenameOrg");
  }).toBe(true);

  await expect.poll(async () => {
    const framesA = (await clipFrames(page, "triplet", "CLIP_E2E")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (framesA["0"] ?? []).some((r) => r.instrument === "RenameTool" && r.verb === "RenamedAct" && r.target === "RenameOrg");
  }).toBe(true);

  // Collision refusal: add second triple to same frame, then try renaming it to the first
  await fillTriplet(page, "RenameTool", "CollideAct", "RenameOrg");
  const collideRow = page
    .getByRole("table", { name: "Library" })
    .getByRole("button", { name: "RenameTool / CollideAct / RenameOrg", exact: true });
  await collideRow.getByText("CollideAct", { exact: true }).dblclick();
  const collideInput = page.getByRole("textbox", { name: "Rename verb" });
  await expect(collideInput).toBeVisible();
  await collideInput.fill("RenamedAct");
  await collideInput.press("Enter");

  // Duplicate cells are one registry identity now, so the rename is refused as
  // already present (ticket 17) instead of rewriting labels into a collision.
  await expect(page.locator("[data-editor-card='triplet']").getByText(/already present/i)).toBeVisible();

  await expect.poll(async () => {
    const framesB = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (framesB["0"] ?? []).some((r) => r.instrument === "RenameTool" && r.verb === "CollideAct" && r.target === "RenameOrg");
  }).toBe(true);
});

test("span keys and Backspace/Delete are ignored while typing in an input or combobox", async ({ page }) => {
  await clearClipLabels(page);
  await seedClassTags(page.request, { 0: ["grasper"], 1: ["grasper"] });
  await page.goto("/clips/CLIP_E2E");
  const grasperBar = page.getByRole("button", { name: "grasper 0–1" });
  await grasperBar.click({ modifiers: ["Shift"] });
  await expect(grasperBar).toHaveAttribute("data-selected", "true");

  const addName = page.getByRole("textbox", { name: "Add class name" });
  await addName.click();
  await addName.fill("draft");
  for (const key of ["i", "[", "o", "]"]) {
    await addName.press(key);
  }
  await expect(addName).toHaveValue("drafti[o]");
  await expect(page.getByText(/→/)).toHaveCount(0);
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });
  await addName.press("Backspace");
  await expect(addName).toHaveValue("drafti[o");
  await addName.press("Home");
  await addName.press("Delete");
  await expect(addName).toHaveValue("rafti[o");
  await expect(grasperBar).toHaveAttribute("data-selected", "true");
  await addName.press("End");
  await addName.press(" ");
  await expect(addName).toHaveValue("rafti[o ");
  expect(await page.locator("video").evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);

  await focusTask(page, "triplet");
  const instrument = page.getByRole("combobox", { name: "instrument" });
  await instrument.click();
  await instrument.press("[");
  await instrument.press("o");
  await expect(instrument).toHaveValue("[o");
  await expectClassFrames(page, { "0": ["grasper"], "1": ["grasper"] });
  await expect.poll(async () => await clipFrames(page, "triplet")).toEqual({});
});

test("new controls use English copy: Brush, Show lane, Hide lane, Transport", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "class");
  const row = libraryRow(page, "grasper");
  await expect(row.getByRole("button", { name: "Brush", exact: true })).toBeVisible();
  const eye = row.getByRole("button", { name: "Show lane" });
  await expect(eye).toBeVisible();
  await eye.click();
  await expect(row.getByRole("button", { name: "Hide lane" })).toBeVisible();
  await expect(page.locator("[data-paint-chip]")).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByText("Write to span")).toHaveCount(0);
  const transport = page.getByRole("toolbar", { name: "Transport" });
  await expect(transport.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Playback rate" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Mute" })).toBeVisible();
  await expect(transport.getByRole("slider", { name: "Volume" })).toBeVisible();
  await expect(transport.getByRole("button", { name: "Fullscreen" })).toBeVisible();
});

test("e2e closeout: span paint preserves Vocab, Now read-only, Library trash works after span", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");
  await setBrush(page, "class", "CloseoutClass");
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();

  await expect.poll(async () => await clipFrames(page, "class")).toMatchObject({
    "0": expect.arrayContaining(["CloseoutClass"]),
    "1": expect.arrayContaining(["CloseoutClass"]),
  });

  await focusTask(page, "class");
  const libRow = page.getByRole("list", { name: "Library" }).getByRole("button", { name: "CloseoutClass", exact: true });
  await expect(libRow).toBeVisible();

  await expect(page.locator("[data-now]").getByText("CloseoutClass")).toBeVisible();
  await expect(page.locator("[data-now]").getByRole("button", { name: "CloseoutClass" })).toHaveCount(0);

  const trashBtn = page.getByRole("list", { name: "Library" }).getByRole("button", { name: "Delete class tag CloseoutClass" });
  page.once("dialog", (dialog) => dialog.accept());
  await trashBtn.click();

  await expect(libRow).toHaveCount(0);
  // Retirement keeps both Frames' labels; only the picker row goes.
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "class")) as Record<string, string[]>;
    return (frames["0"] ?? []).includes("CloseoutClass") && (frames["1"] ?? []).includes("CloseoutClass");
  }).toBe(true);
});

test("Triplet hairline grid structure and in-cell double-click rename without column shifts", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await focusTask(page, "triplet");

  // Grid headers have divide-x border hairline
  const headerGrid = page.locator('[data-editor-card="triplet"] thead .divide-x');
  await expect(headerGrid).toBeVisible();
  await expect(headerGrid.getByRole("columnheader", { name: "instrument" })).toBeVisible();
  await expect(headerGrid.getByRole("columnheader", { name: "verb" })).toBeVisible();
  await expect(headerGrid.getByRole("columnheader", { name: "target" })).toBeVisible();

  // Add a unique triplet row to inspect cell widths
  await page.getByRole("combobox", { name: "instrument" }).fill("GridTool");
  await page.getByRole("combobox", { name: "verb" }).fill("GridVerb");
  await page.getByRole("combobox", { name: "target" }).fill("GridTarget");
  await page.getByRole("button", { name: "Add triplet row" }).click();

  const library = page.getByRole("table", { name: "Library" });
  const rowBtn = library.getByRole("button", { name: "GridTool / GridVerb / GridTarget", exact: true });
  await expect(rowBtn).toBeVisible();
  await expect(rowBtn).toHaveClass(/divide-x/);

  const rowBoxBefore = await rowBtn.boundingBox();
  expect(rowBoxBefore).not.toBeNull();

  // Measure initial column cell slots before edit
  const instColBefore = await rowBtn.locator("> span").nth(0).boundingBox();
  const targetColBefore = await rowBtn.locator("> span").nth(2).boundingBox();
  expect(instColBefore).not.toBeNull();
  expect(targetColBefore).not.toBeNull();

  // Double click verb cell to trigger in-cell editing
  await rowBtn.getByText("GridVerb", { exact: true }).dblclick();
  const input = page.getByRole("textbox", { name: "Rename verb" });
  await expect(input).toBeVisible();

  // Container and adjacent columns maintaining width without significant column shift (< 4px)
  const editingRow = page.locator('[data-editor-card="triplet"] tbody tr').filter({ has: input });
  const editingContainer = editingRow.locator(".grid.grid-cols-3");
  const rowBoxDuring = await editingContainer.boundingBox();
  expect(rowBoxDuring).not.toBeNull();
  expect(Math.abs(rowBoxDuring!.width - rowBoxBefore!.width)).toBeLessThan(2);

  const instColDuring = await editingContainer.locator("> div").nth(0).boundingBox();
  const targetColDuring = await editingContainer.locator("> div").nth(2).boundingBox();
  expect(instColDuring).not.toBeNull();
  expect(targetColDuring).not.toBeNull();
  expect(Math.abs(instColDuring!.width - instColBefore!.width)).toBeLessThan(4);
  expect(Math.abs(targetColDuring!.width - targetColBefore!.width)).toBeLessThan(4);

  // Commit rename desk-wide
  await input.fill("ShiftVerb");
  await input.press("Enter");
  await expect(input).toHaveCount(0);

  const renamedRow = library.getByRole("button", { name: "GridTool / ShiftVerb / GridTarget", exact: true });
  await expect(renamedRow).toBeVisible();
});

test("Add Vocab inputs inside Library Card footers add items and update count badges", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");

  // 1. Phase footer and count badge
  await focusTask(page, "phase");
  const phaseLibCard = page.locator('[data-editor-card="phase"] [data-card="library"]');
  const phaseBadge = phaseLibCard.locator(".rounded-full.bg-secondary");
  const phaseCountBefore = Number(await phaseBadge.textContent());

  await phaseLibCard.getByPlaceholder("Type to add").fill("FooterPhase");
  await phaseLibCard.getByRole("button", { name: "Add phase name" }).click();
  await expect(phaseLibCard.getByRole("button", { name: "FooterPhase", exact: true })).toBeVisible();
  await expect(phaseBadge).toHaveText(String(phaseCountBefore + 1));

  // 2. Class footer and count badge
  await focusTask(page, "class");
  const classLibCard = page.locator('[data-editor-card="class"] [data-card="library"]');
  const classBadge = classLibCard.locator(".rounded-full.bg-secondary");
  const classCountBefore = Number(await classBadge.textContent());

  await classLibCard.getByPlaceholder("Type to add").fill("FooterClass");
  await classLibCard.getByRole("button", { name: "Add class name" }).click();
  await expect(classLibCard.getByRole("button", { name: "FooterClass", exact: true })).toBeVisible();
  await expect(classBadge).toHaveText(String(classCountBefore + 1));

  // 3. Triplet footer and count badge
  await focusTask(page, "triplet");
  const tripletLibCard = page.locator('[data-editor-card="triplet"] [data-card="library"]');
  const tripletBadge = tripletLibCard.locator(".rounded-full.bg-secondary");
  const tripletCountBefore = Number(await tripletBadge.textContent());

  await tripletLibCard.getByPlaceholder("instrument").fill("FootTool");
  await tripletLibCard.getByPlaceholder("verb").fill("FootAct");
  await tripletLibCard.getByPlaceholder("target").fill("FootOrg");
  await tripletLibCard.getByRole("button", { name: "Add triplet row" }).click();
  await expect(tripletLibCard.getByRole("button", { name: "FootTool / FootAct / FootOrg", exact: true })).toBeVisible();
  await expect(tripletBadge).toHaveText(String(tripletCountBefore + 1));
});

test("calm empty state messages render on unannotated frames across Phase, Class, and Triplet", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");

  await focusTask(page, "phase");
  await expect(page.locator('[data-editor-card="phase"] [data-now]')).toHaveText("No phase on frame 0");

  await focusTask(page, "class");
  await expect(page.locator('[data-editor-card="class"] [data-now]')).toHaveText("No class tags on frame 0");

  await focusTask(page, "triplet");
  await expect(page.locator('[data-editor-card="triplet"] [data-now]')).toHaveText("No triplets on frame 0");
});

test("Library rows render soft semantic tint, checkmark on selection, and dimmed trash across Phase, Class, and Triplet", async ({ page }) => {
  await clearClipLabels(page);
  await page.goto("/clips/CLIP_E2E");

  // Phase selection checkmark & semantic tint & dimmed trash
  await focusTask(page, "phase");
  const phaseLib = page.getByRole("list", { name: "Library" });
  const phaseBtn = phaseLib.getByRole("button").first();
  await expect(phaseBtn).toHaveAttribute("aria-pressed", "false");
  await expect(phaseBtn.locator("[data-checkmark]")).toHaveCount(0);
  await phaseBtn.click();
  await expect(phaseBtn).toHaveAttribute("aria-pressed", "true");
  await expect(phaseBtn.locator("[data-checkmark]")).toBeVisible();
  const phaseBg = await cssBackground(phaseBtn);
  expect(phaseBg).not.toBe("rgba(0, 0, 0, 0)");
  const phaseTrash = phaseLib.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
  await expect(phaseTrash).toHaveClass(/opacity-30/);
  await phaseBtn.click();
  await expect(phaseBtn).toHaveAttribute("aria-pressed", "false");
  await expect(phaseBtn.locator("[data-checkmark]")).toHaveCount(0);

  // Class selection checkmark & semantic tint & dimmed trash
  await focusTask(page, "class");
  const classLib = page.getByRole("list", { name: "Library" });
  const classBtn = classLib.getByRole("button", { name: "grasper", exact: true });
  await expect(classBtn).toHaveAttribute("aria-pressed", "false");
  await expect(classBtn.locator("[data-checkmark]")).toHaveCount(0);
  await classBtn.hover();
  await classBtn.click();
  await expect(classBtn).toHaveAttribute("aria-pressed", "true");
  await expect(classBtn.locator("[data-checkmark]")).toBeVisible();
  const classBg = await cssBackground(classBtn);
  expect(classBg).not.toBe("rgba(0, 0, 0, 0)");
  const classTrash = classLib.getByRole("button", { name: "Delete class tag grasper" });
  await expect(classTrash).toHaveClass(/opacity-30/);
  await classBtn.click();
  await expect(classBtn).toHaveAttribute("aria-pressed", "false");
  await expect(classBtn.locator("[data-checkmark]")).toHaveCount(0);

  // Triplet selection checkmark & semantic tint & dimmed trash
  await focusTask(page, "triplet");
  await page.getByRole("combobox", { name: "instrument" }).fill("SelTool");
  await page.getByRole("combobox", { name: "verb" }).fill("SelVerb");
  await page.getByRole("combobox", { name: "target" }).fill("SelTarget");
  await page.getByRole("button", { name: "Add triplet row" }).click();

  const tripletLib = page.getByRole("table", { name: "Library" });
  const tripletBtn = tripletLib.getByRole("button", { name: "SelTool / SelVerb / SelTarget", exact: true });
  await expect(tripletBtn).toHaveAttribute("aria-pressed", "false");
  await expect(tripletBtn.locator("[data-checkmark]")).toHaveCount(0);
  await tripletBtn.click();
  await expect(tripletBtn).toHaveAttribute("aria-pressed", "true");
  await expect(tripletBtn.locator("[data-checkmark]")).toBeVisible();
  const tripletBg = await cssBackground(tripletBtn);
  expect(tripletBg).not.toBe("rgba(0, 0, 0, 0)");
  const tripletTrash = tripletLib.getByRole("button", { name: "Delete triple SelTool / SelVerb / SelTarget" });
  await expect(tripletTrash).toHaveClass(/opacity-30/);
  await tripletBtn.click();
  await expect(tripletBtn).toHaveAttribute("aria-pressed", "false");
  await expect(tripletBtn.locator("[data-checkmark]")).toHaveCount(0);
});
