import { expect, type APIRequestContext, type Page, test } from "@playwright/test";
import { loginApi } from "./auth";
import { ANNOTATOR, assign, ensureAccount, loginAs, resetItems } from "./harness";
import { CLIP_FILTERS_STORAGE_KEY } from "../src/clipFilters";

/**
 * The Clips directory and the desk's Clip rail (ticket pilot-ux/08).
 *
 * The server decides whose Clips these are: an Account only ever gets the
 * Clips it holds an Assignment on, and `all` is refused for anyone but an
 * admin. The page's filters (Project, tag, scope) are stored, so the rail —
 * which reads the same selection — lists exactly what the page lists. A stored
 * value the server would refuse is corrected before it is asked with
 * (pilot-ux/13): the browser outlives an admin flag, and neither surface may
 * answer with a refusal sentence over a list nobody can fix.
 *
 * The correction is the selection the surfaces ask with and the entry the browser
 * keeps (pilot-ux/17); the sentence about a dropped field belongs to the stored
 * value, which stays in the reader's hands until their own change replaces it
 * (pilot-ux/19), so it is read on the page rather than flashed for the one commit
 * that writes the entry. A change patches the selection in force at the moment it
 * is applied, field by field (pilot-ux/23, pilot-ux/24): while `/api/me` is still
 * in flight only `scope` is unproved, so a Project or tag pick keeps the reader's
 * stored `scope` — an admin's `all` — and cannot write the read's narrowing back
 * over it, while a Project or tag a loaded option list proved dead does not
 * survive the pick either, so the sentence after the answer names nothing the
 * surface did not show.
 */

test.describe.configure({ mode: "serial" });

const REFUSAL = "Only an admin can see every Clip.";

const listedClips = (page: Page) => page.locator('main a[href^="/clips/"]');

const railClips = (page: Page) =>
  page.getByRole("navigation", { name: "Clips" }).locator('a[href^="/clips/"]');

/** The stored selection's scope, as this browser holds it right now. */
const storedScope = (page: Page): Promise<string | null> =>
  page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "null")?.scope ?? null,
    CLIP_FILTERS_STORAGE_KEY,
  );

/**
 * A stored selection this Account may not hold, kept in place across every
 * navigation — what a shared browser, or an Account that lost its admin flag,
 * leaves behind.
 */
async function storeScopeOnEveryLoad(page: Page, scope: string): Promise<void> {
  await page.addInitScript(
    ([key, value]: [string, string]) => window.localStorage.setItem(key, value),
    [
      CLIP_FILTERS_STORAGE_KEY,
      JSON.stringify({ project: "", tag: "", scope }),
    ] as [string, string],
  );
}

async function tagClip(
  request: APIRequestContext,
  clipId: string,
  tags: string[],
): Promise<void> {
  const response = await request.put(`/api/clips/${encodeURIComponent(clipId)}/tags`, {
    data: { tags },
  });
  expect(response.ok(), `tag ${clipId}: ${response.status()}`).toBeTruthy();
}

test("the admin starts on their own Clips and may switch to every Clip", async ({ page }) => {
  await loginApi(page.request);
  await resetItems(page.request);

  await page.goto("/clips");
  await expect(page.getByRole("heading", { name: "Clips" })).toBeVisible();
  // Assigned to nobody, so the admin's own Clips are none of them.
  await expect(page.getByText("No Clips assigned to you.")).toBeVisible();
  const everyClip = page.getByLabel("Show every Clip");
  await expect(everyClip).not.toBeChecked();

  await everyClip.check();
  await expect(listedClips(page)).toHaveCount(3);
  await expect(page.getByText("No Clips assigned to you.")).toHaveCount(0);

  // The choice is the browser's, so it is still there after a reload.
  await page.reload();
  await expect(page.getByLabel("Show every Clip")).toBeChecked();
  await expect(listedClips(page)).toHaveCount(3);

  // …and the desk's rail reads the same scope, so it lists the same Clips.
  await page.goto("/clips/CLIP_E2E");
  await expect(railClips(page)).toHaveCount(3);
});

test("an annotator sees only the Clip they hold, and the rail agrees with the page", async ({
  page,
}) => {
  await loginApi(page.request);
  await resetItems(page.request);
  await ensureAccount(page.request, ANNOTATOR, { annotator: true });
  await assign(page.request, "CLIP_E2E", "phase", ANNOTATOR.username);
  await loginAs(page.request, ANNOTATOR);

  await page.goto("/clips");
  await expect(page.getByText("No Clips assigned to you.")).toHaveCount(0);
  await expect(listedClips(page)).toHaveText(["CLIP_E2E"]);
  // The scope is not a switch a non-admin is offered: the server owns it.
  await expect(page.getByLabel("Show every Clip")).toHaveCount(0);

  await page.goto("/clips/CLIP_E2E");
  await expect(railClips(page)).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Clips" }).getByRole("link", { name: "CLIP_E2E 2 Frames" }),
  ).toBeVisible();
});

test("project and tag filters narrow the list, combine, and survive a reload", async ({
  page,
}) => {
  await loginApi(page.request);
  await resetItems(page.request);
  await tagClip(page.request, "CLIP_E2E", ["west"]);
  await tagClip(page.request, "CLIP_E2E_B", ["east"]);
  await tagClip(page.request, "CLIP_VID", []);

  await page.goto("/clips");
  await page.getByLabel("Show every Clip").check();
  await expect(listedClips(page)).toHaveCount(3);

  await page.getByLabel("Filter by Clip tag").selectOption("west");
  await expect(listedClips(page)).toHaveText(["CLIP_E2E"]);

  // Both filters hold at once: this Project still holds the tagged Clip.
  await page.getByLabel("Filter by Project").selectOption("E2E");
  await expect(listedClips(page)).toHaveText(["CLIP_E2E"]);

  await page.reload();
  await expect(page.getByLabel("Filter by Project")).toHaveValue("E2E");
  await expect(page.getByLabel("Filter by Clip tag")).toHaveValue("west");
  await expect(listedClips(page)).toHaveText(["CLIP_E2E"]);

  // The rail carries the same filters, so it lists the same Clip.
  await page.goto("/clips/CLIP_E2E");
  await expect(railClips(page)).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Clips" }).getByRole("link", { name: "CLIP_E2E 2 Frames" }),
  ).toBeVisible();
});

test("a stored scope the server refuses is corrected, never shown as a refusal", async ({
  page,
}) => {
  await loginApi(page.request);
  await resetItems(page.request);
  await ensureAccount(page.request, ANNOTATOR, { annotator: true });
  await assign(page.request, "CLIP_E2E", "phase", ANNOTATOR.username);
  await loginAs(page.request, ANNOTATOR);
  // Left behind by an admin's session in this browser: this Account may not ask
  // for it, and asking is the refusal no surface may show.
  await storeScopeOnEveryLoad(page, "all");

  await page.goto("/clips");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(listedClips(page)).toHaveText(["CLIP_E2E"]);
  // The reader can read why the list changed: the sentence belongs to the stored
  // scope, which the correction writes to the browser's entry but not out of the
  // reader's hands. The entry is put right in the same commit.
  await expect(page.getByRole("status")).toContainText("showing your own Clips");
  await expect.poll(() => storedScope(page)).toBe("mine");

  // The rail reads the same entry, corrects it, and says the same thing: the
  // desk is not a place from which this needs a detour through the directory.
  await page.goto("/clips/CLIP_E2E");
  const rail = page.getByRole("navigation", { name: "Clips" });
  await expect(railClips(page)).toHaveText(["CLIP_E2E 2 Frames"]);
  await expect(rail.getByText(REFUSAL)).toHaveCount(0);
  await expect(rail.getByRole("status")).toContainText("showing your own Clips");
  await expect.poll(() => storedScope(page)).toBe("mine");
});

test("the admin may change the scope from the desk rail, without leaving the desk", async ({
  page,
}) => {
  await loginApi(page.request);
  await resetItems(page.request);

  await page.goto("/clips/CLIP_E2E");
  const rail = page.getByRole("navigation", { name: "Clips" });
  // The admin's own Clips are none of them: the scope starts at mine.
  await expect(rail.getByLabel("Show every Clip")).not.toBeChecked();

  await rail.getByLabel("Show every Clip").check();
  await expect(railClips(page)).toHaveCount(3);
  await expect.poll(() => storedScope(page)).toBe("all");

  // The Clips directory reads the same selection, so the change reaches it.
  await page.goto("/clips");
  await expect(page.getByLabel("Show every Clip")).toBeChecked();
  await expect(listedClips(page)).toHaveCount(3);
});
