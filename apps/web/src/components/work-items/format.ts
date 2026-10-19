// Date/time copy shared by the Work Items tab pieces.

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const WEEKDAY_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "May 14" this year, "Mar 14, 2025" otherwise. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? MONTH_DAY.format(d) : MONTH_DAY_YEAR.format(d);
}

/** "Mar 14, 2025" — always with the year (history rows). */
export function fullDate(iso: string): string {
  return MONTH_DAY_YEAR.format(new Date(iso));
}

/** Dispatch row date: "Thu, May 14". */
export function dispatchDate(iso: string): string {
  return WEEKDAY_DATE.format(new Date(iso));
}

/** Arrival window: "8:00 AM–10:00 AM". */
export function windowLabel(startIso: string, endIso: string): string {
  return `${TIME.format(new Date(startIso))}–${TIME.format(new Date(endIso))}`;
}

export function timeLabel(iso: string): string {
  return TIME.format(new Date(iso));
}

/** Time on site from arrived → departed: "1h 41m", "35m". Null if incomplete. */
export function onSiteDuration(arrivedAt: string | null, departedAt: string | null): string | null {
  if (!arrivedAt || !departedAt) return null;
  const mins = Math.round((new Date(departedAt).getTime() - new Date(arrivedAt).getTime()) / 60000);
  if (!(mins > 0)) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Whole years since an install date (ISO LocalDate); null when in the future. */
export function ageInYears(installDate: string): number | null {
  const d = new Date(`${installDate.slice(0, 10)}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 ? years : null;
}

/** Parse an ISO LocalDate ("2026-05-17") as a local date, not UTC midnight. */
export function localDate(isoDate: string): string {
  return shortDate(`${isoDate.slice(0, 10)}T00:00:00`);
}
