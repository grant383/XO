/** Fixed Figma 10:4344 samples. Never sourced from live integrations or venture records. */
export const sampleMetrics = [
  ["System uptime", "99.7%", "Normal"],
  ["API response", "142ms", "Healthy"],
  ["Error rate", "0.3%", "Optimal"],
  ["Active users", "7", "Online"],
] as const;
export const sampleServices = [
  ["ServiceM8 API", "Operational", "99.9%", "89ms", "None", "healthy"],
  ["Xero Sync", "Operational", "99.8%", "210ms", "3 days ago", "healthy"],
  ["Stripe Payments", "Operational", "99.99%", "45ms", "None", "healthy"],
  ["Google Workspace", "Operational", "99.7%", "120ms", "7 days ago", "healthy"],
  ["Email Delivery", "Degraded", "98.2%", "890ms", "2 hrs ago", "warning"],
  ["Zapier Automations", "Operational", "99.5%", "340ms", "1 day ago", "healthy"],
  ["HubSpot CRM", "Operational", "99.6%", "180ms", "None", "healthy"],
  ["Backup Service", "Operational", "99.9%", "N/A", "None", "healthy"],
] as const;
export const sampleAlerts = [
  [
    "DEG",
    "Degraded",
    "Email delivery degraded",
    "Investigating potential mail relay queues. Delay is currently ~4m.",
  ],
  [
    "INFO",
    "Information",
    "Xero rate limit warning",
    "Approaching hourly threshold limits. Auto-throttling secondary syncs.",
  ],
] as const;
/** Sparkline assets are the exact Figma vectors; `trend` is their text alternative. */
export const samplePerformance = [
  ["CPU Usage", "cpu", 120, 21.4553, "23%", "−2%", "falls, then levels off"],
  ["Memory", "memory", 120.671, 21.3444, "54%", "stable", "rises, falls, then levels off"],
  ["Storage", "storage", 120, 21.5, "67%", "+0.1%", "steps upward"],
  ["Bandwidth", "bandwidth", 120, 21.3416, "12%", "-5%", "falls, then levels off"],
] as const;
