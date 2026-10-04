import { expect, test } from "@playwright/test";
import { totp } from "../helpers/totp";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, PASSWORD, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const PATH = "/settings/profile-security";

/**
 * Profile & Security (Figma 33:3534, ADR-0016): personal details, MFA set-up and
 * management through the UI, device sign-out and password change. Account-level: no
 * venture is in context.
 */
test("profile, MFA, devices and password are managed from Profile & Security", async ({
  page,
  browser,
}) => {
  const user = await createVerifiedUser(page, "profile");
  await signIn(page, user, PATH);
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Profile & Security" })).toBeVisible();
  // Account-level: the top bar names the account, never a venture.
  await expect(
    page.getByRole("banner").getByText("Account", { exact: true }).first(),
  ).toBeVisible();
  // Interactive controls are client components; wait for hydration before using them.
  await page.waitForLoadState("networkidle");
  await expectNoA11yViolations(page);

  // Personal details: the name is editable, the sign-in email is not.
  const name = page.getByLabel("Full name");
  await name.fill("Avery Quinn");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your name has been updated.")).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Work email")).toHaveValue(user.email);

  // A second device signs in; it is listed and can be signed out from here.
  const other = await browser.newContext({ extraHTTPHeaders: isolatedIp(), baseURL: ORIGIN });
  const otherSignIn = await other.request.post("/api/v1/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: {
      origin: ORIGIN,
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    },
  });
  expect(otherSignIn.status()).toBe(200);
  await page.reload();
  const sessions = page.getByRole("region", { name: "Active sessions" });
  await expect(sessions.getByText("This device")).toBeVisible();
  const phone = sessions.getByRole("listitem").filter({ hasText: "Safari on iPhone" });
  await expect(phone).toBeVisible();
  await phone.getByRole("button", { name: "Sign out Safari on iPhone" }).click();
  await expect(phone).toHaveCount(0);
  expect(await (await other.request.get("/api/v1/auth/get-session")).json()).toBeNull();
  await other.close();
  await expect(
    sessions.getByRole("button", { name: "Sign out all other sessions" }),
  ).toBeDisabled();

  // MFA set-up: password, QR code and key, first code, backup codes shown once.
  const auth = page.getByRole("region", { name: "Password & authentication" });
  await expect(auth.getByText(/Not set up/)).toBeVisible();
  await auth.getByRole("button", { name: "Set up MFA" }).click();
  await auth.getByLabel("Confirm your password").fill(user.password);
  await auth.getByRole("button", { name: "Continue" }).click();
  await expect(auth.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const manualKey = (await auth.locator("code").textContent())!.replace(/\s+/g, "");
  expect(manualKey).toMatch(/^[A-Z2-7]+$/);
  await expectNoA11yViolations(page);

  await auth.getByLabel("Enter the 6-digit code it shows").fill("000000");
  await auth.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(auth.getByRole("alert").filter({ hasText: "That code didn’t work" })).toBeVisible();

  await auth.getByLabel("Enter the 6-digit code it shows").fill(totp(manualKey));
  await auth.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(auth.getByText("Save these backup codes now")).toBeVisible();
  const codes = auth.getByRole("list", { name: "Backup codes" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  const firstCode = (await codes.first().textContent())!;
  await auth.getByRole("button", { name: "I’ve saved my codes" }).click();
  await expect(
    auth.getByText("Authenticator app enabled · 10 backup codes available"),
  ).toBeVisible();

  // The session was rotated by enrolment; the page keeps working.
  await page.reload();
  await expect(auth.getByText("Authenticator app enabled")).toBeVisible();

  // New backup codes replace the old ones.
  await auth.getByRole("button", { name: "Manage MFA" }).click();
  const codesPanel = auth.getByRole("region", { name: "Backup codes" });
  await codesPanel.getByLabel("Confirm your password").fill(user.password);
  await codesPanel.getByRole("button", { name: "Create new backup codes" }).click();
  await expect(
    codesPanel.getByRole("list", { name: "Backup codes" }).getByRole("listitem"),
  ).toHaveCount(10);
  await expect(codesPanel.getByText(firstCode, { exact: true })).toBeHidden();

  // Turning MFA off needs the password (and a recent sign-in, which this is).
  const off = auth.getByRole("region", { name: "Turn off two-step verification" });
  await off.getByLabel("Confirm your password").fill("not-my-password-123");
  await off.getByRole("button", { name: "Turn off" }).click();
  await expect(off.getByRole("alert")).toBeVisible();
  await off.getByLabel("Confirm your password").fill(user.password);
  await off.getByRole("button", { name: "Turn off" }).click();
  await expect(auth.getByText(/Not set up/)).toBeVisible();

  // Password change keeps this device signed in.
  const newPassword = `${PASSWORD}-changed`;
  await auth.getByRole("button", { name: "Change password" }).click();
  await auth.getByLabel("Current password").fill(user.password);
  await auth.getByLabel("New password", { exact: true }).fill(newPassword);
  await auth.getByLabel("Confirm new password").fill(newPassword);
  await auth.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByText("Password changed. Every other device has been signed out."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Profile & Security" })).toBeVisible();

  // The account menu links here, and the page signs out.
  await page.getByRole("button", { name: "Sign out of DirectorXO" }).click();
  await page.waitForURL(/\/auth\/login$/);
});

test("Profile & Security requires sign-in and returns there afterwards", async ({ page }) => {
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fsettings%2Fprofile-security$/);
});
