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
test("Client CRM reference render, interactions and accessibility", async ({ page }) => {
  const owner = await createVerifiedUser(page, "operate-crm");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/crm`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Client Management · Sample data" }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Sample clients" });
  const rowHeaders = table.getByRole("rowheader");
  await expect(rowHeaders).toHaveCount(10);
  await expect(rowHeaders.first()).toHaveText("Oakwood Estates");
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
  expect(
    await page.locator('main img[src="/ui/crm/star.svg"]').first().boundingBox(),
  ).toMatchObject({ width: 12, height: 12 });
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("banner").getByText("Total Clients:")).toBeVisible();
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    const segments = page.getByRole("region", { name: "Client segments (by revenue)" });
    expect((await segments.boundingBox())?.width).toBe(500);
  }
  await page.addStyleTag({ content: "nextjs-portal {display:none;}" });
  await page.screenshot({ path: `docs/verification/operate-crm/${test.info().project.name}.png` });
  await page.screenshot({
    path: `docs/verification/operate-crm/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);

  // Sorting: Total Spend starts descending; Client toggles A→Z then Z→A.
  const spend = page.getByRole("columnheader", { name: "Total Spend" });
  await expect(spend).toHaveAttribute("aria-sort", "descending");
  const client = page.getByRole("columnheader", { name: "Client", exact: true });
  await client.getByRole("button").click();
  await expect(client).toHaveAttribute("aria-sort", "ascending");
  await expect(spend).not.toHaveAttribute("aria-sort", /./);
  await expect(rowHeaders.first()).toHaveText("Apex Dev Group");
  await client.getByRole("button").click();
  await expect(client).toHaveAttribute("aria-sort", "descending");
  await expect(rowHeaders.first()).toHaveText("Summit Ventures");

  // Filters and search announce results and narrow the directory.
  await page.getByLabel("Client status").selectOption("At Risk");
  await expect(rowHeaders).toHaveText(["Greenfield Clinic"]);
  await expect(page.getByText("1 of 10 sample clients shown")).toBeAttached();
  await page.getByLabel("Client status").selectOption("all");
  await page.getByLabel("Client type").selectOption("Residential");
  await expect(rowHeaders).toHaveCount(3);
  await page.getByLabel("Client type").selectOption("all");
  const search = page.getByRole("searchbox", { name: "Search clients" });
  await search.fill("mrs");
  await expect(rowHeaders).toHaveText(["Mrs Patterson", "Mrs Chen"]);
  await search.fill("no such client");
  await expect(page.getByRole("heading", { name: "No sample clients match" })).toBeVisible();
  await expect(table).toHaveCount(0);
  await expectDeviceWidthLayout(page);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(rowHeaders).toHaveCount(10);
  await expect(rowHeaders.first()).toHaveText("Oakwood Estates");

  await expectDeviceWidthLayout(page);
  const notes = page.getByText("Sample records & source notes", { exact: true });
  await expect(notes).toBeVisible();
  await notes.click();
  await expect(page.getByText(/not live GS Appliance client records/)).toBeVisible();
  await expectDeviceWidthLayout(page);
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile") {
    const region = page.getByRole("region", { name: "Sample client directory", exact: true });
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Clients", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});
test("Client CRM admits Operator and denies Viewer, outsider and unknown venture", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "crm-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "CRM private venture");
  for (const role of ["operator", "viewer"] as const) {
    const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
    const memberPage = await context.newPage();
    const member = await createVerifiedUser(memberPage, `crm-${role}`);
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
    const entry = (tag: string) => nav.locator(tag, { hasText: /^Clients$/ });
    if (role === "operator") {
      await expect(entry("a")).toHaveAttribute("href", `/v/${ventureId}/operate/crm`);
    } else {
      await expect(entry("a")).toHaveCount(0);
      await expect(entry("span")).toHaveAttribute("title", "Operator access required");
    }
    await memberPage.goto(`/v/${ventureId}/operate/crm`);
    if (role === "operator") {
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "Client Management · Sample data" }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(1);
    } else {
      await expect(
        memberPage.getByRole("heading", { name: "You don’t have access to this venture." }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(0);
      await expect(memberPage.getByText("Oakwood Estates")).toHaveCount(0);
    }
    await expectNoA11yViolations(memberPage);
    await context.close();
  }
  const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await context.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "crm-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/crm`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("CRM private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/crm");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await context.close();
});
