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

// Earliest offered slot on the day itself, and on the evening before. A 3am
// release texts techs in their sleep; a 4pm "evening before" is an afternoon.
const DAY_FLOOR_HOUR = 4;
const EVENING_FLOOR_HOUR = 17;
const QUARTERS_PER_DAY = 96;

// A send this far past its time is late enough to say so ("· due 7a").
const LATE_AFTER_MS = 15 * 60 * 1000;

/** The evening-before segment exists only for a future day: on today, the
 *  evening before has already happened. */
export function canReleaseDayBefore(date: string, now: Date, timeZone: string): boolean {
  const today = zonedDate(now, timeZone);
  return today != null && date > today;
}

/**
 * The times "Release at…" offers, as fractional hours in 15-minute steps, on
 * `date` or on the evening before it. None before now, none after the day
 * ends — the server refuses both.
 */
export function releaseSlots(
  date: string,
  dayBefore: boolean,
  now: Date,
  timeZone: string,
): number[] {
  const today = zonedDate(now, timeZone);
  const on = dayBefore ? shiftDay(date, -1) : date;
  if (today == null || on < today) return [];
  // Whole quarters, so the steps never drift in floating point.
  let first = (dayBefore ? EVENING_FLOOR_HOUR : DAY_FLOOR_HOUR) * 4;
  if (on === today) {
    const hour = zonedHour(now.toISOString(), timeZone) ?? 0;
    // Strictly after now: a slot at the current minute is already past by
    // the time the request lands.
    first = Math.max(first, Math.floor(hour * 4) + 1);
  }
  const slots: number[] = [];
  for (let q = first; q < QUARTERS_PER_DAY; q++) slots.push(q / 4);
  return slots;
}

/** The usual start when it's still on offer; otherwise the next slot. */
export function defaultSlot(slots: number[]): number | null {
  if (slots.includes(USUAL_START_HOUR)) return USUAL_START_HOUR;
  return slots[0] ?? null;
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
