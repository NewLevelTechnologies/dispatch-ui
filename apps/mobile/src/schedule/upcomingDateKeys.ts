import { dayKey } from './dayGroups';

/** The next `days` calendar days, starting today, as "YYYY-MM-DD" strings — what `getBoard`/`getWeek` want. */
export function upcomingDateKeys(days: number, now: Date = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return dayKey(d);
  });
}
