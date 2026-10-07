/** Fixed Figma 10:3734 samples. Never sourced from live venture records. */
export const sampleMetrics = [
  ["New customers MTD", "14", "+4 vs last month target"],
  ["Customer retention", "87%", "Within optimal threshold"],
  ["Avg job value", "£285", "Weighted baseline average"],
  ["Lifetime value", "£1,840", "Average based on 36-mo cohorts"],
] as const;
export const sampleFunnel = [
  ["Website Visits", "2,400", "3.6%"],
  ["Enquiries", "86", "48.8%"],
  ["Quotes Sent", "42", "33.3%"],
  ["Jobs Won", "14", null],
] as const;
export const sampleClients = [
  ["Oakwood Estates", "£18,400", "64", "12 Apr 2026", "Low"],
  ["Highland Retail", "£12,200", "41", "10 Apr 2026", "Medium"],
  ["Apex Dev", "£8,600", "28", "08 Apr 2026", "Low"],
  ["Beacon Logistics", "£6,400", "19", "02 Apr 2026", "High"],
  ["Summit Ventures", "£4,200", "12", "28 Mar 2026", "Low"],
] as const;
export const sampleLevers = [
  ["Referral Programme", "8 referrals", "blue", 169],
  ["Google Ads", "£4.20 CPA", "green", 213],
  ["Repeat Business", "34% rate", "amber", 125],
] as const;
