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

test("Finance renders the labelled reference at desktop and mobile sizes", async ({ page }) => {
  const owner = await createVerifiedUser(page, "finance");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/finance`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Finance · Sample data" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Sample accounts receivable" }).getByRole("row"),
  ).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Sample accounts payable" }).getByRole("row"),
  ).toHaveCount(5);
  await expect(page.getByText("£34,200", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('img[src^="/ui/finance/"]')].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  if (test.info().project.name === "desktop") {
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    expect((await page.getByRole("banner").boundingBox())?.height).toBe(48);
    for (const [name, x, y, width, height] of [
      ["6-month cash flow & running balance", 252, 284, 732, 230],
      ["Upcoming liabilities (accounts payable)", 252, 538, 732, 250],
      ["Accounts receivable", 1008, 284, 400, 372],
      ["Quick ratios & metrics", 1008, 680, 400, 208],
    ] as const) {
      expect(await page.getByRole("region", { name, exact: true }).boundingBox()).toMatchObject({
        x,
        y,
        width,
        height,
      });
    }
    const assets = await page.locator('main img[src^="/ui/finance/"]').evaluateAll((images) =>
      images.map((image) => {
        const img = image as HTMLImageElement;
        return {
          width: Number.parseFloat(getComputedStyle(img).width),
          height: Number.parseFloat(getComputedStyle(img).height),
          expectedWidth: Number(img.getAttribute("width")),
          expectedHeight: Number(img.getAttribute("height")),
        };
      }),
    );
    for (const asset of assets) {
      // Chromium quantizes CSS layout to fractions of a pixel.
      expect(asset.width).toBeCloseTo(asset.expectedWidth, 1);
      expect(asset.height).toBe(asset.expectedHeight);
    }

    await expect(page.getByRole("link", { name: "Finance", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Command", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.addStyleTag({ content: "nextjs-portal { display:none; }" });
  await page.screenshot({ path: `docs/verification/finance/${test.info().project.name}.png` });
  await page.screenshot({
    path: `docs/verification/finance/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  await page.getByText("Sample records & source notes", { exact: true }).click();
  await expect(page.getByText(/not live GS Appliance financial figures/)).toBeVisible();
  for (const name of [
    "Sample transactions",
    "Sample quotes",
    "Sample budgets",
    "Sample reconciliation",
  ])
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile") {
    for (const name of [
      "Sample cash-flow chart, March to August 2026. Illustrative bars and running balance; source has no numeric axis.",
      "Sample accounts payable",
      "Sample accounts receivable",
    ]) {
      const region = page.getByRole("region", { name, exact: true });
      await region.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Finance", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});

test("Finance preserves Viewer access and denies outsiders", async ({ page, browser }) => {
  const owner = await createVerifiedUser(page, "finance-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Finance private venture");
  const viewerContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const viewerPage = await viewerContext.newPage();
  const viewer = await createVerifiedUser(viewerPage, "finance-viewer");
  await page.goto(`/v/${ventureId}/settings/team`);
  await page.getByLabel("Email address").fill(viewer.email);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  const link = linkFrom(await latestEmail(page.request, viewer.email, /invit/i), "/invite/");
  await signIn(viewerPage, viewer, link);
  await viewerPage.getByRole("button", { name: "Accept invitation and continue" }).click();
  await viewerPage.waitForURL(`**/v/${ventureId}/command`);
  await viewerPage.goto(`/v/${ventureId}/operate/finance`);
  await expect(
    viewerPage.getByRole("heading", { level: 1, name: "Finance · Sample data" }),
  ).toBeVisible();
  await expect(viewerPage.getByRole("table")).toHaveCount(2);
  await expect(viewerPage.locator("main form")).toHaveCount(0);
  await expectNoA11yViolations(viewerPage);
  const outsiderContext = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await outsiderContext.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "finance-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/finance`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("Finance private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await expect(outsiderPage.getByText("£34,200")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/finance");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await viewerContext.close();
  await outsiderContext.close();
});
