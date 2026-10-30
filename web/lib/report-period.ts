export const REPORT_PERIODS = ["daily", "weekly", "monthly", "quarterly", "6months", "yearly"] as const;
export type ReportPeriod = typeof REPORT_PERIODS[number];
/** Pakistan calendar boundaries, independent of the server's time zone. */
export function reportStart(period: ReportPeriod, now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  const year = value("year"), month = value("month") - 1, day = value("day");
  let start: number;
  switch (period) {
    case "daily": start = Date.UTC(year, month, day); break;
    case "weekly": start = Date.UTC(year, month, day - 6); break;
    case "monthly": start = Date.UTC(year, month, 1); break;
    case "quarterly": start = Date.UTC(year, Math.floor(month / 3) * 3, 1); break;
    case "6months": start = Date.UTC(year, month - 5, 1); break;
    case "yearly": start = Date.UTC(year, 0, 1); break;
  }
  return new Date(start - 5 * 60 * 60 * 1000);
}
