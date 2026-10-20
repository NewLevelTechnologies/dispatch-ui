/**
 * `dispatchesApi.getAll({ from, to })` wants ISO instants; a technician's
 * "today" is a LOCAL calendar day, not a UTC one — so these build the window
 * from local midnight, not `now` truncated to UTC. `now` is a parameter
 * (rather than read internally) so tests can pin it instead of depending on
 * whatever day it happens to be when they run.
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

/** Local midnight today through `days` days out — `to` is exclusive, matching the API's contract. */
export function upcomingRange(days: number, now: Date = new Date()): DateRange {
  const start = localMidnight(now);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { from: start.toISOString(), to: end.toISOString() };
}
