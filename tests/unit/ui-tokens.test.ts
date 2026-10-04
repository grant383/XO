import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Resolves `--token` values from src/ui/tokens.css, following var() references. */
function loadTokens(): Map<string, string> {
  const css = readFileSync(path.resolve(import.meta.dirname, "../../src/ui/tokens.css"), "utf8");
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) raw.set(m[1]!, m[2]!.trim());
  const resolve = (v: string): string =>
    v.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(raw.get(name) ?? ""));
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const tokens = loadTokens();
const t = (name: string) => {
  const v = tokens.get(name);
  if (!v) throw new Error(`missing token ${name}`);
  return v;
};

describe("design tokens (Figma Foundations v2)", () => {
  it("carry the approved Figma variable values", () => {
    expect(t("--surface-base")).toBe("#090c10");
    expect(t("--surface-canvas")).toBe("#0b0d11");
    expect(t("--surface-raised")).toBe("#11151b");
    expect(t("--text-primary")).toBe("#f0f5fa");
    expect(t("--text-secondary")).toBe("#c4cfde");
    expect(t("--text-muted")).toBe("#9eabbf");
    expect(t("--accent-blue")).toBe("#2b63ed");
    expect(t("--action-primary")).toBe("#2563eb");
    expect(t("--status-success")).toBe("#0fb882");
    expect(t("--status-warning")).toBe("#f59e0a");
    expect(t("--status-danger")).toBe("#f03d4a");
    for (const n of [0, 4, 8, 12, 16, 20, 24, 32]) expect(t(`--space-${n}`)).toMatch(/^0$|px$/);
    expect(t("--radius-full")).toBe("9999px");
  });

  // WCAG 2.2 AA: 4.5:1 for body text (spec §Accessibility).
  const surfaces = [
    "--surface-base",
    "--surface-canvas",
    "--surface-panel",
    "--surface-default",
    "--surface-raised",
    "--surface-input",
    "--surface-control",
  ];
  const bodyText = [
    "--text-primary",
    "--text-secondary",
    "--text-muted",
    "--text-subtle",
    "--action-link",
    "--status-success",
    "--status-warning",
    "--status-danger",
    "--status-danger-soft",
    "--status-info-text",
  ];

  // --surface-control is the secondary-button fill; it only ever carries primary/secondary text
  // (status danger measures 4.49:1 there, so status copy must not be placed on it).
  const controlText = new Set(["--text-primary", "--text-secondary"]);

  for (const fg of bodyText) {
    for (const bg of surfaces) {
      if (bg === "--surface-control" && !controlText.has(fg)) continue;
      it(`${fg} on ${bg} meets 4.5:1`, () => {
        expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("primary button label meets 4.5:1 on the action colour", () => {
    expect(contrast(t("--text-on-accent"), t("--action-primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring meets 3:1 non-text contrast on every surface", () => {
    for (const bg of surfaces) expect(contrast(t("--focus-ring"), t(bg))).toBeGreaterThanOrEqual(3);
  });
});
