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
