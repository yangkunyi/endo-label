import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";

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

test.beforeEach(async ({ request }) => {
  await ensureVocab(request, {
    phases: ["Preparation", "Clipping and cutting"],
    class_tags: ["grasper", "hook", "clipper", "scissors", "blurred"],
    instruments: ["grasper", "hook", "clipper", "bipolar"],
    verbs: ["grasp", "retract", "cut", "dissect"],
    targets: ["gallbladder", "cystic-duct", "cystic-artery", "omentum"],
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
  await list.getByRole("button", { name, exact: true }).click();
}

async function fillTriplet(page: Page, instrument: string, verb: string, target: string) {
  await focusTask(page, "triplet");
  const library = page.getByRole("table", { name: "Library" });
  const name = `${instrument} / ${verb} / ${target}`;
  const row = library.getByRole("button", { name, exact: true });
  if ((await row.count()) === 0) {
    await page.getByRole("textbox", { name: "instrument" }).fill(instrument);
    await page.getByRole("textbox", { name: "verb" }).fill(verb);
    await page.getByRole("textbox", { name: "target" }).fill(target);
    await page.getByRole("button", { name: "Add triplet row" }).click();
    await expect(row).toBeVisible();
  }
  await row.click();
}

async function openList(page: Page, editor: "class" | "phase" | "triplet") {
  await focusTask(page, editor);
  const card = page.locator(`[data-editor-card="${editor}"]`);
  const button = card.getByRole("button", { name: "List" }).first();
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  return card;
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

test("class chip and re-pick toggle off; phase re-pick clears; triplet same triple toggles", async ({ page }) => {
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
  await expect(page.getByRole("textbox", { name: "instrument" })).toHaveAttribute("placeholder", "instrument");
  await expect(page.getByRole("textbox", { name: "verb" })).toHaveAttribute("placeholder", "verb");
  await expect(page.getByRole("textbox", { name: "target" })).toHaveAttribute("placeholder", "target");
});

test("playback advances without looping; media-chrome owns the transport", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("video[aria-label='Frame 0']")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((el) => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Playback rate/i })).toBeVisible();
  await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);

  await page.locator("video[aria-label='Frame 0']").click();
  await page.keyboard.press("Space");
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("rate menu opens a list including 0.25 on jpeg and video Clips", async ({ page }) => {
  for (const path of ["/clips/CLIP_E2E", "/clips/CLIP_VID"]) {
    await page.goto(path);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
    expect(await video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1);
    const rate = page.getByRole("button", { name: /Playback rate/i });
    await expect(rate).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "0.25x" })).toHaveCount(0);
    await rate.click();
    expect(await video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1);
    await expect(page.getByRole("menuitemradio", { name: "0.25x" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "0.5x" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "1x" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "1.5x" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "2x" })).toBeVisible();
  }
});

test("jpeg player shows media-chrome transport and Frame print", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("region", { name: "Player" })).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  await expect(page.locator("media-control-bar")).toBeVisible();
  await expect(page.locator("media-play-button")).toBeVisible();
  await expect(page.locator("[data-player-clock]")).toHaveCount(0);
  await expect(page.getByLabel("Player controls").locator("media-control-bar")).toHaveCount(0);
  await expect(page.getByLabel("Player controls").getByText("Frame 0 of 2")).toBeVisible();
  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.locator("video[aria-label='Frame 1']")).toBeVisible();
});

test("List rename phase and class is desk-wide", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("DeskRenameP1");

  await page.goto("/clips/CLIP_E2E_B");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase", "CLIP_E2E_B"))["0"]).toBe("DeskRenameP1");

  const phaseCard = await openList(page, "phase");
  await phaseCard.getByRole("list", { name: "phase names" }).getByRole("button", { name: "DeskRenameP1", exact: true }).dblclick();
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
  const classCard = await openList(page, "class");
  await classCard.getByRole("list", { name: "class names" }).getByRole("button", { name: "DeskRenameC1", exact: true }).dblclick();
  const renameClass = page.getByLabel("Rename class tag");
  await renameClass.fill("DeskRenameC2");
  await renameClass.press("Enter");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("DeskRenameC2");
  const vocab = await (await page.request.get("/api/vocab")).json();
  expect(vocab.class_tags).toContain("DeskRenameC2");
  expect(vocab.instruments).toContain("grasper");
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

test("trash vs x: chip is this Frame, List trash removes the desk name", async ({ page }) => {
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

  const phaseCard = await openList(page, "phase");
  await phaseCard.getByRole("button", { name: "Delete phase DeskTrashP" }).click();
  await expect.poll(async () => await clipFrames(page, "phase")).not.toMatchObject({ "1": "DeskTrashP" });

  const classCard = await openList(page, "class");
  await classCard.getByRole("button", { name: "Delete class tag DeskTrashC" }).click();
  await expect.poll(async () => (((await clipFrames(page, "class"))["1"] as string[]) ?? []).includes("DeskTrashC")).toBe(false);
});

test("trashing an instrument in use is refused until the row is gone", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await fillTriplet(page, "DeskTrashTool", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(true);

  const triplet = await openList(page, "triplet");
  await triplet.getByRole("button", { name: "Delete instrument DeskTrashTool" }).click();
  await expect(page.getByText(/in use: DeskTrashTool/i)).toBeVisible();
  const vocabBefore = await (await page.request.get("/api/vocab")).json();
  expect(vocabBefore.instruments).toContain("DeskTrashTool");

  await fillTriplet(page, "DeskTrashTool", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(false);

  await triplet.getByRole("button", { name: "Delete instrument DeskTrashTool" }).click();
  await expect(page.getByRole("list", { name: "instrument names" }).getByText("DeskTrashTool", { exact: true })).toHaveCount(0);
});

test("no chip: Mark from and Apply do nothing", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("[data-paint-chip]")).toHaveText("No paint chip");
  await expect(page.getByRole("button", { name: "Mark from" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Apply to frames/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Remove from frames/ })).toBeDisabled();
  const before = await clipFrames(page, "class");
  await page.keyboard.press("]");
  await expect.poll(async () => await clipFrames(page, "class")).toEqual(before);
  await expect(page.getByText("Write to span")).toHaveCount(0);
  await expect(page.getByText("span mode", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
});

test("chip, Mark from, Apply writes range, toast, chip stays", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "class", "clipper");
  await expect(page.locator("[data-paint-chip]")).toHaveText("class: clipper");
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
  await expect(page.getByRole("button", { name: "clipper 0–1" })).toBeVisible();
  await expect(page.locator("[data-lane-head]").filter({ hasText: "clipper" })).toHaveCount(1);
  await expect(page.locator("[data-paint-chip]")).toHaveText("class: clipper");
  await expect(page.getByText("0 → 0")).toHaveCount(0);
});

test("] applies; Remove without Mark from is this Frame", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "ChipApplyP");
  await expect(page.locator("[data-paint-chip]")).toHaveText("phase: ChipApplyP");
  await page.keyboard.press("[");
  await scrubToFrame(page, 1);
  await page.keyboard.press("]");
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "ChipApplyP", "1": "ChipApplyP" });
  await expect(page.getByRole("button", { name: "ChipApplyP 0–1" })).toBeVisible();
  await page.getByRole("button", { name: "Remove from frames 1–1" }).click();
  await expect.poll(async () => (await clipFrames(page, "phase"))["1"]).toBeUndefined();
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("ChipApplyP");
  await expect(page.getByRole("button", { name: "ChipApplyP 0–0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ChipApplyP 0–1" })).toHaveCount(0);
});

test("i/o/[ paint a span onto the timeline while the player is focused", async ({ page }) => {
  await page.request.put("/api/phase/CLIP_E2E/frames/0", { data: { phase: null } });
  await page.request.put("/api/phase/CLIP_E2E/frames/1", { data: { phase: null } });
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "ChipApplyP");
  await expect(page.locator("[data-paint-chip]")).toHaveText("phase: ChipApplyP");
  await page.locator("video").click();
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
  await expect(page.getByRole("button", { name: "ChipApplyP 0–1" })).toBeVisible();
  await expect(page.locator("[data-lane-head]").filter({ hasText: "ChipApplyP" })).toHaveCount(1);
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

test("timeline folds span, click seeks, focus rebuilds", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "BandPhase");
  await page.getByRole("button", { name: "Mark from" }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("button", { name: "Apply to frames 0–1" }).click();
  await expect(page.getByText("Wrote phase: BandPhase on frames 0–1")).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "BandPhase", "1": "BandPhase" });
  await expect(page.getByRole("button", { name: "BandPhase 0–1" })).toBeVisible();
  await expect(page.locator("[data-lane-head]").filter({ hasText: "BandPhase" })).toHaveCount(1);
  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "BandPhase 0–1" }).click();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
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
  await expect(page.locator("[data-paint-chip]")).toHaveAttribute("data-label-color", colorB!);
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
  await expect(classNow.getByText("none")).toBeVisible();
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
  await expect(classNow.getByText("none")).toBeVisible();
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
  await expect(phaseNow).toHaveText("unlabeled");
  expect(await cssBackground(phaseNow)).not.toBe(phaseFill);

  await fillTriplet(page, "FillTool", "FillAct", "FillOrg");
  const tripletNow = page.locator('[data-editor-card="triplet"] [data-now] tbody tr').first();
  await expect(tripletNow).toContainText("FillTool");
  const tripletBar = page.getByRole("button", { name: "FillTool / FillAct / FillOrg 0–0" });
  await expect(tripletBar).toBeVisible();
  const tripletFill = await cssBackground(tripletNow.locator("td").first());
  expect(tripletFill).toBe(await cssBackground(tripletBar));
  expect(
    await cssBackground(
      page.getByRole("table", { name: "Library" }).getByRole("button", { name: "FillTool / FillAct / FillOrg", exact: true }),
    ),
  ).not.toBe(tripletFill);
  await fillTriplet(page, "FillTool", "FillAct", "FillOrg");
  await expect(page.locator('[data-editor-card="triplet"] [data-now] tbody tr')).toHaveCount(0);
});

test("timeline playhead drags frame-snapped; bars are display-only", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toBeVisible();
  const player = page.getByRole("region", { name: "Player", exact: true });
  await expect(page.locator('[role="region"][aria-label="Editors"] [data-timeline]')).toHaveCount(0);
  await expect(player.locator("[data-timeline]")).toHaveCount(0);
  const playerBox = await player.boundingBox();
  const timelineBox = await timeline.boundingBox();
  expect(playerBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(timelineBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  expect(Math.abs(timelineBox!.width - playerBox!.width)).toBeLessThan(2);
  const video = page.locator("video");
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  const playhead = page.locator("[data-playhead]");
  await expect(playhead).toBeVisible();
  const box = await page.locator("[data-timeline-track]").boundingBox();
  expect(box).not.toBeNull();
  const grabPlayhead = async () => {
    const playheadBox = await playhead.boundingBox();
    expect(playheadBox).not.toBeNull();
    await page.mouse.move(playheadBox!.x + playheadBox!.width / 2, playheadBox!.y + playheadBox!.height / 2);
  };
  // drag playhead to ~90%: frame 1 of 2
  await grabPlayhead();
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.9, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  // drag back to ~10%: frame 0
  await grabPlayhead();
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  // bars are display-only: dragging a bar must not move the playhead to the mouse x
  await pickName(page, "phase", "DragPhase");
  await page.getByRole("button", { name: "Mark from" }).click();
  await page.getByRole("button", { name: "Apply to frames 0–0" }).click();
  const bar = page.getByRole("button", { name: "DragPhase 0–0" });
  await expect(bar).toBeVisible();
  await expect(bar).not.toHaveAttribute("draggable", "true");
  const barBox = await bar.boundingBox();
  expect(barBox).not.toBeNull();
  await page.mouse.move(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.9, barBox!.y + barBox!.height / 2);
  await page.mouse.up();
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
  await page.getByRole("textbox", { name: "instrument" }).fill("RowTool");
  await page.getByRole("textbox", { name: "verb" }).fill("RowAct");
  await page.getByRole("textbox", { name: "target" }).fill("RowOrg");
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
  await page.getByRole("textbox", { name: "instrument" }).fill("FocusTool");
  await page.getByRole("textbox", { name: "verb" }).fill("FocusAct");
  await page.getByRole("textbox", { name: "target" }).fill("FocusOrg");
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const row = page.getByRole("table", { name: "Library" }).getByRole("button", { name: "FocusTool / FocusAct / FocusOrg", exact: true });
  await expect(row).toBeVisible();
  await focusTask(page, "phase");
  await focusTask(page, "triplet");
  await expect(row).toBeVisible();
});

test("video Clip uses video element and seek updates Now", async ({ page }) => {
  await page.goto("/clips/CLIP_VID");
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("img")).toHaveCount(0);
  await expect(page.locator("media-control-bar")).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByLabel("Player controls").getByRole("slider")).toHaveCount(0);
  const player = page.getByRole("region", { name: "Player", exact: true });
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toBeVisible();
  await expect(page.locator("[data-playhead]")).toBeVisible();
  const playerBox = await player.boundingBox();
  const timelineBox = await timeline.boundingBox();
  expect(playerBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(timelineBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();
  await pickName(page, "phase", "VidPhase");
  await expect(page.getByRole("tabpanel").getByRole("paragraph").filter({ hasText: /^VidPhase$/ })).toBeVisible();
  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByRole("paragraph").filter({ hasText: /^unlabeled$/ })).toBeVisible();
  await expect.poll(async () => await clipFrames(page, "phase", "CLIP_VID")).toMatchObject({ "0": "VidPhase" });
});
