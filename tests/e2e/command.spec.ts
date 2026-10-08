import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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

/**
 * P1 Command Centre (Figma 8:651, spec §8 Viewer+): the four quadrants render from the
 * deterministic local fixture, labelled as sample data, inside the venture shell.
 */
test("owner sees the Command Centre quadrants in the Operate navigation", async ({ page }) => {
  const owner = await createVerifiedUser(page, "command");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");

  await expect(page.getByRole("heading", { level: 1, name: "Command Centre" })).toBeAttached();
  for (const name of ["Today’s numbers", "What changed", "Why", "What to do"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  const numbers = page.getByRole("region", { name: "Today’s numbers" });
  await expect(numbers.getByRole("term")).toHaveCount(6);
  await expect(numbers.getByText("£38,420")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "What changed" }).getByRole("listitem"),
  ).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Why" }).getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Open tasks" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText(/AI Analysis/i)).toHaveCount(0);

  if (test.info().project.name === "desktop") {
    const nav = page.getByRole("navigation", { name: "Operate" });
    await expect(nav.getByRole("link", { name: "Command", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("banner")).toContainText("Atlas Home Services/Operate/Command");
  }
  await page.evaluate(() => document.fonts.ready);
  if (test.info().project.name === "desktop") {
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    expect((await page.getByRole("banner").boundingBox())?.height).toBe(48);
    expect((await numbers.boundingBox())?.x).toBe(252);
    expect((await numbers.boundingBox())?.y).toBe(80);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.addStyleTag({ content: "nextjs-portal { display:none; }" });
  await page.screenshot({
    path: `test-results/command-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: "Open menu" }).click();
  const navigation =
    test.info().project.name === "mobile"
      ? page.getByRole("dialog", { name: "Menu" })
      : page.getByRole("complementary");
  for (const section of ["Portfolio", "Build", "Operate"])
    await expect(navigation.getByRole("navigation", { name: section })).toBeAttached();
  const profile = navigation.getByRole("button", { name: /E2E command/ });
  await profile.scrollIntoViewIfNeeded();
  await expect(profile).toBeVisible();
  await page.screenshot({ path: `test-results/command-${test.info().project.name}-profile.png` });
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: "Close menu" }).click();

  // Existing real task actions stay available alongside the sample presentation.
  await page.getByText("Manage venture tasks", { exact: true }).click();
  await page.getByLabel("Task", { exact: true }).fill("Verify Command Centre task actions");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Open tasks" }).getByText("Verify Command Centre task actions"),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Mark “Verify Command Centre task actions” as done" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Reopen “Verify Command Centre task actions”" }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Reopen “Verify Command Centre task actions”" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Mark “Verify Command Centre task actions” as done" }),
  ).not.toBeChecked();

  // The legacy dashboard redirects here.
  await page.goto("/dashboard");
  await page.waitForURL(`**/v/${ventureId}/command`);
});

test("viewers read Command Centre; outsiders get nothing", async ({ page, browser }) => {
  const owner = await createVerifiedUser(page, "cc-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Meridian Lettings");

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

  await expect(viewerPage.getByRole("heading", { level: 2, name: "What to do" })).toBeVisible();
  await expect(viewerPage.getByRole("list", { name: "Open tasks" })).toBeVisible();
  await expectNoA11yViolations(viewerPage);

  // Growth Command uses the same Viewer+ boundary and shared shell.
  await viewerPage.goto(`/v/${ventureId}/command/growth-1m`);
  await expect(viewerPage.getByRole("heading", { name: "£1M Growth Command" })).toBeVisible();
  await viewerPage.getByText("Venture tasks · existing backend", { exact: true }).click();
  await expect(viewerPage.getByText("Viewer access · tasks are read-only.")).toBeVisible();
  await expect(viewerPage.getByRole("button", { name: "Add task", exact: true })).toHaveCount(0);

  // The REST snapshot applies the same authority.
  const api = await viewerPage.request.get(`/api/v1/command?ventureId=${ventureId}`);
  expect(api.status()).toBe(200);
  expect(await api.json()).toMatchObject({
    venture: { id: ventureId, name: "Meridian Lettings" },
    viewer: { role: "viewer", canManageTasks: false },
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
  await expect(outsider.getByRole("region", { name: "Today’s numbers" })).toHaveCount(0);
  const denied = await outsider.request.get(`/api/v1/command?ventureId=${ventureId}`);
  const unknown = await outsider.request.get(`/api/v1/command?ventureId=${randomUUID()}`);
  expect([denied.status(), unknown.status()]).toEqual([403, 403]);
  const body = async (r: typeof denied) => ((await r.json()) as { error: object }).error;
  expect({ ...(await body(denied)), correlationId: "" }).toEqual({
    ...(await body(unknown)),
    correlationId: "",
  });

  await outsider.goto(`/v/${ventureId}/command/growth-1m`);
  await expect(
    outsider.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsider.getByText("Meridian Lettings")).toHaveCount(0);

  await viewerContext.close();
  await outsiderContext.close();
});
