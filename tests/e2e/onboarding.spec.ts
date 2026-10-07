import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

/**
 * P0 journey: a verified founder creates a venture, completes the three Figma onboarding
 * steps and lands in the application shell (spec §19 exit criteria; matrix rows 11–15).
 */
test("founder onboards a venture and enters the shell", async ({ page }) => {
  const owner = await createVerifiedUser(page, "founder");
  await signIn(page, owner, "/onboarding");

  await expect(page.getByRole("heading", { level: 1, name: "Set up a venture" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel("Business name").fill("Northwind Trades");
  await page.getByRole("button", { name: "Start setup" }).click();

  // Step 1: business details. The server re-validates; the client blocks empty selects.
  await page.waitForURL(/\/onboarding\/[0-9a-f-]+\/business$/);
  const ventureId = new URL(page.url()).pathname.split("/")[2]!;
  await expect(page.getByRole("progressbar", { name: "Venture setup progress" })).toHaveAttribute(
    "aria-valuetext",
    "Step 1 of 3: Business details",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell us how Northwind Trades operates" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel("Sector").selectOption({ index: 1 });
  await page.getByLabel("Financial year starts").selectOption("4");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: data connections show only foundation status (no provider connect buttons).
  await page.waitForURL(`**/onboarding/${ventureId}/data-connections`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Connect your business data" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Connection status" })).toContainText(
    "Companies House",
  );
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Review & confirm" }).click();

  // Step 3: review, then the complete state (activation happened server-side).
  await page.waitForURL(`**/onboarding/${ventureId}/review`);
  await expect(page.getByText("Northwind Trades").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit business details" })).toHaveAttribute(
    "href",
    `/onboarding/${ventureId}/business`,
  );
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your workspace is ready" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Invite your team/ })).toHaveAttribute(
    "href",
    `/v/${ventureId}/settings/team`,
  );
  await expectNoA11yViolations(page);

  // Completed ventures leave onboarding: the workspace opens on Command Centre.
  await page.getByRole("link", { name: "Enter workspace" }).click();
  await page.waitForURL(`**/v/${ventureId}/command`);
  await expect(page.getByRole("heading", { level: 1, name: "Command Centre" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "What to do" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto(`/onboarding/${ventureId}/review`);
  await page.waitForURL(`**/v/${ventureId}/command`);
});

test("onboarding rejects an empty business name with a focused error summary", async ({ page }) => {
  const owner = await createVerifiedUser(page, "blank");
  await signIn(page, owner, "/onboarding");
  const name = page.getByLabel("Business name");
  await name.fill("   ");
  // Bypass the native `required` check so the server-side validation is exercised.
  await page.locator("form").evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByRole("button", { name: "Start setup" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "We couldn’t start setup" });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expectNoA11yViolations(page);
});
