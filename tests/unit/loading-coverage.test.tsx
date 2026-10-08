import { readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OnboardingLoading from "@/app/onboarding/loading";
import InvitationLoading from "@/app/invite/[token]/loading";
import RequestAccessLoading from "@/app/v/[ventureId]/request-access/loading";

const APP = path.resolve(import.meta.dirname, "../../src/app");

/**
 * Every page and the loading boundary (Figma 54:27792) that covers it. A new page must be
 * added here, so loading coverage is decided explicitly rather than by accident.
 *
 * `null`: deliberately no streaming boundary. The entry route and auth pages either redirect
 * at once or render without data work; a fallback would flush first and turn their server
 * redirects (session, MFA challenge, sign-in) into client-side redirects. Error pages are
 * static.
 */
const EXPECTED: Record<string, string | null> = {
  "page.tsx": null,
  "auth/forgot-password/page.tsx": null,
  "auth/login/error/page.tsx": null,
  "auth/login/page.tsx": null,
  "auth/mfa/page.tsx": null,
  "auth/register/page.tsx": null,
  "auth/reset-password/page.tsx": null,
  "auth/reset-password/success/page.tsx": null,
  "auth/session-expired/page.tsx": null,
  "auth/verify-email/page.tsx": null,
  "errors/403/page.tsx": null,
  "errors/404/page.tsx": null,
  "errors/500/page.tsx": null,
  "invite/[token]/page.tsx": "invite/[token]/loading.tsx",
  "onboarding/page.tsx": "onboarding/loading.tsx",
  "onboarding/[ventureId]/page.tsx": "onboarding/loading.tsx",
  "onboarding/[ventureId]/business/page.tsx": "onboarding/loading.tsx",
  "onboarding/[ventureId]/data-connections/page.tsx": "onboarding/loading.tsx",
  "onboarding/[ventureId]/review/page.tsx": "onboarding/loading.tsx",
  "settings/billing/page.tsx": "settings/billing/loading.tsx",
  "settings/notifications-activity/page.tsx": "settings/notifications-activity/loading.tsx",
  "settings/profile-security/page.tsx": "settings/profile-security/loading.tsx",
  "support/page.tsx": "support/loading.tsx",
  "v/[ventureId]/request-access/page.tsx": "v/[ventureId]/request-access/loading.tsx",
  // Redirect-only entry points (legacy dashboard, venture index → Command Centre).
  "dashboard/page.tsx": null,
  "v/[ventureId]/page.tsx": null,
  "v/[ventureId]/(shell)/command/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/command/growth-1m/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/operate/finance/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/operate/growth/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/operate/operations/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/operate/technology/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
  "v/[ventureId]/(shell)/settings/team/page.tsx": "v/[ventureId]/(shell)/loading.tsx",
};

function files(dir: string, name: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => path.basename(f) === name)
    .map((f) => f.split(path.sep).join("/"))
    .sort();
}

/** The nearest `loading.tsx` in the page's folder or an ancestor (Next.js nesting). */
function nearestLoading(page: string, loadings: Set<string>): string | null {
  let dir = path.posix.dirname(page);
  for (;;) {
    const candidate = dir === "." ? "loading.tsx" : `${dir}/loading.tsx`;
    if (loadings.has(candidate)) return candidate;
    if (dir === ".") return null;
    dir = path.posix.dirname(dir);
  }
}

describe("application loading coverage (Figma 54:27792)", () => {
  const pages = files(APP, "page.tsx");
  const loadings = new Set(files(APP, "loading.tsx"));

  it("lists every page explicitly", () => {
    expect(pages).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(pages)("%s resolves to its expected loading boundary", (page) => {
    expect(nearestLoading(page, loadings)).toBe(EXPECTED[page]);
  });

  it.each([
    ["onboarding", OnboardingLoading],
    ["invitation", InvitationLoading],
    ["request access", RequestAccessLoading],
  ])("%s loading announces a polite status", (_, Loading) => {
    const out = renderToStaticMarkup(<Loading />);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
  });
});
