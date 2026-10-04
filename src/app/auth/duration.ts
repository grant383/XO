/** Human label for a token lifetime in seconds, e.g. 1800 → "30 minutes", 86400 → "24 hours". */
export function durationLabel(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  return plural(Math.round(seconds / 60), "minute");
}
