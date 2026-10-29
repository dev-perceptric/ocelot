// Dates in the person's own time zone (profiles.time_zone). Plain functions, so tests can load them.

// The UTC moment for a wall-clock date and time in a time zone, e.g. 2026-11-03 15:00 in Asia/Ho_Chi_Minh.
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // What the zone shows at that UTC moment, and how far it is from what was asked; correct by the gap.
  const shown = parts(new Date(guess), tz);
  const shownUtc = Date.UTC(shown.y, shown.m - 1, shown.d, shown.hh, shown.mm);
  return new Date(guess - (shownUtc - guess));
}

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute };
}

// "2026-11-03" for a moment, in the zone.
export function dayKey(at: Date | string, tz: string): string {
  const p = parts(new Date(at), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function timeKey(at: Date | string, tz: string): string {
  const p = parts(new Date(at), tz);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// "today", "tomorrow", "yesterday", "Friday" (this week), "3 Nov" (further), "3 Nov 2027" (other years).
export function relativeDay(at: Date | string, tz: string, now = new Date()): string {
  const d = daysBetween(dayKey(now, tz), dayKey(at, tz));
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  const date = new Date(at);
  if (d > 1 && d < 7) return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(date);
  const sameYear = dayKey(at, tz).slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

export const clock = (at: Date | string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(at));

// Where a task falls today: overdue, today, upcoming, or no date.
export function bucket(dueAt: string | null, tz: string, now = new Date()): "overdue" | "today" | "upcoming" | "someday" {
  if (!dueAt) return "someday";
  const d = daysBetween(dayKey(now, tz), dayKey(dueAt, tz));
  return d < 0 ? "overdue" : d === 0 ? "today" : "upcoming";
}

// Interviews stay listed for two hours after they start (the call may still be on).
export const interviewCutoff = (now = Date.now()) => new Date(now - 2 * 3_600_000).toISOString();
