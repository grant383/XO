import { describe, expect, it } from "vitest";
import { describeDevice } from "@/app/settings/profile-security/device";

describe("describeDevice", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Chrome on macOS",
      "desktop",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
      "mobile",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
      "mobile",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      "Edge on Windows",
      "desktop",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Firefox on Linux",
      "desktop",
    ],
    ["vitest", "Unknown device", "desktop"],
  ])("%s → %s", (ua, label, kind) => {
    expect(describeDevice(ua)).toEqual({ label, kind });
  });

  it("handles a missing user agent", () => {
    expect(describeDevice(null)).toEqual({ label: "Unknown device", kind: "desktop" });
  });
});
