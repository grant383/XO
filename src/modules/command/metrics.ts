/**
 * Command Centre "Today's numbers" (Figma 8:651). Each metric names the operational
 * records that will drive it (spec §19 P1 exit: "Operational records drive Command
 * metrics"). Those records belong to the Operate modules, which have not shipped, so every
 * metric currently reports `awaiting_source` rather than a placeholder figure. When a source
 * module ships, its metric resolves to `available` with provenance and freshness.
 */

export const METRIC_KEYS = [
  "revenue_mtd",
  "jobs_completed",
  "pipeline_value",
  "average_job_value",
  "customer_satisfaction",
  "cash_position",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricUnit = "money" | "count" | "score";

type MetricDefinition = { key: MetricKey; label: string; unit: MetricUnit; source: string };

/** Figma tile order and labels; `source` is the spec module expected to supply it. */
export const METRICS: readonly MetricDefinition[] = [
  { key: "revenue_mtd", label: "Revenue MTD", unit: "money", source: "Finance invoices" },
  { key: "jobs_completed", label: "Jobs completed", unit: "count", source: "Operations jobs" },
  { key: "pipeline_value", label: "Pipeline value", unit: "money", source: "Growth pipeline" },
  {
    key: "average_job_value",
    label: "Avg job value",
    unit: "money",
    source: "Finance invoices and Operations jobs",
  },
  {
    key: "customer_satisfaction",
    label: "Customer sat",
    unit: "score",
    // Not in spec §16; tracked as a design-sync item in the implementation matrix.
    source: "No customer-feedback source is defined yet",
  },
  { key: "cash_position", label: "Cash position", unit: "money", source: "Finance balances" },
];

export type CommandMetric = MetricDefinition &
  (
    | { status: "awaiting_source" }
    | {
        status: "available";
        /** Money in integer minor units (spec §14); counts as integers; scores as decimals. */
        value: number;
        /** Change against the comparison period, as a ratio (0.12 = +12%); null if unknown. */
        change: number | null;
        currency: string;
        asOf: Date;
      }
  );

/** Metrics with their current state. No metric has a connected source yet. */
export function commandMetrics(): CommandMetric[] {
  return METRICS.map((m) => ({ ...m, status: "awaiting_source" as const }));
}

/** "£38,420", "187", "4.7". Money is integer minor units in the given currency. */
export function formatMetricValue(unit: MetricUnit, value: number, currency: string): string {
  if (unit === "money") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(value / 100));
  }
  if (unit === "score") return value.toFixed(1);
  return new Intl.NumberFormat("en-GB").format(value);
}

/** "▲ +12%", "▼ -3%", "• 0%" (Figma). The words carry direction; colour is secondary. */
export function formatChange(change: number): { text: string; direction: "up" | "down" | "flat" } {
  const pct = Math.round(change * 100);
  if (pct > 0) return { text: `▲ +${pct}%`, direction: "up" };
  if (pct < 0) return { text: `▼ ${pct}%`, direction: "down" };
  return { text: "• 0%", direction: "flat" };
}
