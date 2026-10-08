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
test.setTimeout(240_000);
test("Operate Technology reference render and accessibility", async ({ page }) => {
  const owner = await createVerifiedUser(page, "operate-technology");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/technology`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Technology Monitor · Sample data" }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(9);
  await expect(
    page.getByRole("region", { name: /Active Alerts/ }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Every static asset loads at its exact Figma dimensions.
  const images = page.locator("main img");
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.every(
          (e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  const sparkline = page.getByRole("img", { name: /Sample CPU Usage trend/ });
  const box = await sparkline.boundingBox();
  expect(box?.width).toBe(120);
  expect(box?.height).toBeCloseTo(21.4553, 1);
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("link", { name: "Technology", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("Sample status: All systems operational")).toBeVisible();
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    const service = page.getByRole("columnheader", { name: "Service" });
    expect((await service.boundingBox())?.width).toBe(256);
  }
  await page.addStyleTag({ content: "nextjs-portal {display:none;}" });
  await page.screenshot({
    path: `docs/verification/operate-technology/${test.info().project.name}.png`,
  });
  await page.screenshot({
    path: `docs/verification/operate-technology/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  await page.getByText("Sample records & source notes", { exact: true }).click();
  await expect(page.getByText(/not live GS Appliance technology records/)).toBeVisible();
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile") {
    const region = page.getByRole("region", { name: "Sample service health", exact: true });
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Technology", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});
test("Technology admits Operator and denies Viewer, outsider and unknown venture", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "technology-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Technology private venture");
  for (const role of ["operator", "viewer"] as const) {
    const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
    const memberPage = await context.newPage();
    const member = await createVerifiedUser(memberPage, `technology-${role}`);
    await page.goto(`/v/${ventureId}/settings/team`);
    await page.getByLabel("Email address").fill(member.email);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
    const link = linkFrom(await latestEmail(page.request, member.email, /invit/i), "/invite/");
    await signIn(memberPage, member, link);
    await memberPage.getByRole("button", { name: "Accept invitation and continue" }).click();
    await memberPage.waitForURL(`**/v/${ventureId}/command`);
    // The sidebar is collapsed into the menu on mobile, so query its markup directly.
    const nav = memberPage.locator('aside[aria-label="Venture navigation"]');
    const entry = (tag: string) => nav.locator(tag, { hasText: /^Technology$/ });
    if (role === "operator") {
      await expect(entry("a")).toHaveAttribute("href", `/v/${ventureId}/operate/technology`);
    } else {
      await expect(entry("a")).toHaveCount(0);
      await expect(entry("span")).toHaveAttribute("title", "Operator access required");
    }
    await memberPage.goto(`/v/${ventureId}/operate/technology`);
    if (role === "operator") {
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "Technology Monitor · Sample data" }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(1);
    } else {
      await expect(
        memberPage.getByRole("heading", { name: "You don’t have access to this venture." }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(0);
      await expect(memberPage.getByText("ServiceM8 API")).toHaveCount(0);
    }
    await expectNoA11yViolations(memberPage);
    await context.close();
  }
  const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await context.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "technology-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/technology`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("Technology private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/technology");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await context.close();
});
