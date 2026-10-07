import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import {
  createVerifiedUser,
  isolatedIp,
  latestEmail,
  linkFrom,
  onboardVenture,
  openNavigation,
  signIn,
} from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

/**
 * P0 journey: the Owner invites a member, the invitee accepts through /invite/[token],
 * and the Owner changes the member's role (spec §19: invite a member, assign role).
 * Roles are enforced server-side: the UI only reflects what the server allows.
 */
test("owner invites a member who accepts and is assigned a role", async ({ page, browser }) => {
  const owner = await createVerifiedUser(page, "owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Harbour Lane Builders");

  const nav = await openNavigation(page);
  await nav.getByRole("link", { name: "Team & permissions" }).click();
  await page.waitForURL(`**/v/${ventureId}/settings/team`);
  await expect(page.getByRole("heading", { level: 1, name: "Team & permissions" })).toBeVisible();
  await expectNoA11yViolations(page);

  const inviteeContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const invitee = await inviteeContext.newPage();
  const member = await createVerifiedUser(invitee, "member");

  await page.getByLabel("Email address").fill(member.email);
  await page.getByLabel("Role", { exact: true }).selectOption("manager");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  await expect(page.getByText(`${member.email} · Manager`)).toBeVisible();

  // Signed out, the invitation reveals nothing about the venture.
  const link = linkFrom(await latestEmail(page.request, member.email, /invit/i), "/invite/");
  await invitee.goto(link);
  await expect(
    invitee.getByRole("heading", { level: 1, name: "You’ve been invited to DirectorXO" }),
  ).toBeVisible();
  await expect(invitee.getByText("Harbour Lane Builders")).toHaveCount(0);
  await expectNoA11yViolations(invitee);

  // Signed in as the invited address, the details appear; acceptance is an explicit POST.
  await signIn(invitee, member, link);
  await expect(
    invitee.getByRole("heading", { level: 1, name: "You’ve been invited to join a team" }),
  ).toBeVisible();
  await expect(invitee.getByText("Harbour Lane Builders")).toBeVisible();
  await expect(invitee.getByText("Manager", { exact: true })).toBeVisible();
  await expectNoA11yViolations(invitee);
  await invitee.getByRole("button", { name: "Accept invitation and continue" }).click();
  await invitee.waitForURL(`**/v/${ventureId}/command`);
  await expect(invitee.getByRole("heading", { level: 1, name: "Command Centre" })).toBeVisible();

  // Managers have no Team navigation, and the route itself refuses them (server-side).
  const memberNav = await openNavigation(invitee);
  await expect(memberNav.getByRole("button", { name: /Current venture/ })).toContainText("Manager");
  await expect(memberNav.getByRole("link", { name: "Team & permissions" })).toHaveCount(0);
  await invitee.goto(`/v/${ventureId}/settings/team`);
  await expect(
    invitee.getByRole("heading", { name: "You don’t have access to team and permissions." }),
  ).toBeVisible();
  await expect(invitee.getByText("Owner or Admin")).toBeVisible();
  await expectNoA11yViolations(invitee);

  // The Owner sees the new member and changes their role.
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: member.email });
  await expect(row).toContainText("Manager");
  await row.getByText(`Manage ${member.name}`).click();
  await row.getByLabel(`Role for ${member.name}`).selectOption("viewer");
  await row.getByRole("button", { name: "Change role" }).click();
  await expect(row.getByRole("status")).toHaveText("Role updated.");
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: member.email })).toContainText("Viewer");

  await invitee.goto(`/v/${ventureId}`);
  await expect(
    (await openNavigation(invitee)).getByRole("button", { name: /Current venture/ }),
  ).toContainText("Viewer");
  await inviteeContext.close();
});

test("venture switcher lists the user's active ventures and switches between them", async ({
  page,
}) => {
  const owner = await createVerifiedUser(page, "multi");
  await signIn(page, owner, "/onboarding");
  const first = await onboardVenture(page, "Alpha Works");
  const second = await onboardVenture(page, "Beta Supplies");

  const nav = await openNavigation(page);
  const switcher = nav.getByRole("button", { name: /Current venture: Beta Supplies/ });
  await expect(switcher).toHaveAttribute("aria-expanded", "false");
  await switcher.click();
  await expect(switcher).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: /Beta Supplies/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectNoA11yViolations(page);
  await nav.getByRole("link", { name: /Alpha Works/ }).click();
  await page.waitForURL(`**/v/${first}/command`);
  await expect(page.getByRole("banner")).toContainText("Alpha Works");
  expect(second).not.toBe(first);
});
