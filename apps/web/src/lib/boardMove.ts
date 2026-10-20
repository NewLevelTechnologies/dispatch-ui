// ─────────────────────────────────────────────────────────────────────
// Moving a visit to another day (handoff §3.6).
//
// The day board is a single-date surface — a lane's x-axis is the clock, so
// nothing on it can be a target for "tomorrow". This is the date arithmetic
// behind the block menu's Move to section, kept out of the component so the
// rules are testable on their own.
//
// The contract is that a move changes the DATE and nothing else. The arrival
// window is what makes a date-only move legal: "9–11a Thursday → 9–11a
// Friday" invents no promise, so it may commit without a composer.
// ─────────────────────────────────────────────────────────────────────
import { PRESET_WINDOWS, type PresetWindow } from './arrivalWindows';
import { snapToPreset } from './boardDrop';
import { zonedHour } from './boardTime';

/** Day math on the date PARTS, via UTC, so a DST boundary can't shift the
 *  result by a day the way local-midnight arithmetic can. */
export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The next Monday–Friday after `date`. Bumping Friday's work to Saturday is
 *  almost never what a dispatcher means, which is why this — not "tomorrow" —
 *  leads the menu. Tenants have no working-days setting yet, so Sat/Sun is
 *  the whole rule. */
export function nextBusinessDay(date: string): string {
  let next = shiftDay(date, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = shiftDay(next, 1);
  return next;
}

/**
 * Where a visit on `from` may move to: any day from TODAY on (tenant zone),
 * except the day it is already on.
 *
 * The floor is today, not the day after `from` — a dispatcher looking at next
 * Tuesday has to be able to pull a visit in to Monday, or to today when the
 * customer calls with an opening. The past stays shut: a SCHEDULED visit
 * dated yesterday is just a stale visit, and recording work that already
 * happened is the composer's job, not a move's.
 */
export function canMoveTo(from: string, to: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= today && to !== from;
}

/** Where "Pick a date…" opens: the next day, unless that is already past. */
export function defaultPick(from: string, today: string): string {
  const next = shiftDay(from, 1);
  // A visit on a past board can't move to its own day, so today is safe.
  return next >= today ? next : today;
}

/** What the menu offers as one-click moves. Both step FORWARD — pulling work
 *  in is rarer and goes through "Pick a date…". `tomorrow` is null when it IS
 *  the next business day, so one date never appears under two names; either
 *  is null when it would land in the past (a visit left on last week's board). */
export function moveTargets(
  date: string,
  today: string,
): { nextBusiness: string | null; tomorrow: string | null } {
  const next = nextBusinessDay(date);
  const tomorrow = shiftDay(date, 1);
  const nextBusiness = canMoveTo(date, next, today) ? next : null;
  return {
    nextBusiness,
    tomorrow: tomorrow !== next && canMoveTo(date, tomorrow, today) ? tomorrow : null,
  };
}

// Bare YYYY-MM-DD parsed and formatted in UTC: handing a bare date to
// `new Date()` shifts it a day for anyone west of Greenwich. The weekday is
// always printed, because a target landing on a weekend has to be visible.
const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Fri, Sep 25". */
export function formatMoveDay(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

/**
 * The window a moved visit keeps, in tenant-local hours.
 *
 * Preserved exactly when it is still one of the tenant's presets; snapped to
 * the nearest preset when it is not, the same rule every other board path
 * follows — the board must not create a window the composer can't reproduce.
 * Null when the stored window can't be placed at all, which the caller treats
 * as "this can't be moved from here" rather than guessing an hour.
 */
export function preservedWindow(
  dispatch: { arrivalWindowStart: string; arrivalWindowEnd: string },
  timeZone: string,
  presets: readonly PresetWindow[] = PRESET_WINDOWS,
): { startHour: number; endHour: number } | null {
  const start = zonedHour(dispatch.arrivalWindowStart, timeZone);
  const end = zonedHour(dispatch.arrivalWindowEnd, timeZone);
  if (start == null || end == null || end <= start) return null;
  const exact = presets.find(
    (p) => Math.abs(p.startHour - start) < 0.01 && Math.abs(p.endHour - end) < 0.01,
  );
  if (exact) return { startHour: exact.startHour, endHour: exact.endHour };
  const snapped = snapToPreset(start, presets);
  return { startHour: snapped.startHour, endHour: snapped.endHour };
}
