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

  const writeSpan = page.getByRole("button", { name: "Write span" });
  await expect(writeSpan).toBeVisible();
  const bg = await writeSpan.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bg).not.toBe("transparent");
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
