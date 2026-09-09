import { expect, test } from "@playwright/test";
import { E2E_PASS, E2E_USER } from "./auth";

test("unauthenticated deep link lands on login", async ({ page }) => {
  await page.goto("/clips/CLIP_E2E");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("login opens the desk; logout returns to login; login works again", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username" }).fill(E2E_USER);
  await page.getByLabel("Password").fill(E2E_PASS);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(E2E_USER)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Clips" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await page.getByRole("textbox", { name: "Username" }).fill(E2E_USER);
  await page.getByLabel("Password").fill(E2E_PASS);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("navigation", { name: "Clips" })).toBeVisible();
  await expect(page.getByText(E2E_USER)).toBeVisible();
});
