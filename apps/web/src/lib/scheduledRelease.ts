// Scheduled release: "Release at 7:00a". A timer on the Release button, not
// a snapshot — the server sends whatever is pending when it runs. Everything
// here is about WHEN, in the board's zone; what it sends is the server's.
import type { ScheduledRelease } from '../api/setup';
import { toIsoAt } from './arrivalWindows';
import { shiftDay } from './boardMove';
import { formatHour, zonedDate, zonedHour } from './boardTime';

/** The tenant's usual start: the default pick for "Release at…". A board
 *  constant, like the axis's working day — the tenant has no setting for it. */
export const USUAL_START_HOUR = 7;

// The evening-before tab starts at 5p: a 4pm "evening before" is an afternoon.
const EVENING_FLOOR_HOUR = 17;

// One click covers nearly every release: the morning around the usual start,
// or a round hour the evening before. Anything else is typed.
const DAY_PICKS = [6, 6.5, 7, 7.5, 8];
const EVENING_PICKS = [17, 19, 21];

// A send this far past its time is late enough to say so ("· due 7a").
const LATE_AFTER_MS = 15 * 60 * 1000;

/** The evening-before segment exists only for a future day: on today, the
 *  evening before has already happened. */
export function canReleaseDayBefore(date: string, now: Date, timeZone: string): boolean {
  const today = zonedDate(now, timeZone);
  return today != null && date > today;
}

export type ReleaseTimeProblem = 'past' | 'beforeEvening';

/**
 * Why a wall-clock hour can't be a release time, or null when it can.
 *
 * Validity is a RANGE — after now, before the day ends — never a list. Any
 * minute is valid: the picker's 15-minute step is only its spinner increment,
 * and the server has no step rule. A time before the day ends is the whole
 * day, since an hour is always below 24.
 */
export function releaseTimeProblem(
  hour: number,
  date: string,
  dayBefore: boolean,
  now: Date,
  timeZone: string,
): ReleaseTimeProblem | null {
  if (dayBefore && hour < EVENING_FLOOR_HOUR) return 'beforeEvening';
  const on = dayBefore ? shiftDay(date, -1) : date;
  // The minute the request lands has already passed, so now itself is out.
  if (Date.parse(toIsoAt(on, hour, timeZone)) <= now.getTime()) return 'past';
  return null;
}

/** The one-click times still on offer: passed ones drop out. */
export function releasePicks(
  date: string,
  dayBefore: boolean,
  now: Date,
  timeZone: string,
): number[] {
  return (dayBefore ? EVENING_PICKS : DAY_PICKS).filter(
    (hour) => releaseTimeProblem(hour, date, dayBefore, now, timeZone) == null,
  );
}

/**
 * The time "Release at…" opens on: the usual start when it's still a pick,
 * else the first pick left, else — late on today, every pick gone — the next
 * quarter-hour after now. Null when the day has nothing left at all.
 */
export function defaultReleaseHour(
  date: string,
  dayBefore: boolean,
  now: Date,
  timeZone: string,
): number | null {
  const picks = releasePicks(date, dayBefore, now, timeZone);
  if (picks.includes(USUAL_START_HOUR)) return USUAL_START_HOUR;
  if (picks.length > 0) return picks[0];
  const on = dayBefore ? shiftDay(date, -1) : date;
  if (zonedDate(now, timeZone) !== on) return null;
  const next = (Math.floor((zonedHour(now.toISOString(), timeZone) ?? 0) * 4) + 1) / 4;
  return next < 24 && releaseTimeProblem(next, date, dayBefore, now, timeZone) == null
    ? next
    : null;
}

/** "07:15" ⇄ 7.25 — the native time field's value, in whole minutes. */
export function hourFromTimeValue(value: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]) + Number(m[2]) / 60;
  return hour < 24 ? hour : null;
}

export function timeValueFromHour(hour: number): string {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** When a record runs, as the board reads it: an hour, and whether that hour
 *  is on the evening before the board's day. */
export function scheduledFor(
  record: Pick<ScheduledRelease, 'releaseAt'>,
  date: string,
  timeZone: string,
): { hour: number; dayBefore: boolean } {
  return {
    hour: zonedHour(record.releaseAt, timeZone) ?? 0,
    dayBefore: zonedDate(record.releaseAt, timeZone) !== date,
  };
}

/** Sent well after its time — the service was down when it was due. */
export function isLateSend(record: Pick<ScheduledRelease, 'releaseAt' | 'sentAt'>): boolean {
  if (!record.sentAt) return false;
  return Date.parse(record.sentAt) - Date.parse(record.releaseAt) > LATE_AFTER_MS;
}

/** A record the viewer may still act on: waiting, and not yet due. SENDING
 *  can't be cancelled, and an overdue one is recovered by Release instead. */
export function isPendingSchedule(record: ScheduledRelease): boolean {
  return record.status === 'SCHEDULED' && !record.overdue;
}

/** "Wed" for a board date, read in the board's zone. */
export function weekdayOf(date: string, timeZone: string): string {
  // Noon, so no zone offset can tip it onto a neighbouring day.
  return new Date(toIsoAt(date, 12, timeZone)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone,
  });
}

/** "7a", or "Wed 9p" when the release runs the evening before. */
export function releaseWhen(
  record: Pick<ScheduledRelease, 'releaseAt'>,
  date: string,
  timeZone: string,
): string {
  const { hour, dayBefore } = scheduledFor(record, date, timeZone);
  return dayBefore
    ? `${weekdayOf(shiftDay(date, -1), timeZone)} ${formatHour(hour)}`
    : formatHour(hour);
}
