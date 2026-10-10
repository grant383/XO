/** Fixed Figma 14:4 samples. Never sourced from live client records or saved. */
export type ClientType = "Commercial" | "Residential" | "Institutional";
export type ClientStatus = "Active" | "At Risk";
export type LtvTier = "Platinum" | "Gold" | "Silver" | "Bronze" | "New";

export type SampleClient = {
  name: string;
  type: ClientType;
  /** Lifetime spend in whole pounds. */
  spend: number;
  jobs: number;
  /** ISO date of the most recent job. */
  lastJob: string;
  satisfaction: number;
  tier: LtvTier;
  status: ClientStatus;
};

export const sampleTotals = { clients: 87, active: 64 } as const;

export const sampleMetrics = [
  ["Active clients", "64", "73.5% of total base", "muted"],
  ["Avg lifetime value", "£1,840", "↑ +4.2% MoM", "green"],
  ["Client satisfaction", "4.7/5.0", "Based on 148 reviews", "green"],
  ["Repeat rate", "34%", "↑ +1.8% vs target", "green"],
] as const;

/** The ten highest-spend sample clients shown in the reference directory. */
export const sampleClients: readonly SampleClient[] = [
  c("Oakwood Estates", "Commercial", 18400, 64, "2026-08-12", 4.8, "Platinum", "Active"),
  c("Highland Retail", "Commercial", 12200, 41, "2026-08-10", 4.5, "Gold", "Active"),
  c("Apex Dev Group", "Commercial", 8600, 28, "2026-08-08", 4.6, "Gold", "Active"),
  c("Beacon Logistics", "Commercial", 6400, 19, "2026-08-02", 4.3, "Silver", "Active"),
  c("Summit Ventures", "Commercial", 4200, 12, "2026-07-28", 4.9, "Silver", "Active"),
  c("Mrs Patterson", "Residential", 3800, 18, "2026-09-04", 5.0, "Silver", "Active"),
  c("Mr Singh", "Residential", 2400, 14, "2026-09-04", 4.7, "Bronze", "Active"),
  c("St. Mary School", "Institutional", 2200, 8, "2026-08-01", 4.4, "Bronze", "Active"),
  c("Mrs Chen", "Residential", 1600, 9, "2026-09-04", 4.8, "Bronze", "Active"),
  c("Greenfield Clinic", "Commercial", 1200, 4, "2026-07-15", 4.2, "New", "At Risk"),
];

export const sampleSegments = [
  ["Commercial", "commercial", 42, "£52K"],
  ["Residential", "residential", 38, "£28K"],
  ["Institutional", "institutional", 12, "£8K"],
  ["New / Unclassified", "new", 8, "£4K"],
] as const;

export const sampleChurnRisks = [
  ["Greenfield Clinic", "Material delay on HVAC job"],
  ["Summit Ventures", "Follow-up overdue by 6 days"],
  ["Highland Retail", "Satisfaction score dropped"],
] as const;

export const sampleSatisfactionTrend = [14, 18, 16, 22, 20, 24] as const;
export const sampleNps = 72;

export const sampleNextActions = [
  "Schedule Oakwood Platinum review",
  "Dispatch Greenfield Clinic HVAC audit",
  "Approve Patterson 5★ testimonial",
] as const;

function c(
  name: string,
  type: ClientType,
  spend: number,
  jobs: number,
  lastJob: string,
  satisfaction: number,
  tier: LtvTier,
  status: ClientStatus,
): SampleClient {
  return { name, type, spend, jobs, lastJob, satisfaction, tier, status };
}
