/** Spec §13.11. Currency amounts are integer minor units; inputs are a period snapshot. */
export function growthGap(input: {
  targetRevenue: number;
  forecastRevenue: number;
  averageValue: number;
  conversionRate: number;
}) {
  for (const amount of [input.targetRevenue, input.forecastRevenue, input.averageValue]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError("Invalid money amount");
  }
  if (
    input.averageValue === 0 ||
    !Number.isFinite(input.conversionRate) ||
    input.conversionRate <= 0 ||
    input.conversionRate > 1
  )
    throw new RangeError("Average value and conversion must be positive");
  const targetGap = input.targetRevenue - input.forecastRevenue;
  const additionalSales = Math.max(0, targetGap);
  const additionalCustomers = Math.ceil(additionalSales / input.averageValue);
  const additionalLeads = Math.ceil(additionalCustomers / input.conversionRate);
  if (!Number.isSafeInteger(additionalLeads))
    throw new RangeError("Result exceeds supported range");
  return { targetGap, additionalSales, additionalCustomers, additionalLeads };
}
