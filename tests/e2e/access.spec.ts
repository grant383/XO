import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, onboardVenture, openNavigation, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

/**
 * P0 journey: a signed-in non-member opens a venture link, sees the 403 state, requests
 * access without learning anything about the venture, and an Owner approves with a role.
 */
test("non-member requests access and the owner approves it", async ({ page, browser }) => {
  const owner = await createVerifiedUser(page, "approver");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Copperfield Kitchens");

  const outsiderContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsider = await outsiderContext.newPage();
  const requester = await createVerifiedUser(outsider, "requester");
  await signIn(outsider, requester, `/v/${ventureId}`);

  const denied = outsider.getByRole("heading", { name: "You don’t have access to this venture." });
  await expect(denied).toBeVisible();
  await expect(outsider.getByText("Copperfield Kitchens")).toHaveCount(0);
  await expectNoA11yViolations(outsider);

  // An unknown venture id renders the identical state (no enumeration).
  await outsider.goto(`/v/${randomUUID()}`);
  await expect(denied).toBeVisible();

  await outsider.goto(`/v/${ventureId}`);
  await outsider.getByRole("link", { name: "Request access" }).click();
  await outsider.waitForURL(`**/v/${ventureId}/request-access`);
  await expect(outsider.getByRole("heading", { level: 1, name: "Request access" })).toBeVisible();
  await expect(outsider.getByText(requester.email)).toBeVisible();
  await expect(outsider.getByText("Copperfield Kitchens")).toHaveCount(0);
  await expectNoA11yViolations(outsider);
  await outsider.getByRole("button", { name: "Submit access request" }).click();
  const sent = outsider.getByRole("heading", { level: 1, name: "Your request has been sent" });
  await expect(sent).toBeVisible();
  await expect(sent).toBeFocused();
  await expectNoA11yViolations(outsider);

  // The Owner reviews it in Team and permissions and chooses the role.
  await page.goto(`/v/${ventureId}/settings/team`);
  const request = page.getByRole("listitem").filter({ hasText: requester.email });
  await expect(request).toBeVisible();
  await request.getByLabel(`Role for ${requester.name}`).selectOption("operator");
  await request.getByRole("button", { name: `Approve ${requester.name}` }).click();
  await expect(page.getByText("No pending access requests.")).toBeVisible();

  await outsider.goto(`/v/${ventureId}`);
  await expect(
    (await openNavigation(outsider)).getByRole("button", { name: /Current venture/ }),
  ).toContainText("Operator");
  await outsiderContext.close();
});
