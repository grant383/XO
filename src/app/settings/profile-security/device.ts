/**
 * A readable device label from a session's User-Agent ("Chrome on macOS"). Display only:
 * user agents are client-supplied, so this never drives a security decision.
 */
export type DeviceKind = "desktop" | "mobile";

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: Array<[RegExp, string, DeviceKind]> = [
  [/iPhone/, "iPhone", "mobile"],
  [/iPad/, "iPad", "mobile"],
  [/Android/, "Android", "mobile"],
  [/Mac OS X|Macintosh/, "macOS", "desktop"],
  [/Windows/, "Windows", "desktop"],
  [/CrOS/, "ChromeOS", "desktop"],
  [/Linux/, "Linux", "desktop"],
];

export function describeDevice(userAgent: string | null): { label: string; kind: DeviceKind } {
  if (!userAgent) return { label: "Unknown device", kind: "desktop" };
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent));
  const kind = system?.[2] ?? (/Mobile/.test(userAgent) ? "mobile" : "desktop");
  if (browser && system) return { label: `${browser} on ${system[1]}`, kind };
  if (browser) return { label: browser, kind };
  if (system) return { label: system[1], kind };
  return { label: "Unknown device", kind };
}
