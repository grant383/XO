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

/**
 * The page lays out at the device width with no document-level horizontal overflow.
 * Mobile Chrome widens the layout viewport (innerWidth) to fit overflowing content, so
 * comparing scrollWidth with innerWidth alone cannot catch it; compare with the viewport.
 */
async function expectDeviceWidthLayout(page: Page) {
  const width = page.viewportSize()?.width;
  const layout = await page.evaluate(() => ({
    inner: innerWidth,
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(layout.inner).toBe(width);
  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
}
test.setTimeout(240_000);
test("Scheduling reference render, week navigation and accessibility", async ({ page }) => {
  const owner = await createVerifiedUser(page, "operate-schedule");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/schedule`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Job Scheduling · Sample data" }),
  ).toBeVisible();
  const week = page.getByRole("group", { name: "Week" });
  await expect(week.getByText("Week of 31 Aug 2026")).toBeVisible();
  const calendar = page.getByRole("table", { name: "Sample bookings, Week of 31 Aug 2026" });
  await expect(calendar.getByRole("rowheader")).toHaveText([
    "James Cooper",
    "Marcus Brown",
    "Tom Richards",
    "David Okafor",
    "Lisa Chen",
  ]);
  await expect(calendar.getByRole("columnheader").nth(1)).toHaveText("Mon31 Aug");
  await expect(calendar.getByRole("columnheader").nth(5)).toHaveText("Fri4 Sep");
  await page.evaluate(() => document.fonts.ready);
  await expectDeviceWidthLayout(page);
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
  for (const side of ["left", "right"]) {
    expect(
      await page.locator(`main img[src="/ui/schedule/chevron-${side}.svg"]`).boundingBox(),
    ).toMatchObject({ width: 10, height: 10 });
  }
  // The heatmap name column keeps the reference 156px, so utilisation is never clipped.
  const heatmap = page.getByRole("table", { name: "Sample capacity, Week of 31 Aug 2026" });
  expect((await heatmap.getByRole("rowheader").first().boundingBox())?.width).toBe(156);
  await expect(heatmap.getByText("95%")).toBeVisible();
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("link", { name: "Scheduling", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    // At 1440px the calendar spans the full 1156px content width, team column 156px.
    const region = page.getByRole("region", { name: "Sample team calendar" });
    expect((await region.boundingBox())?.width).toBe(1156);
    expect((await calendar.getByRole("columnheader").first().boundingBox())?.width).toBe(156);
    const alerts = page.getByRole("region", { name: "Scheduling Alerts" });
    expect((await alerts.boundingBox())?.width).toBe(400);
  }
  await page.addStyleTag({ content: "nextjs-portal {display:none;}" });
  await page.screenshot({
    path: `docs/verification/operate-schedule/${test.info().project.name}.png`,
  });
  await page.screenshot({
    path: `docs/verification/operate-schedule/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);

  // Week navigation: other weeks have no samples and offer a way back.
  await week.getByRole("button", { name: "Next week" }).click();
  await expect(week.getByText("Week of 7 Sep 2026")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No sample jobs this week" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expectDeviceWidthLayout(page);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Back to sample week" }).click();
  await expect(week.getByText("Week of 31 Aug 2026")).toBeVisible();
  await expect(calendar).toBeVisible();
  await week.getByRole("button", { name: "Previous week" }).click();
  await expect(week.getByText("Week of 24 Aug 2026")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No sample jobs this week" })).toBeVisible();
  await week.getByRole("button", { name: "Next week" }).click();
  await expect(calendar.getByRole("rowheader")).toHaveCount(5);

  const notes = page.getByText("Sample schedule & source notes", { exact: true });
  await notes.click();
  await expect(page.getByText(/1 Sep 2026 is a Tuesday/)).toBeVisible();
  await expectDeviceWidthLayout(page);
  await expectNoA11yViolations(page);

  if (test.info().project.name === "mobile") {
    // The days scroll inside the card while the team column stays pinned.
    const region = page.getByRole("region", { name: "Sample team calendar" });
    const member = calendar.getByRole("rowheader", { name: "James Cooper" });
    const before = await member.boundingBox();
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect((await member.boundingBox())?.x).toBe(before?.x);
    await expectDeviceWidthLayout(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Scheduling", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});
test("Scheduling admits Operator and denies Viewer, outsider and unknown venture", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "schedule-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Scheduling private venture");
  for (const role of ["operator", "viewer"] as const) {
    const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
    const memberPage = await context.newPage();
    const member = await createVerifiedUser(memberPage, `schedule-${role}`);
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
    const entry = (tag: string) => nav.locator(tag, { hasText: /^Scheduling$/ });
    if (role === "operator") {
      await expect(entry("a")).toHaveAttribute("href", `/v/${ventureId}/operate/schedule`);
    } else {
      await expect(entry("a")).toHaveCount(0);
      await expect(entry("span")).toHaveAttribute("title", "Operator access required");
    }
    await memberPage.goto(`/v/${ventureId}/operate/schedule`);
    if (role === "operator") {
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "Job Scheduling · Sample data" }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(2);
    } else {
      await expect(
        memberPage.getByRole("heading", { name: "You don’t have access to this venture." }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(0);
      await expect(memberPage.getByText("Oakwood Est bathroom")).toHaveCount(0);
    }
    await expectNoA11yViolations(memberPage);
    await context.close();
  }
  const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await context.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "schedule-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/schedule`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("Scheduling private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/schedule");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await context.close();
});
