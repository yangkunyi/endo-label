import { expect, type Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

async function fillTripletDraft(page: Page, instrument: string, verb: string, target: string) {
  await page.getByRole("button", { name: "Add triplet row" }).click();
  const draft = page.getByRole("grid", { name: "triplet" }).getByRole("row").last();
  await draft.getByLabel("instrument").fill(instrument);
  await draft.getByLabel("instrument").press("Enter");
  await draft.getByLabel("verb").fill(verb);
  await draft.getByLabel("verb").press("Enter");
  await draft.getByLabel("target").fill(target);
  await draft.getByLabel("target").press("Enter");
}

async function spanFrom0To1(page: Page) {
  const hud = page.getByLabel("Span HUD");
  await scrubToFrame(page, 0);
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(hud).toContainText("from Frame 0");
  await scrubToFrame(page, 1);
  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("]");
  await expect(hud).not.toContainText("from Frame 0");
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

test("HeroUI tables stay open and write this Frame", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "class" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "triplet" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "phase" })).toBeVisible();
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByText("Arm phase span")).toHaveCount(0);
  await expect(page.getByText("operation on")).toHaveCount(0);

  await page.getByRole("grid", { name: "class" }).getByText("grasper", { exact: true }).click();
  await expect(page.getByLabel("Span HUD")).toContainText("class: grasper");

  await page.getByRole("grid", { name: "phase" }).getByText("Preparation", { exact: true }).click();
  await expect(page.getByLabel("Span HUD")).toContainText("phase: Preparation");

  await page.getByRole("button", { name: "Add triplet row" }).click();
  const draft = page.getByRole("grid", { name: "triplet" }).getByRole("row").last();
  await draft.getByLabel("instrument").fill("grasper");
  await draft.getByLabel("instrument").press("Enter");
  await draft.getByLabel("verb").fill("grasp");
  await draft.getByLabel("verb").press("Enter");
  await draft.getByLabel("target").fill("gallbladder");
  await draft.getByLabel("target").press("Enter");
  await expect(page.getByRole("grid", { name: "triplet" }).getByLabel("instrument")).toHaveValue("grasper");
});

test("tables do not fold and there is no Arm control", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("grid", { name: "class" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "triplet" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "phase" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add class tag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add triplet row" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add phase" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write span" })).toHaveCount(0);
  await expect(page.getByText("Arm class span")).toHaveCount(0);

  await scrubToFrame(page, 1);
  await expect(page.getByRole("grid", { name: "class" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "triplet" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "phase" })).toBeVisible();
});

test("phase span keys paint an inclusive range and ignore editable controls", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const phase = page.locator('[data-editor-card="phase"]');
  await expect(phase).toBeVisible();
  await expect(phase.locator('input[type="number"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Add phase" }).click();
  const nameInput = page.getByLabel("New phase name");
  await nameInput.focus();
  await page.keyboard.press("[");
  await page.keyboard.press("]");
  await expect(page.getByText(/from Frame/)).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel new phase" }).click();

  await page.getByRole("grid", { name: "phase" }).getByText("Preparation", { exact: true }).click();
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(page.getByText(/from Frame 0/)).toBeVisible();
  await scrubToFrame(page, 1);
  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("]");
  await expect(page.getByLabel("Span HUD")).toContainText("phase: Preparation");
});

test("class span paints selected tags across an inclusive range", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const classTable = page.getByRole("grid", { name: "class" });
  await classTable.getByText("hook", { exact: true }).click();
  await expect(page.getByLabel("Span HUD")).toContainText("class: hook");
  await expect(page.getByText("Arm class span")).toHaveCount(0);

  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(page.getByLabel("Span HUD")).toContainText("from Frame 0");
  await scrubToFrame(page, 1);
  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("]");
  await expect(page.getByLabel("Span HUD")).toContainText("class: hook");
});

test("triplet span uses selected complete rows and ignores incomplete drafts", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const triplet = page.getByRole("grid", { name: "triplet" });
  await triplet.getByRole("row").nth(1).getByRole("gridcell").first().click();
  await expect(page.getByLabel("Span HUD")).toContainText("triplet: grasper / grasp / gallbladder");

  await page.getByRole("button", { name: "Add triplet row" }).click();
  await expect(page.getByLabel("Span HUD")).not.toContainText("incomplete");
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(page.getByLabel("Span HUD")).toContainText("from Frame 0");
});

test("HUD toggles Write to span and Remove from span", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const hud = page.getByLabel("Span HUD");
  await expect(hud.getByRole("button", { name: "Write to span" })).toBeVisible();
  await expect(hud.getByRole("button", { name: "Remove from span" })).toBeVisible();
  await expect(hud.getByRole("button", { name: "Write to span" })).toHaveAttribute("aria-pressed", "true");
  await expect(hud.getByRole("button", { name: "Remove from span" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("grid", { name: "phase" }).getByText("Preparation", { exact: true }).click();
  await expect(hud).toContainText("phase: Preparation");
  await hud.getByRole("button", { name: "Remove from span" }).click();
  await expect(hud.getByRole("button", { name: "Remove from span" })).toHaveAttribute("aria-pressed", "true");
  await expect(hud.getByRole("button", { name: "Write to span" })).toHaveAttribute("aria-pressed", "false");
  await expect(hud).toContainText("phase: Preparation");
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByText("operation on")).toHaveCount(0);
  await expect(page.getByText("operation off")).toHaveCount(0);
});

test("Remove from span paints each kind with [ and ]", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const hud = page.getByLabel("Span HUD");
  await hud.getByRole("button", { name: "Write to span" }).click();
  await page.getByRole("grid", { name: "phase" }).getByText("Preparation", { exact: true }).click();
  const classTable = page.getByRole("grid", { name: "class" });
  if (!(await hud.innerText()).includes("class: clipper")) {
    await classTable.getByText("clipper", { exact: true }).click();
  }
  const triplet = page.getByRole("grid", { name: "triplet" });
  if (await triplet.getByRole("row").count() < 2) {
    await page.getByRole("button", { name: "Add triplet row" }).click();
    const draft = triplet.getByRole("row").last();
    await draft.getByLabel("instrument").fill("bipolar");
    await draft.getByLabel("instrument").press("Enter");
    await draft.getByLabel("verb").fill("cut");
    await draft.getByLabel("verb").press("Enter");
    await draft.getByLabel("target").fill("cystic-artery");
    await draft.getByLabel("target").press("Enter");
  }
  await triplet.getByRole("row").nth(1).getByRole("gridcell").first().click();
  await page.getByRole("button", { name: "Add triplet row" }).click();
  await expect(hud).not.toContainText("incomplete");
  await expect(hud).toContainText("phase: Preparation");
  await expect(hud).toContainText("class: clipper");
  await expect(hud).toContainText("triplet:");
  const tripletLabel = (await hud.innerText()).match(/triplet: [^·]+/)?.[0] ?? "";
  expect(tripletLabel).toMatch(/triplet: \S+ \/ \S+ \/ \S+/);

  await spanFrom0To1(page);
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({
    "0": "Preparation",
    "1": "Preparation",
  });
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("clipper");
  await expect.poll(async () => ((await clipFrames(page, "class"))["1"] as string[]) ?? []).toContain("clipper");

  await hud.getByRole("button", { name: "Remove from span" }).click();
  await expect(hud.getByRole("button", { name: "Remove from span" })).toHaveAttribute("aria-pressed", "true");
  await scrubToFrame(page, 0);
  await triplet.getByRole("row").nth(1).getByRole("gridcell").first().click();
  await expect(hud).toContainText("phase: Preparation");
  await expect(hud).toContainText("class: clipper");
  await expect(hud).toContainText("triplet:");
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(hud).toContainText("from Frame 0");
  await scrubToFrame(page, 1);
  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("]");
  await expect(hud).not.toContainText("from Frame 0");

  await expect.poll(async () => await clipFrames(page, "phase")).toEqual({});
  await expect.poll(async () => (((await clipFrames(page, "class"))["0"] as string[]) ?? []).includes("clipper")).toBe(false);
  await expect.poll(async () => (((await clipFrames(page, "class"))["1"] as string[]) ?? []).includes("clipper")).toBe(false);
  const [instrument, verb, target] = tripletLabel.replace("triplet: ", "").split(" / ").map((part) => part.trim());
  await expect.poll(async () => {
    const frames = await clipFrames(page, "triplet") as Record<string, { instrument: string; verb: string; target: string }[]>;
    return [...(frames["0"] ?? []), ...(frames["1"] ?? [])].some(
      (row) => row.instrument === instrument && row.verb === verb && row.target === target,
    );
  }).toBe(false);
});

test("Remove ] without [ clears this Frame only", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  const hud = page.getByLabel("Span HUD");
  await hud.getByRole("button", { name: "Write to span" }).click();
  await page.getByRole("grid", { name: "phase" }).getByText("Clipping and cutting", { exact: true }).click();
  await spanFrom0To1(page);
  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({
    "0": "Clipping and cutting",
    "1": "Clipping and cutting",
  });

  await hud.getByRole("button", { name: "Remove from span" }).click();
  await scrubToFrame(page, 0);
  await page.getByRole("button", { name: "Clear Clipping and cutting" }).click();
  await page.getByRole("grid", { name: "phase" }).getByText("Clipping and cutting", { exact: true }).click();
  for (const name of ["grasper", "hook", "clipper", "scissors", "blurred"]) {
    await page.getByRole("grid", { name: "class" }).getByRole("button", { name: `Turn off ${name}` }).click();
  }
  await page.getByRole("img", { name: "Frame 0" }).click();
  await expect(hud).toContainText("phase: Clipping and cutting");
  await expect(hud).not.toContainText("from Frame");
  await page.keyboard.press("]");
  await expect.poll(async () => await clipFrames(page, "phase")).toEqual({
    "1": "Clipping and cutting",
  });
});

test("playback advances without looping and ignores editable controls", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("img", { name: "Frame 0" })).toBeVisible();

  await page.getByRole("button", { name: "1 fps" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  const skip = page.getByLabel("Skip every N Frames");
  await skip.fill("1");
  await page.reload();
  await expect(page.getByRole("button", { name: "25 fps" })).toBeVisible();
  await expect(page.getByLabel("Skip every N Frames")).toHaveValue("1");

  await page.getByRole("slider", { name: "Frame index" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("img", { name: "Frame 0" })).toBeVisible();

  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("img", { name: "Frame 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("double-click phase name renames every Clip", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await page.getByRole("grid", { name: "class" }).getByText("scissors", { exact: true }).click();
  await page.getByRole("button", { name: "Add phase" }).click();
  const newPhase = page.getByLabel("New phase name");
  await newPhase.fill("DeskRenameP1");
  await newPhase.press("Enter");
  await expect.poll(async () => (await clipFrames(page, "phase"))["0"]).toBe("DeskRenameP1");

  await page.goto("/clips/CLIP_E2E_B");
  await page.getByRole("grid", { name: "phase" }).getByText("DeskRenameP1", { exact: true }).click();
  await expect.poll(async () => (await clipFrames(page, "phase", "CLIP_E2E_B"))["0"]).toBe("DeskRenameP1");

  await page.getByRole("grid", { name: "phase" }).getByText("DeskRenameP1", { exact: true }).dblclick();
  const rename = page.getByLabel("Rename phase");
  await expect(rename).toBeVisible();
  await rename.fill("DeskRenameP2");
  await rename.press("Enter");
  await expect(page.getByRole("grid", { name: "phase" }).getByText("DeskRenameP2", { exact: true })).toBeVisible();
  await expect(page.getByRole("grid", { name: "phase" }).getByText("DeskRenameP1", { exact: true })).toHaveCount(0);

  await expect.poll(async () => await clipFrames(page, "phase")).toMatchObject({ "0": "DeskRenameP2" });
  await expect.poll(async () => await clipFrames(page, "phase", "CLIP_E2E_B")).toMatchObject({ "0": "DeskRenameP2" });
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("scissors");
});

test("double-click class tag renames class Clips and leaves triplet instruments", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await page.getByRole("button", { name: "Add class tag" }).click();
  const newTag = page.getByRole("textbox", { name: "New class tag" });
  await newTag.fill("DeskRenameC1");
  await newTag.press("Enter");
  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("DeskRenameC1");

  await fillTripletDraft(page, "grasper", "retract", "gallbladder");
  await page.goto("/clips/CLIP_E2E_B");
  await page.getByRole("grid", { name: "class" }).getByText("DeskRenameC1", { exact: true }).click();
  await expect.poll(async () => ((await clipFrames(page, "class", "CLIP_E2E_B"))["0"] as string[]) ?? []).toContain("DeskRenameC1");

  await page.getByRole("grid", { name: "class" }).getByText("DeskRenameC1", { exact: true }).dblclick();
  const rename = page.getByLabel("Rename class tag");
  await expect(rename).toBeVisible();
  await rename.fill("DeskRenameC2");
  await rename.press("Enter");
  await expect(page.getByRole("grid", { name: "class" }).getByText("DeskRenameC2", { exact: true })).toBeVisible();
  await expect(page.getByRole("grid", { name: "class" }).getByText("DeskRenameC1", { exact: true })).toHaveCount(0);

  await expect.poll(async () => ((await clipFrames(page, "class"))["0"] as string[]) ?? []).toContain("DeskRenameC2");
  await expect.poll(async () => ((await clipFrames(page, "class", "CLIP_E2E_B"))["0"] as string[]) ?? []).toContain("DeskRenameC2");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "grasper");
  }).toBe(true);
  const vocab = await (await page.request.get("/api/vocab")).json();
  expect(vocab.class_tags).toContain("DeskRenameC2");
  expect(vocab.class_tags).not.toContain("DeskRenameC1");
  expect(vocab.instruments).toContain("grasper");
});

test("dark compact sitting: rail, HUD recipe, slider fill, triplet inputs", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /light mode|dark mode|theme/i })).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveClass(/stone-/);
  await expect(page.getByLabel("Frame transport")).not.toHaveClass(/stone-/);
  await expect(page.getByText("Arm class span")).toHaveCount(0);
  await expect(page.getByRole("img")).toHaveCount(1);

  const editors = page.getByRole("region", { name: "Editors" });
  await expect(editors).toBeVisible();
  const railBox = await editors.boundingBox();
  expect(railBox?.width).toBeGreaterThanOrEqual(260);
  expect(railBox?.width).toBeLessThanOrEqual(300);

  const hud = page.getByLabel("Span HUD");
  await expect(hud).toContainText("Select labels → [ → scrub → ]");
  await expect(hud.getByRole("button", { name: "Write to span" })).toBeVisible();
  await expect(hud.getByRole("button", { name: "Remove from span" })).toBeVisible();

  await page.getByRole("button", { name: "Add phase" }).click();
  const newPhase = page.getByLabel("New phase name");
  await newPhase.fill("DarkPayloadPhase");
  await newPhase.press("Enter");
  const onFrameRow = page.getByRole("grid", { name: "phase" }).getByRole("row").filter({ hasText: "DarkPayloadPhase" });
  await expect(onFrameRow).toHaveAttribute("aria-selected", "true");
  const onFrameBg = await onFrameRow.locator("td").first().evaluate((el) => getComputedStyle(el).backgroundColor);

  await scrubToFrame(page, 1);
  const otherRow = page.getByRole("grid", { name: "phase" }).getByRole("row").filter({ hasText: "DarkPayloadPhase" });
  if ((await otherRow.getAttribute("aria-selected")) === "true") {
    await page.getByRole("button", { name: "Clear DarkPayloadPhase" }).click();
  }
  await scrubToFrame(page, 0);
  await expect(onFrameRow).toHaveAttribute("aria-selected", "true");
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("[");
  await expect(hud).toContainText("DarkPayloadPhase");
  await expect(hud).toContainText("from Frame 0");

  await scrubToFrame(page, 1);
  await expect(otherRow).toHaveAttribute("aria-selected", "false");
  await expect(otherRow).toHaveAttribute("data-span-payload", "true");
  const payloadBg = await otherRow.locator("td").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(payloadBg).not.toBe(onFrameBg);

  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("]");
  await expect(hud).not.toContainText("from Frame 0");

  await page.getByRole("button", { name: "Add triplet row" }).click();
  const tripletGrid = page.getByRole("grid", { name: "triplet" });
  const draft = tripletGrid.getByRole("row").last();
  await expect(draft.getByLabel("instrument")).toHaveAttribute("list");
  await expect(draft.getByLabel("verb")).toHaveAttribute("list");
  await expect(draft.getByLabel("target")).toHaveAttribute("list");
  await expect(tripletGrid.locator("[data-slot='combo-box']")).toHaveCount(0);
  const overflow = await tripletGrid.evaluate((el) => {
    const scroller = (el.closest("[class*='scroll']") ?? el.parentElement ?? el) as HTMLElement;
    const rail = el.closest('[aria-label="Editors"]') as HTMLElement | null;
    return { scrollWidth: scroller.scrollWidth, railWidth: rail?.getBoundingClientRect().width ?? 0 };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.railWidth);
  await draft.getByLabel("instrument").fill("hook");
  await draft.getByLabel("instrument").press("Enter");
  await draft.getByLabel("verb").fill("cut");
  await draft.getByLabel("verb").press("Enter");
  await draft.getByLabel("target").fill("cystic-duct");
  await draft.getByLabel("target").press("Enter");

  await hud.getByRole("button", { name: "Write to span" }).click();
  await page.getByRole("grid", { name: "phase" }).getByText("DarkPayloadPhase", { exact: true }).click();
  await scrubToFrame(page, 1);
  await page.getByRole("img", { name: "Frame 1" }).click();
  await page.keyboard.press("i");
  await expect(hud).toContainText("from Frame 1");
  await scrubToFrame(page, 0);
  const fill = page.locator("[data-span-fill]");
  const track = page.locator("[data-slot='slider-track']");
  const fillBox = await fill.boundingBox();
  const trackBox = await track.boundingBox();
  expect(fillBox).toBeTruthy();
  expect(trackBox).toBeTruthy();
  expect(fillBox!.width).toBeGreaterThan(trackBox!.width * 0.7);
  await page.getByRole("img", { name: "Frame 0" }).click();
  await page.keyboard.press("o");
  await expect(hud).not.toContainText("from Frame 1");
});

test("triplet cell edit changes this row on this Frame only", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await fillTripletDraft(page, "DeskRenameTool", "DeskRenameVerb", "DeskRenameTarget");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (frames["0"] ?? []).some(
      (row) => row.instrument === "DeskRenameTool" && row.verb === "DeskRenameVerb" && row.target === "DeskRenameTarget",
    );
  }).toBe(true);

  await scrubToFrame(page, 1);
  await fillTripletDraft(page, "DeskRenameTool", "DeskRenameVerb", "DeskRenameTarget");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["1"] ?? []).some((row) => row.instrument === "DeskRenameTool");
  }).toBe(true);

  await page.goto("/clips/CLIP_E2E_B");
  await fillTripletDraft(page, "DeskRenameTool", "DeskRenameVerb", "DeskRenameTarget");
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskRenameTool");
  }).toBe(true);

  await page.goto("/clips/CLIP_E2E");
  await scrubToFrame(page, 0);
  const instruments = page.getByRole("grid", { name: "triplet" }).getByLabel("instrument");
  const count = await instruments.count();
  let edited = false;
  for (let i = 0; i < count; i++) {
    if ((await instruments.nth(i).inputValue()) === "DeskRenameTool") {
      await instruments.nth(i).dblclick();
      await instruments.nth(i).fill("bipolar");
      await instruments.nth(i).press("Enter");
      edited = true;
      break;
    }
  }
  expect(edited).toBe(true);

  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string; verb: string; target: string }[]>;
    return (frames["0"] ?? []).some(
      (row) => row.instrument === "bipolar" && row.verb === "DeskRenameVerb" && row.target === "DeskRenameTarget",
    );
  }).toBe(true);
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet")) as Record<string, { instrument: string }[]>;
    return (frames["1"] ?? []).some((row) => row.instrument === "DeskRenameTool");
  }).toBe(true);
  await expect.poll(async () => {
    const frames = (await clipFrames(page, "triplet", "CLIP_E2E_B")) as Record<string, { instrument: string }[]>;
    return (frames["0"] ?? []).some((row) => row.instrument === "DeskRenameTool");
  }).toBe(true);
});
