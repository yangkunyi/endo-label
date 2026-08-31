import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

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
  const slider = page.getByRole("slider", { name: "Frame index" });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < index; i++) {
    await page.keyboard.press("ArrowRight");
  }
}

async function clipFrames(page: Page, kind: "phase" | "class" | "triplet", clipId = "CLIP_E2E") {
  const response = await page.request.get(`/api/${kind}/${clipId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).frames as Record<string, unknown>;
}

async function pickName(page: Page, ariaLabel: string, name: string) {
  const box = page.getByRole("combobox", { name: ariaLabel });
  await box.fill(name);
  await box.press("Enter");
}

async function fillTriplet(page: Page, instrument: string, verb: string, target: string) {
  await pickName(page, "instrument", instrument);
  await pickName(page, "verb", verb);
  await pickName(page, "target", target);
}

async function openList(page: Page, editor: "class" | "phase" | "triplet") {
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
  await expect(page.getByRole("heading", { name: "class" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "triplet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "phase" })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);

  await page.locator('a[href="/clips/CLIP_E2E"]').click();
  await expect(page).toHaveURL(/\/clips\/CLIP_E2E$/);
  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();
  await expect(page.getByText("Frame 0 of 2")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Frame 0" })).toBeVisible();
});

test("Clip rail has counts, slider scrubs, and no Frame filmstrip", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const rail = page.getByRole("navigation", { name: "Clips" });
  await expect(rail.getByText("CLIP_E2E", { exact: true })).toBeVisible();
  await expect(rail.getByText("2 Frames", { exact: true })).toBeVisible();
  await expect(rail.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Frame index" })).toBeVisible();

  const jpeg = page.getByRole("img", { name: "Frame 0" });
  await expect(jpeg).toBeVisible();
  expect(await jpeg.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");

  await scrubToFrame(page, 1);
  await expect(page.getByText("Frame 1 of 2")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Frame 1" })).toBeVisible();
});

test("Pick+Create writes this Frame and there are no HeroUI tables", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByText("Write to span")).toHaveCount(0);

  await pickName(page, "class", "grasper");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("grasper");
  await expect(page.getByRole("button", { name: "Turn off grasper" })).toBeVisible();

  await pickName(page, "phase", "Preparation");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("Preparation");

  await fillTriplet(page, "grasper", "grasp", "gallbladder");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "grasper");
  }).toBe(true);
});

test("class chip and re-pick toggle off; phase re-pick clears; triplet same triple toggles", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "class", "hook");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("hook");
  await page.getByRole("button", { name: "Turn off hook" }).click();
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

test("empty combobox placeholder is Type to add", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("combobox", { name: "class" })).toHaveAttribute("placeholder", "Type to add");
  await expect(page.getByRole("combobox", { name: "phase" })).toHaveAttribute("placeholder", "Type to add");
  await expect(page.getByRole("combobox", { name: "instrument" })).toHaveAttribute("placeholder", "Type to add");
});

test("playback advances without looping and ignores editable controls", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("img", { name: "Frame 0" })).toBeVisible();

  await page.getByLabel("fps").selectOption("25");
  const skip = page.getByLabel("Skip every N Frames");
  await skip.fill("1");
  await page.reload();
  await expect(page.getByLabel("fps")).toHaveValue("25");
  await expect(page.getByLabel("Skip every N Frames")).toHaveValue("1");

  await page.getByRole("slider", { name: "Frame index" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("img", { name: "Frame 0" })).toBeVisible();

  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("img", { name: "Frame 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("List rename phase and class is desk-wide", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("DeskRenameP1");

  await page.goto("/clips/CLIP_E2E_B");
  await pickName(page, "phase", "DeskRenameP1");
  await expect.poll(async () => (await clipFrames(page, "phase", "CLIP_E2E_B"))["0"]).toBe("DeskRenameP1");

  const phaseCard = await openList(page, "phase");
  await phaseCard.getByRole("button", { name: "DeskRenameP1", exact: true }).dblclick();
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
  await classCard.getByRole("button", { name: "DeskRenameC1", exact: true }).dblclick();
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
  await expect(page.getByLabel("Frame transport")).not.toHaveClass(/stone-/);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByRole("img")).toHaveCount(1);
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
  await page.getByRole("button", { name: "Turn off DeskTrashC" }).click();
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

  await page.locator('[data-editor-card="triplet"]').getByRole("button", { name: "Delete row DeskTrashTool / grasp / gallbladder" }).click();
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskTrashTool");
  }).toBe(false);

  await triplet.getByRole("button", { name: "Delete instrument DeskTrashTool" }).click();
  await expect(page.getByRole("list", { name: "instrument names" }).getByText("DeskTrashTool", { exact: true })).toHaveCount(0);
});
