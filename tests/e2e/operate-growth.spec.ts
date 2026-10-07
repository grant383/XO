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
test("Operate Growth reference render and accessibility", async ({ page }) => {
  const owner = await createVerifiedUser(page, "operate-growth");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/growth`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Growth Engine · Sample data" }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Customer acquisition funnel" }).getByRole("listitem"),
  ).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const chart = page.locator("main img");
  await expect
    .poll(() =>
      chart.evaluate(
        (element) =>
          (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);
  const box = await chart.boundingBox();
  expect(box?.width).toBe(548);
  expect(box?.height).toBe(141);
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("link", { name: "Growth", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    expect(
      (await page.getByRole("region", { name: "Revenue growth trend" }).boundingBox())?.width,
    ).toBe(400);
  }
  await page.addStyleTag({ content: "nextjs-portal {display:none;}" });
  await page.screenshot({
    path: `docs/verification/operate-growth/${test.info().project.name}.png`,
  });
  await page.screenshot({
    path: `docs/verification/operate-growth/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  await page.getByText("Sample records & source notes", { exact: true }).click();
  await expect(page.getByText(/not live GS Appliance growth or pipeline records/)).toBeVisible();
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile") {
    const region = page.getByRole("region", { name: "Sample revenue clients", exact: true });
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Growth", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});
test("Growth admits Operator and denies Viewer, outsider and unknown venture", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "growth-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Growth private venture");
  for (const role of ["operator", "viewer"] as const) {
    const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
    const memberPage = await context.newPage();
    const member = await createVerifiedUser(memberPage, `growth-${role}`);
    await page.goto(`/v/${ventureId}/settings/team`);
    await page.getByLabel("Email address").fill(member.email);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
    const link = linkFrom(await latestEmail(page.request, member.email, /invit/i), "/invite/");
    await signIn(memberPage, member, link);
    await memberPage.getByRole("button", { name: "Accept invitation and continue" }).click();
    await memberPage.waitForURL(`**/v/${ventureId}/command`);
    await memberPage.goto(`/v/${ventureId}/operate/growth`);
    if (role === "operator") {
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "Growth Engine · Sample data" }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(1);
    } else {
      await expect(
        memberPage.getByRole("heading", { name: "You don’t have access to this venture." }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(0);
      await expect(memberPage.getByText("£1,840")).toHaveCount(0);
    }
    await expectNoA11yViolations(memberPage);
    await context.close();
  }
  const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await context.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "growth-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/growth`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("Growth private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/growth");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await context.close();
});
