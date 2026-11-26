// Turns a source's posting date (ISO string, epoch seconds/ms, "YYYY-MM-DD")
// into a Date, or null when it's missing or implausible (future, or before
// 2015). Pure and client-safe.
export function parsePostedDate(value: unknown, now: Date = new Date()): Date | null {
  if (value == null || value === "") return null;
  let d: Date;
  if (typeof value === "number") {
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof value === "string") {
    d = /^\d{9,13}$/.test(value) ? parsePostedDateNumber(Number(value)) : new Date(value);
  } else if (value instanceof Date) {
    d = value;
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + 24 * 3600_000) return null;
  if (d.getFullYear() < 2015) return null;
  return d;
}

function parsePostedDateNumber(n: number): Date {
  return new Date(n < 1e12 ? n * 1000 : n);
}

/** "today", "3d ago", "5w ago", "4mo ago". */
export function postedAgo(date: Date | string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
