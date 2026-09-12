import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";
import { E2E_USER, loginApi } from "./auth";
import {
  ADMIN,
  ANNOTATOR,
  E2E_CLIPS,
  REVIEWER,
  assign,
  assignReviewer,
  boardItems,
  clearLabels,
  enableVocab,
  ensureAccount,
  ensureLabelingFor,
  itemAction,
  itemFor,
  loginAs,
  resetItems,
  stateOf,
} from "./harness";

test.describe.configure({ mode: "serial" });

/** One page's context, logged in as this Account. */
async function deskPage(browser: import("@playwright/test").Browser, account = ADMIN) {
  const page = await browser.newPage();
  await loginAs(page.request, account);
  return page;
}

function boardColumn(page: Page, state: string): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${state} `) }) });
}

function boardRow(page: Page, clipId: string, taskType: string): Locator {
  return page.locator("li").filter({ hasText: `${clipId} · ${taskType}` });
}

function taskRow(page: Page, clipId: string, taskType: string): Locator {
  return page.locator("li").filter({ has: page.getByRole("link", { name: `${clipId} · ${taskType}` }) });
}

async function openBoard(page: Page) {
  await page.goto("/admin/assignments");
  await expect(page.getByRole("heading", { name: "Assignments" })).toBeVisible();
  await expect(page.locator("li").first()).toBeVisible();
}

/** The annotator/reviewer pair the multi-user specs share, with their items reset. */
async function resetWorld(request: APIRequestContext) {
  await loginApi(request);
  await ensureAccount(request, ANNOTATOR, { annotator: true });
  await ensureAccount(request, REVIEWER, { reviewer: true });
  // Unassign first, hand everything to the admin long enough to strip the
  // labels (writes are the assignee's), then hand it back Unassigned.
  await resetItems(request);
  await ensureLabelingFor(request, E2E_USER);
  await clearLabels(request);
  await resetItems(request);
  for (const clipId of E2E_CLIPS) {
    await enableVocab(request, clipId, {
      phases: ["Preparation", "Clipping and cutting"],
      class_tags: ["grasper", "hook", "blurred"],
    });
  }
}

test("admin assigns on the board; the annotator's desk turns writable and the lists agree", async ({ browser, page }) => {
  await resetWorld(page.request);

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  // Before the assignment the annotator has nothing: an item is theirs only
  // once the board says so.
  await annotatorPage.goto("/tasks");
  await expect(annotatorPage.getByText("No items are assigned to you yet.")).toBeVisible();

  const adminPage = await deskPage(browser, ADMIN);
  await openBoard(adminPage);
  const unassigned = boardColumn(adminPage, "Unassigned");
  const row = unassigned.locator("li").filter({ hasText: "CLIP_E2E_B · phase" });
  await expect(row).toBeVisible();
  await row.getByLabel("Username for CLIP_E2E_B phase").fill(ANNOTATOR.username);
  await row.getByRole("button", { name: "Assign" }).click();

  // The board's own columns move with the assignment.
  await expect(boardColumn(adminPage, "Labeling").locator("li").filter({ hasText: "CLIP_E2E_B · phase" })).toContainText(
    ANNOTATOR.username,
  );
  await expect(unassigned.locator("li").filter({ hasText: "CLIP_E2E_B · phase" })).toHaveCount(0);

  // The annotator's list agrees with the board, and shows only their own items.
  await annotatorPage.reload();
  const annotatorRow = taskRow(annotatorPage, "CLIP_E2E_B", "phase");
  await expect(annotatorRow).toBeVisible();
  await expect(annotatorRow.getByText("Labeling")).toBeVisible();
  await annotatorPage.goto("/tasks");
  await expect(taskRow(annotatorPage, "CLIP_VID", "class")).toHaveCount(0);

  // The desk is writable now: label write succeeds where it used to be refused.
  await annotatorPage.goto("/clips/CLIP_E2E_B");
  await annotatorPage.getByRole("tab", { name: "phase" }).click();
  const phaseRow = annotatorPage.getByRole("list", { name: "Library" }).getByRole("button", { name: "Preparation", exact: true });
  await phaseRow.click();
  await expect
    .poll(async () => {
      const doc = (await (await annotatorPage.request.get("/api/phase/CLIP_E2E_B")).json()) as { frames: Record<string, string> };
      return doc.frames["0"];
    })
    .toBe("Preparation");

  // The same write on an item this Account does not hold is refused.
  const refused = await annotatorPage.request.put("/api/phase/CLIP_VID/frames/0", {
    data: { phase: "Preparation" },
    failOnStatusCode: false,
  } as never);
  await annotatorPage.close();
  expect(refused.status()).toBe(403);
});

test("a full round on the board: assign, submit, assign reviewer, pass", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  const reviewerPage = await deskPage(browser, REVIEWER);
  const adminPage = await deskPage(browser, ADMIN);
  await openBoard(adminPage);

  const unassigned = boardColumn(adminPage, "Unassigned");
  const row = unassigned.locator("li").filter({ hasText: "CLIP_E2E_B · class" });
  await row.getByLabel("Username for CLIP_E2E_B class").fill(ANNOTATOR.username);
  await row.getByRole("button", { name: "Assign" }).click();

  // The annotator submits from My Tasks.
  await annotatorPage.goto("/tasks");
  await taskRow(annotatorPage, "CLIP_E2E_B", "class").getByRole("button", { name: "Submit" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "class")).toBe("Submitted");
  await expect(taskRow(annotatorPage, "CLIP_E2E_B", "class").getByText("Submitted")).toBeVisible();

  // The Submitted backlog is a board column; its row takes the reviewer.
  await adminPage.reload();
  const submitted = boardColumn(adminPage, "Submitted").locator("li").filter({ hasText: "CLIP_E2E_B · class" });
  await expect(submitted).toBeVisible();
  await submitted.getByLabel("Reviewer for CLIP_E2E_B class").fill(REVIEWER.username);
  await submitted.getByRole("button", { name: "Assign reviewer" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "class")).toBe("Reviewing");

  // The reviewer sees it in the review queue, passes it, and Done records who.
  await reviewerPage.goto("/tasks");
  const reviewRow = taskRow(reviewerPage, "CLIP_E2E_B", "class");
  await expect(reviewRow.getByText("Reviewing")).toBeVisible();
  await reviewRow.getByRole("button", { name: "Pass" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "class")).toBe("Done");
  const done = await itemFor(request, "CLIP_E2E_B", "class");
  expect(done.reviewed_by).toBe(REVIEWER.username);
  expect(done.reviewed_at).toBeTruthy();

  await adminPage.reload();
  await expect(
    boardColumn(adminPage, "Done").locator("li").filter({ hasText: "CLIP_E2E_B · class" }),
  ).toContainText(`Reviewed by ${REVIEWER.username}`);
  await expect(taskRow(annotatorPage, "CLIP_E2E_B", "class").getByText("Done")).toBeVisible();

  await annotatorPage.close();
  await reviewerPage.close();
  await adminPage.close();
});

test("a rejected round lands back in Labeling with the note on the row", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  const reviewerPage = await deskPage(browser, REVIEWER);
  const adminPage = await deskPage(browser, ADMIN);

  await assign(request, "CLIP_E2E_B", "triplet", ANNOTATOR.username);
  await annotatorPage.goto("/tasks");
  await taskRow(annotatorPage, "CLIP_E2E_B", "triplet").getByRole("button", { name: "Submit" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "triplet")).toBe("Submitted");
  await assignReviewer(request, "CLIP_E2E_B", "triplet", REVIEWER.username);

  await reviewerPage.goto("/tasks");
  const reviewRow = taskRow(reviewerPage, "CLIP_E2E_B", "triplet");
  await reviewRow.getByRole("button", { name: "Reject" }).click();
  await reviewRow.getByLabel("Reject note").fill("Wrong tool on Frame 0");
  await reviewRow.getByRole("button", { name: "Send back" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "triplet")).toBe("Labeling");

  // The board shows the item back in Labeling, with its one note.
  await openBoard(adminPage);
  await expect(
    boardColumn(adminPage, "Labeling").locator("li").filter({ hasText: "CLIP_E2E_B · triplet" }),
  ).toContainText("Note: Wrong tool on Frame 0");

  // The annotator's list carries the reviewer's note as a banner.
  await annotatorPage.reload();
  const row = taskRow(annotatorPage, "CLIP_E2E_B", "triplet");
  await expect(row.getByText("Labeling")).toBeVisible();
  await expect(row.locator("[data-reject-note]")).toContainText("Wrong tool on Frame 0");

  await annotatorPage.close();
  await reviewerPage.close();
  await adminPage.close();
});

test("annotator: label, submit, recall — and only their own items show", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E", "class", ANNOTATOR.username);
  await assign(request, "CLIP_VID", "phase", E2E_USER);

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/tasks");
  await expect(taskRow(annotatorPage, "CLIP_E2E", "class")).toBeVisible();
  // Another Account's CLIP_VID item is not on this list.
  await expect(taskRow(annotatorPage, "CLIP_VID", "phase")).toHaveCount(0);

  // Label on the desk, then submit and recall from the list.
  await annotatorPage.goto("/clips/CLIP_E2E");
  const classRow = annotatorPage.getByRole("list", { name: "Library" }).getByRole("button", { name: "grasper", exact: true });
  await classRow.click();
  await expect.poll(async () => {
    const doc = (await (await annotatorPage.request.get("/api/class/CLIP_E2E")).json()) as { frames: Record<string, string[]> };
    return doc.frames["0"] ?? [];
  }).toContain("grasper");

  await annotatorPage.goto("/tasks");
  await taskRow(annotatorPage, "CLIP_E2E", "class").getByRole("button", { name: "Submit" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E", "class")).toBe("Submitted");
  await expect(taskRow(annotatorPage, "CLIP_E2E", "class").getByRole("button", { name: "Recall" })).toBeVisible();
  await taskRow(annotatorPage, "CLIP_E2E", "class").getByRole("button", { name: "Recall" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E", "class")).toBe("Labeling");

  await annotatorPage.close();
});

test("two tabs of one annotator: the stale save is refused, the retry lands", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E", "class", ANNOTATOR.username);

  const first = await deskPage(browser, ANNOTATOR);
  const second = await deskPage(browser, ANNOTATOR);
  await first.goto("/clips/CLIP_E2E");
  await second.goto("/clips/CLIP_E2E");
  await expect(first.getByRole("list", { name: "Library" }).getByRole("button", { name: "grasper", exact: true })).toBeVisible();
  await expect(second.getByRole("list", { name: "Library" }).getByRole("button", { name: "grasper", exact: true })).toBeVisible();
  expect((await (await first.request.get("/api/class/CLIP_E2E")).json()).frames).toEqual({});

  // Tab A saves grasper; tab B still holds the old Clip version.
  await first.getByRole("list", { name: "Library" }).getByRole("button", { name: "grasper", exact: true }).click();
  await expect.poll(async () => {
    const doc = (await (await first.request.get("/api/class/CLIP_E2E")).json()) as { frames: Record<string, string[]> };
    return doc.frames["0"] ?? [];
  }).toContain("grasper");

  await second.getByRole("list", { name: "Library" }).getByRole("button", { name: "blurred", exact: true }).click();
  // The stale save is refused with the refresh-and-retry hint, not a silent clobber.
  await expect(second.getByText(/Refreshed/)).toBeVisible();

  // The retry on the refreshed tab lands and keeps the other tab's label.
  await second.getByRole("list", { name: "Library" }).getByRole("button", { name: "blurred", exact: true }).click();
  await expect.poll(async () => {
    const doc = (await (await second.request.get("/api/class/CLIP_E2E")).json()) as { frames: Record<string, string[]> };
    return doc.frames["0"] ?? [];
  }).toEqual(expect.arrayContaining(["grasper", "blurred"]));

  await first.close();
  await second.close();
});

test("reviewer edits one label in place, passes it, and the annotator's item flips to Done", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E", "class", ANNOTATOR.username);
  await itemAction(request, "CLIP_E2E", "class", "submit");
  await assignReviewer(request, "CLIP_E2E", "class", REVIEWER.username);

  const reviewerPage = await deskPage(browser, REVIEWER);
  await reviewerPage.goto("/clips/CLIP_E2E");
  // Reviewing: the reviewer's label edits take the annotator's save path.
  await reviewerPage.getByRole("list", { name: "Library" }).getByRole("button", { name: "hook", exact: true }).click();
  await expect.poll(async () => {
    const doc = (await (await reviewerPage.request.get("/api/class/CLIP_E2E")).json()) as { frames: Record<string, string[]> };
    return doc.frames["0"] ?? [];
  }).toContain("hook");

  await reviewerPage.getByRole("button", { name: "Pass", exact: true }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E", "class")).toBe("Done");

  // The annotator sees Done, and the Desk no longer writes the item.
  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/tasks");
  await expect(taskRow(annotatorPage, "CLIP_E2E", "class").getByText("Done")).toBeVisible();
  const refused = await annotatorPage.request.put("/api/class/CLIP_E2E/frames/1", {
    data: { tags: ["grasper"] },
    failOnStatusCode: false,
  } as never);
  expect(refused.status()).toBe(403);

  await reviewerPage.close();
  await annotatorPage.close();
});

test("the reviewer's reject puts the note in front of the annotator", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E_B", "phase", ANNOTATOR.username);
  await itemAction(request, "CLIP_E2E_B", "phase", "submit");
  await assignReviewer(request, "CLIP_E2E_B", "phase", REVIEWER.username);

  const reviewerPage = await deskPage(browser, REVIEWER);
  await reviewerPage.goto("/clips/CLIP_E2E_B");
  // The desk's header acts on the focused Task type.
  await reviewerPage.getByRole("tab", { name: "phase" }).click();
  await reviewerPage.getByRole("button", { name: "Reject" }).click();
  await reviewerPage.getByLabel("Reject note").fill("Phase starts one Frame late");
  await reviewerPage.getByRole("button", { name: "Send back" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "phase")).toBe("Labeling");

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/tasks");
  await expect(taskRow(annotatorPage, "CLIP_E2E_B", "phase").locator("[data-reject-note]")).toContainText(
    "Phase starts one Frame late",
  );

  await reviewerPage.close();
  await annotatorPage.close();
});

test("admin creates an account; the new user changes its password and the delivered marker shows", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_VID", "triplet", ANNOTATOR.username);

  const adminPage = await deskPage(browser, ADMIN);
  const username = `e2e-fresh-${Date.now()}`;
  const temporary = "temporary-pass-1";
  const chosen = "chosen-pass-2";
  await adminPage.goto("/admin/users");
  await adminPage.getByLabel("New username").fill(username);
  await adminPage.getByLabel("Temporary password").fill(temporary);
  await adminPage.getByRole("button", { name: "Create Account" }).click();
  await expect(adminPage.getByText(`Temporary password:`)).toContainText(temporary);
  const accountRow = adminPage.locator("li").filter({ hasText: username });
  await expect(accountRow).toBeVisible();
  await expect(accountRow.getByLabel(`annotator role for ${username}`)).toBeChecked();

  // The new Account logs in with the temporary password and replaces it.
  const fresh = await browser.newPage();
  await loginAs(fresh.request, { username, password: temporary });
  await fresh.goto("/tasks");
  await expect(fresh.getByText(username)).toBeVisible();
  await fresh.getByRole("button", { name: "Change password" }).click();
  await fresh.getByLabel("Current password").fill(temporary);
  await fresh.getByLabel("New password").fill(chosen);
  await fresh.getByRole("button", { name: "Save password" }).click();
  await expect(fresh.getByText("Password changed.")).toBeVisible();
  await fresh.getByRole("button", { name: "Log out" }).click();
  await expect(fresh.getByRole("heading", { name: "Log in" })).toBeVisible();

  // The old temporary password is dead; the chosen one works.
  await fresh.getByRole("textbox", { name: "Username" }).fill(username);
  await fresh.getByLabel("Password").fill(temporary);
  await fresh.getByRole("button", { name: "Log in" }).click();
  await expect(fresh.getByRole("alert")).toBeVisible();
  await fresh.getByLabel("Password").fill(chosen);
  await fresh.getByRole("button", { name: "Log in" }).click();
  await expect(fresh.getByText(username)).toBeVisible();
  await fresh.close();

  // The delivered marker rides on the row, with its timestamp.
  await openBoard(adminPage);
  const row = boardRow(adminPage, "CLIP_VID", "triplet");
  await row.getByRole("button", { name: "Mark delivered" }).click();
  await expect(row.getByText(/^Delivered /)).toBeVisible();
  await expect.poll(async () => (await itemFor(request, "CLIP_VID", "triplet")).delivered_at).toBeTruthy();
  await row.getByRole("button", { name: "Clear delivery" }).click();
  await expect.poll(async () => (await itemFor(request, "CLIP_VID", "triplet")).delivered_at).toBeNull();

  await adminPage.close();
});

test("all three /admin/vocab areas work end to end", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);

  const vocabPage = await deskPage(browser, ADMIN);
  await vocabPage.goto("/admin/vocab");
  await expect(vocabPage.getByRole("heading", { name: "Vocab" })).toBeVisible();
  const registry = vocabPage.getByRole("region", { name: "Registry" });
  const matrix = vocabPage.getByRole("region", { name: "Project enablement" });
  const queue = vocabPage.getByRole("region", { name: "Candidate promotion" });

  // 1. Registry browse: create, rename, archive, restore.
  await registry.getByLabel("create kind").selectOption("phase");
  await registry.getByLabel("create name").fill("CloseoutPhase");
  await registry.getByRole("button", { name: "Create" }).click();
  // The name lives in the rename input's value, so match on the input itself.
  const registryRow = registry
    .locator("tr")
    .filter({ has: vocabPage.getByLabel("Rename CloseoutPhase") });
  await expect(registryRow).toContainText("active");

  await registryRow.getByLabel("Rename CloseoutPhase").fill("CloseoutPhase2");
  await registryRow.getByRole("button", { name: "Rename" }).click();
  const renamed = registry
    .locator("tr")
    .filter({ has: vocabPage.getByLabel("Rename CloseoutPhase2") });
  await expect(renamed).toContainText("active");
  await renamed.getByRole("button", { name: "Archive" }).click();
  await expect(renamed).toContainText("archived");
  await renamed.getByRole("button", { name: "Restore" }).click();
  await expect(renamed).toContainText("active");

  // 2. The enable matrix decides this Project's picker.
  const enable = matrix.getByLabel("Enable CloseoutPhase2 on E2E");
  await enable.click();
  await expect(enable).toBeChecked();
  const picker = await (await request.get("/api/vocab", { params: { clip_id: "CLIP_E2E" } })).json();
  expect(picker.phases).toContain("CloseoutPhase2");
  await enable.click();
  await expect(enable).not.toBeChecked();
  const disabled = await (await request.get("/api/vocab", { params: { clip_id: "CLIP_E2E" } })).json();
  expect(disabled.phases).not.toContain("CloseoutPhase2");

  // 3. Candidate promotion: add, edit, promote.
  await queue.getByLabel("candidate project").selectOption({ label: "E2E" });
  await queue.getByLabel("candidate kind").selectOption("phase");
  await queue.getByLabel("candidate name").fill("CandidateP");
  await queue.getByRole("button", { name: "Add candidate" }).click();
  const candidateRow = queue.locator("li").filter({ hasText: "E2E: CandidateP" });
  await expect(candidateRow).toBeVisible();
  await candidateRow.getByLabel(/^Edit candidate /).fill("CandidateP2");
  await candidateRow.getByRole("button", { name: "Save" }).click();
  const promotedCandidate = queue.locator("li").filter({ hasText: "E2E: CandidateP2" });
  await expect(promotedCandidate).toBeVisible();
  await promotedCandidate.getByRole("button", { name: "Promote" }).click();
  await expect(promotedCandidate).toHaveCount(0);
  await expect(
    registry.locator("tr").filter({ has: vocabPage.getByLabel("Rename CandidateP2") }),
  ).toContainText("active");

  await vocabPage.close();
});

test("annotator picker: enabled words only, a candidate lands in the queue, editing stays hidden", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E", "phase", ANNOTATOR.username);
  // A global word nobody enabled for this Project must stay out of the picker.
  await request.post("/api/registry", { data: { kind: "phase", name: "NotEnabledP" } });

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/clips/CLIP_E2E");
  await annotatorPage.getByRole("tab", { name: "phase" }).click();
  const library = annotatorPage.getByRole("list", { name: "Library" });
  await expect(library.getByRole("button", { name: "Preparation", exact: true })).toBeVisible();
  await expect(library.getByRole("button", { name: "NotEnabledP", exact: true })).toHaveCount(0);
  // The annotator may propose a word, never curate the list.
  await expect(annotatorPage.getByRole("button", { name: /^Delete phase / })).toHaveCount(0);
  await expect(annotatorPage.getByRole("button", { name: /from this Project$/ })).toHaveCount(0);

  await annotatorPage.getByRole("textbox", { name: "Add phase name" }).fill("AnnotatorCandidateP");
  await annotatorPage.getByRole("textbox", { name: "Add phase name" }).press("Enter");
  await expect(library.getByRole("button", { name: "AnnotatorCandidateP", exact: true })).toBeVisible();

  // The admin's promotion queue holds it.
  const adminPage = await deskPage(browser, ADMIN);
  await adminPage.goto("/admin/vocab");
  await expect(adminPage.locator("li").filter({ hasText: "E2E: AnnotatorCandidateP" })).toBeVisible();

  // A reviewer curates this Project's list: the retract control is theirs.
  const reviewerPage = await deskPage(browser, REVIEWER);
  await reviewerPage.goto("/clips/CLIP_E2E");
  await reviewerPage.getByRole("tab", { name: "phase" }).click();
  await expect(
    reviewerPage.getByRole("button", { name: "Remove Preparation from this Project" }),
  ).toBeVisible();
  // The global registry stays admin-only: no delete-everywhere control here.
  await expect(reviewerPage.getByRole("button", { name: "Delete phase Preparation" })).toHaveCount(0);

  await annotatorPage.close();
  await reviewerPage.close();
  await adminPage.close();
});

test("mask Session opens on the first action, hints while inferring, and resumes on return", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  for (const clipId of E2E_CLIPS) {
    await assign(request, clipId, "mask", ANNOTATOR.username);
  }

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/clips/CLIP_E2E");
  await expect(annotatorPage.locator("video")).toBeVisible();
  // No Session until a mask action opens one for this (Account, Clip).
  expect((await (await annotatorPage.request.get("/api/session", { params: { clip_id: "CLIP_E2E" } })).json()).active).toBe(false);

  // Hold the Predict answer so the inferring hint stays observable.
  await annotatorPage.route("**/api/session/predict", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  const overlay = annotatorPage.locator("[data-mask-overlay]");
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();
  await annotatorPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  // The first mask action opens this (Account, Clip) Session and the desk says
  // it is waiting on inference while it does.
  await expect(annotatorPage.getByRole("button", { name: "Inferring…" })).toBeVisible();
  await expect
    .poll(async () => (await (await annotatorPage.request.get("/api/session", { params: { clip_id: "CLIP_E2E" } })).json()).active)
    .toBe(true);
  const trackRow = annotatorPage.getByRole("list", { name: "Track list" }).getByRole("button", { name: "track-1", exact: true });
  await expect(trackRow).toBeVisible({ timeout: 10_000 });
  await expect(annotatorPage.getByRole("button", { name: "Predict" })).toBeVisible();
  await annotatorPage.unroute("**/api/session/predict");

  // Switching Clip leaves the Session open; coming back resumes it.
  await annotatorPage.locator('a[href="/clips/CLIP_E2E_B"]').click();
  await expect(annotatorPage).toHaveURL(/\/clips\/CLIP_E2E_B$/);
  expect((await (await annotatorPage.request.get("/api/session", { params: { clip_id: "CLIP_E2E" } })).json()).active).toBe(true);
  await annotatorPage.locator('a[href="/clips/CLIP_E2E"]').click();
  await expect(annotatorPage).toHaveURL(/\/clips\/CLIP_E2E$/);
  await expect(trackRow).toBeVisible();

  await annotatorPage.close();
});

test("two browser contexts: the reviewer's reject reaches the annotator's list with no refresh", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E_B", "class", ANNOTATOR.username);
  await itemAction(request, "CLIP_E2E_B", "class", "submit");
  await assignReviewer(request, "CLIP_E2E_B", "class", REVIEWER.username);

  const annotatorPage = await deskPage(browser, ANNOTATOR);
  await annotatorPage.goto("/tasks");
  await expect(taskRow(annotatorPage, "CLIP_E2E_B", "class").getByText("Reviewing")).toBeVisible();

  const reviewerPage = await deskPage(browser, REVIEWER);
  await reviewerPage.goto("/tasks");
  const reviewRow = taskRow(reviewerPage, "CLIP_E2E_B", "class");
  await reviewRow.getByRole("button", { name: "Reject" }).click();
  await reviewRow.getByLabel("Reject note").fill("Class tag missing on Frame 1");
  await reviewRow.getByRole("button", { name: "Send back" }).click();
  await expect.poll(async () => stateOf(request, "CLIP_E2E_B", "class")).toBe("Labeling");

  // No reload: the event channel refetched the annotator's list.
  const annotatorRow = taskRow(annotatorPage, "CLIP_E2E_B", "class");
  await expect(annotatorRow.getByText("Labeling")).toBeVisible();
  await expect(annotatorRow.locator("[data-reject-note]")).toContainText("Class tag missing on Frame 1");

  await annotatorPage.close();
  await reviewerPage.close();
});

test("the board counts what the server holds", async ({ page }) => {
  const request = page.request;
  await resetWorld(request);
  await assign(request, "CLIP_E2E", "phase", ANNOTATOR.username);

  const items = await boardItems(request);
  await page.goto("/admin/assignments");
  for (const state of ["Unassigned", "Labeling", "Submitted", "Reviewing", "Done"]) {
    const expected = items.filter((item) => item.state === state).length;
    await expect(
      boardColumn(page, state).getByRole("heading", { name: `${state} (${expected})` }),
    ).toBeVisible();
  }
  await expect(page.getByText(ANNOTATOR.username)).toBeVisible();
});

test("a disabled Account is logged out on its next call", async ({ browser, page }) => {
  const request = page.request;
  await resetWorld(request);

  const disabled = await browser.newPage();
  await loginAs(disabled.request, ANNOTATOR);
  await disabled.goto("/tasks");
  await expect(disabled.getByText(ANNOTATOR.username)).toBeVisible();

  const adminPage = await deskPage(browser, ADMIN);
  await adminPage.goto("/admin/users");
  const row = adminPage.locator("li").filter({ hasText: ANNOTATOR.username });
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.getByText("disabled")).toBeVisible();

  await disabled.reload();
  await expect(disabled).toHaveURL(/\/login/);

  // Put the Account back so later specs still find their annotator.
  await row.getByRole("button", { name: "Enable" }).click();
  await expect(row.getByText("disabled")).toHaveCount(0);
  await disabled.close();
  await adminPage.close();
});
