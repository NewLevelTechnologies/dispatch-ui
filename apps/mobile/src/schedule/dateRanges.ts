/**
 * `availabilityApi.list({ from, to })` wants ISO instants; a technician's
 * "today" is a LOCAL calendar day, not a UTC one — so this builds the window
 * from local midnight, not `now` truncated to UTC. `now` is a parameter
 * (rather than read internally) so tests can pin it instead of depending on
 * whatever day it happens to be when they run.
 *
 * Dispatch reads don't use this — `dispatchBoardApi.getBoard`/`getWeek` take
 * a plain "YYYY-MM-DD" and resolve it in the TENANT's timezone server-side
 * (see dayGroups.ts's `dayKey` / schedule/upcomingDateKeys.ts), which is why
 * this file no longer has an `upcomingRange` — nothing needs an instant range
 * for more than one day anymore.
 */

function localMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export type DateRange = { from: string; to: string };

/** Local midnight today through local midnight tomorrow. */
export function todayRange(now: Date = new Date()): DateRange {
  const start = localMidnight(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
