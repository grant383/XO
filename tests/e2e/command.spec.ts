import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import {
  createVerifiedUser,
  isolatedIp,
  latestEmail,
  linkFrom,
  onboardVenture,
  signIn,
} from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

/** A calendar date in the venture timezone (onboarding default: Europe/London). */
const ventureDate = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

async function addTask(page: Page, title: string, priority: string, dueOn = "") {
  await page.getByLabel("Task", { exact: true }).fill(title);
  await page.getByLabel("Priority").selectOption(priority);
  if (dueOn) await page.getByLabel("Due date (optional)").fill(dueOn);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Added “${title}”.` })).toBeVisible();
}

/**
 * P1 Command Centre (Figma 8:651, spec §8 Viewer+): a real venture snapshot. No sample
 * figures; deterministic signals with evidence; tasks that persist, audit and change
 * "What changed"; offline is read-only.
 */
test("owner runs Command Centre: honest metrics, rule signals and tasks", async ({
  page,
  context,
}) => {
  const owner = await createVerifiedUser(page, "command");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");

  await expect(page.getByRole("heading", { level: 1, name: "Command Centre" })).toBeVisible();
  for (const name of ["Today’s numbers", "What changed", "Why", "What to do"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  // No sample data: every tile names the source it is waiting for.
  await expect(page.getByText("Nothing here is sample data.", { exact: false })).toBeVisible();
  const numbers = page.getByRole("region", { name: "Today’s numbers" });
  await expect(numbers.getByRole("term")).toHaveCount(6);
  await expect(numbers.getByRole("term").first()).toHaveText("Revenue MTD");
  await expect(numbers.getByText("Source: Finance invoices", { exact: true })).toBeVisible();
  await expect(page.getByText("£38,420")).toHaveCount(0);
  // Empty states.
  await expect(page.getByRole("heading", { name: "Nothing has changed yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No open tasks" })).toBeVisible();
  // Why: a deterministic rule with its id, version and evidence, not "AI analysis".
  const sources = page.getByRole("article").filter({ hasText: "not connected yet" });
  await expect(sources).toContainText("Rule command.metrics.awaiting_sources v1");
  await sources.getByText("Evidence and threshold").click();
  await expect(sources.getByText("Finance balances")).toBeVisible();
  await expect(page.getByText(/AI Analysis/i)).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Server-side validation with a focused error summary (native checks bypassed).
  await page.locator("form", { has: page.getByLabel("Task", { exact: true }) }).evaluate((f) => {
    (f as HTMLFormElement).noValidate = true;
  });
  await page.getByLabel("Task", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Add task" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "We couldn’t add the task" });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Enter a task");

  // Add an overdue high-priority task and a later one.
  await addTask(page, "Call back supplier about parts", "high", ventureDate(-2));
  await addTask(page, "Schedule team standup", "low");
  const open = page.getByRole("list", { name: "Open tasks" });
  const overdue = open.getByRole("listitem").filter({ hasText: "Call back supplier" });
  await expect(overdue).toContainText("High");
  await expect(overdue).toContainText("Overdue ·");
  await expect(open.getByRole("listitem").first()).toContainText("Call back supplier");
  const overdueSignal = page.getByRole("article").filter({ hasText: "1 task overdue" });
  await expect(overdueSignal).toContainText("Action needed");
  await expect(overdueSignal).toContainText("1 of them is high priority.");
  await expect(
    page.getByRole("listitem").filter({ hasText: "added “Schedule team standup”" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // Complete it: the signal clears and "What changed" records who did it.
  await page
    .getByRole("checkbox", { name: "Mark “Call back supplier about parts” as done" })
    .click();
  const completed = page.getByRole("list", { name: "Completed tasks" });
  await expect(
    completed.getByRole("checkbox", { name: "Reopen “Call back supplier about parts”" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("article").filter({ hasText: "overdue" })).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ hasText: `${owner.name} completed “Call back supplier` }),
  ).toBeVisible();

  // Persisted, not client state.
  await page.reload();
  await expect(completed.getByText("Call back supplier about parts")).toBeVisible();
  await expect(open.getByText("Schedule team standup")).toBeVisible();

  // Offline: read-only, and the freshness indicator says the data may be stale.
  await context.setOffline(true);
  await expect(page.getByText(/Offline · showing data from \d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /Schedule team standup/ })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();

  // The legacy dashboard redirects here.
  await page.goto("/dashboard");
  await page.waitForURL(`**/v/${ventureId}/command`);
});

test("viewers read Command Centre without task controls; outsiders get nothing", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "cc-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Meridian Lettings");
  await addTask(page, "Renew landlord gas certificates", "medium");

  // Invite a Viewer through the real invitation flow.
  const viewerContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const viewerPage = await viewerContext.newPage();
  const viewer = await createVerifiedUser(viewerPage, "cc-viewer");
  await page.goto(`/v/${ventureId}/settings/team`);
  await page.getByLabel("Email address").fill(viewer.email);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  const link = linkFrom(await latestEmail(page.request, viewer.email, /invit/i), "/invite/");
  await signIn(viewerPage, viewer, link);
  await viewerPage.getByRole("button", { name: "Accept invitation and continue" }).click();
  await viewerPage.waitForURL(`**/v/${ventureId}/command`);

  await expect(viewerPage.getByText("Your role: Viewer.")).toBeVisible();
  await expect(
    viewerPage
      .getByRole("list", { name: "Open tasks" })
      .getByText("Renew landlord gas certificates"),
  ).toBeVisible();
  await expect(viewerPage.getByRole("checkbox")).toHaveCount(0);
  await expect(viewerPage.getByRole("button", { name: "Add task" })).toHaveCount(0);
  await expect(viewerPage.getByText("Your role can view tasks.")).toBeVisible();
  await expectNoA11yViolations(viewerPage);

  // The REST snapshot applies the same authority.
  const api = await viewerPage.request.get(`/api/v1/command?ventureId=${ventureId}`);
  expect(api.status()).toBe(200);
  expect(await api.json()).toMatchObject({
    venture: { id: ventureId, name: "Meridian Lettings" },
    viewer: { role: "viewer", canManageTasks: false },
    openTasks: [{ title: "Renew landlord gas certificates", priority: "medium" }],
  });

  // A signed-in outsider: identical denial for this venture and an unknown one.
  const outsiderContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsider = await outsiderContext.newPage();
  const stranger = await createVerifiedUser(outsider, "cc-outsider");
  await signIn(outsider, stranger, `/v/${ventureId}/command`);
  await expect(
    outsider.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsider.getByText("Meridian Lettings")).toHaveCount(0);
  await expect(outsider.getByText("Renew landlord gas certificates")).toHaveCount(0);
  const denied = await outsider.request.get(`/api/v1/command?ventureId=${ventureId}`);
  const unknown = await outsider.request.get(`/api/v1/command?ventureId=${randomUUID()}`);
  expect([denied.status(), unknown.status()]).toEqual([403, 403]);
  const body = async (r: typeof denied) => ((await r.json()) as { error: object }).error;
  expect({ ...(await body(denied)), correlationId: "" }).toEqual({
    ...(await body(unknown)),
    correlationId: "",
  });

  await viewerContext.close();
  await outsiderContext.close();
});
