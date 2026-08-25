import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("clip list then desk shows phase, class, and triplet together", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Clips" })).toBeVisible();
  await expect(
    page.getByText("Open a Clip to label phase, class, and triplet"),
  ).toBeVisible();
  await page.getByRole("link", { name: "CLIP_E2E" }).click();

  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();

  const classHeading = page.getByRole("heading", { name: "class" });
  const tripletHeading = page.getByRole("heading", { name: "triplet" });
  const phaseHeading = page.getByRole("heading", { name: "phase" });
  await expect(classHeading).toBeInViewport();
  await expect(tripletHeading).toBeInViewport();
  await expect(phaseHeading).toBeInViewport();

  await expect(page.getByText("%")).toHaveCount(0);

  const writeSpan = page.getByRole("button", { name: "Write span" });
  await expect(writeSpan).toBeVisible();
  const bg = await writeSpan.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bg).not.toBe("transparent");
});

test("desk is a full-viewport bench: left filmstrip, contained JPEG, no page scroll", async ({
  page,
}) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clips" })).toBeVisible();
  await expect(page.getByText("Frame 0 of 2")).toBeVisible();

  const frame0 = page.getByRole("button", { name: "Frame 0 unlabeled" });
  const frame1 = page.getByRole("button", { name: "Frame 1 unlabeled" });
  const jpeg = page.getByRole("img", { name: "Frame 0" });
  const classHeading = page.getByRole("heading", { name: "class" });
  await expect(frame0).toBeVisible();
  await expect(frame1).toBeVisible();
  await expect(jpeg).toBeVisible();

  const f0 = await frame0.boundingBox();
  const f1 = await frame1.boundingBox();
  const jpegBox = await jpeg.boundingBox();
  const classBox = await classHeading.boundingBox();
  expect(f0).toBeTruthy();
  expect(f1).toBeTruthy();
  expect(jpegBox).toBeTruthy();
  expect(classBox).toBeTruthy();
  expect(f1!.y).toBeGreaterThan(f0!.y);
  expect(f0!.x).toBeLessThan(jpegBox!.x);
  expect(jpegBox!.x).toBeLessThan(classBox!.x);

  expect(await jpeg.evaluate((el) => getComputedStyle(el).objectFit)).toBe(
    "contain",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight + 1,
    ),
  ).toBe(false);

  await frame1.click();
  await expect(page.getByText("Frame 1 of 2")).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 1" })).toBeVisible();
  await expect(frame1).toHaveAttribute("aria-current", "true");

  await page.setViewportSize({ width: 1280, height: 400 });
  await expect(page.getByRole("img", { name: "Frame 1" })).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight + 1,
    ),
  ).toBe(false);
});

test("class chip, phase span, and triplet row write on this Frame", async ({
  page,
}) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page.getByRole("heading", { name: "CLIP_E2E" })).toBeVisible();

  await page.getByRole("button", { name: "grasper", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "grasper", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("This Frame: grasper")).toBeVisible();

  await page.getByRole("button", { name: "Write span" }).click();
  await expect(page.getByText("This Frame: Preparation")).toBeVisible();

  await page.getByRole("button", { name: "Add row" }).click();
  await expect(page.getByText("#1 grasper / grasp / gallbladder")).toBeVisible();
});
