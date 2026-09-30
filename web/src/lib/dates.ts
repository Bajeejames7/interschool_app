// Dates travel as "YYYY-MM-DD" strings and are shown in the organisation's
// calendar, never shifted by the phone's time zone.

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function utc(date: string): Date {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekdayOf(date: string): number {
  return utc(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** "Tuesday 6th October" */
export function longDate(date: string): string {
  const d = utc(date);
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${WEEKDAYS[d.getUTCDay()]} ${ordinal(d.getUTCDate())} ${month}`;
}

/** "October 2026" */
export function monthTitle(month: string): string {
  return utc(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shiftMonth(month: string, by: number): string {
  const { y, m } = parts(`${month}-01`);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** The weeks of a month as rows of 7 dates (null for days outside it). */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const days: (string | null)[] = Array(weekdayOf(first)).fill(null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
}

/** "12:30" -> "12:30", "13:00" -> "1:00" (the way the team writes times). */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}
