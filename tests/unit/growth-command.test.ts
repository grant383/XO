import { describe, expect, it } from "vitest";
import { growthGap } from "@/modules/growth-command";

describe("spec §13.11 growth gap", () => {
  it("reproduces the fixed annual sample, rounding customers before leads", () => {
    expect(
      growthGap({
        targetRevenue: 100_000_000,
        forecastRevenue: 61_200_000,
        averageValue: 128_000,
        conversionRate: 0.33,
      }),
    ).toEqual({
      targetGap: 38_800_000,
      additionalSales: 38_800_000,
      additionalCustomers: 304,
      additionalLeads: 922,
    });
  });
  it("preserves a surplus but never recommends negative additional sales", () => {
    expect(
      growthGap({ targetRevenue: 100, forecastRevenue: 120, averageValue: 10, conversionRate: 1 }),
    ).toEqual({ targetGap: -20, additionalSales: 0, additionalCustomers: 0, additionalLeads: 0 });
  });
  it("does not divide by zero or accept fractional money or invalid rates", () => {
    const valid = {
      targetRevenue: 100,
      forecastRevenue: 50,
      averageValue: 10,
      conversionRate: 0.5,
    };
    for (const patch of [
      { averageValue: 0 },
      { targetRevenue: 0.5 },
      { forecastRevenue: -1 },
      { conversionRate: 0 },
      { conversionRate: 1.1 },
      { conversionRate: NaN },
      { conversionRate: Number.MIN_VALUE },
    ])
      expect(() => growthGap({ ...valid, ...patch })).toThrow(RangeError);
  });
});
