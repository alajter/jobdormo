// When the next LinkedIn post should go out. Pure.
// Tuesday and Thursday mornings get the most reach for an Israeli + EU
// audience (08:30 Israel = 07:30 Central Europe); a post keeps getting shown
// for 2-3 days, so the next one waits at least MIN_GAP_DAYS after the last.

export const POST_DAYS = [2, 4]; // Tuesday, Thursday (Date.getDay)
export const POST_HOUR = 8;
export const POST_MINUTE = 30;
export const MIN_GAP_DAYS = 3;
// Don't schedule a post for less than this far ahead: there's no time to read it.
export const MIN_LEAD_HOURS = 6;

export function nextPostSlot(input: { now: Date; lastPostedAt?: Date | null; taken?: Date[] }): Date {
  const { now, lastPostedAt, taken = [] } = input;
  const earliest = new Date(
    Math.max(
      now.getTime() + MIN_LEAD_HOURS * 3_600_000,
      lastPostedAt ? lastPostedAt.getTime() + MIN_GAP_DAYS * 86_400_000 : 0,
    ),
  );
  const day = new Date(earliest);
  day.setHours(POST_HOUR, POST_MINUTE, 0, 0);
  if (day < earliest) day.setDate(day.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  for (let i = 0; i < 28; i++) {
    if (POST_DAYS.includes(day.getDay()) && !taken.some((t) => sameDay(t, day))) return new Date(day);
    day.setDate(day.getDate() + 1);
  }
  return day;
}
