import { describe, expect, it } from "vitest";
import { resumePath, stepPath } from "@/app/onboarding/routes";

const id = "0b9c6f1e-4a5d-4c1e-9f3a-2d7e8b6c5a41";

describe("onboarding routes", () => {
  it("keeps the venture in every step route", () => {
    expect(stepPath(id, "business")).toBe(`/onboarding/${id}/business`);
    expect(stepPath(id, "data-connections")).toBe(`/onboarding/${id}/data-connections`);
    expect(stepPath(id, "review")).toBe(`/onboarding/${id}/review`);
  });

  it.each([
    ["business", `/onboarding/${id}/business`],
    ["data_connections", `/onboarding/${id}/data-connections`],
    ["review", `/onboarding/${id}/review`],
    ["completed", "/"],
  ] as const)("resumes %s at %s", (step, path) => {
    expect(resumePath(id, step)).toBe(path);
  });
});
