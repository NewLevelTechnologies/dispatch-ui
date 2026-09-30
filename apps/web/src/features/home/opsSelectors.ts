// Pure selectors over the day board read for the home dashboard's Operations
// view. The day board is the one shared fetch: the Today KPIs, the status bar,
// "Who's where" and the Unreleased row all read the same response.
import type { BoardDispatch, BoardTech, DispatchStatus } from '../../api/setup';

/** Board order, and the order the status bar and its legend draw in. */
export const BOARD_STATUSES: DispatchStatus[] = [
  'SCHEDULED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
];

export function statusCounts(dispatches: BoardDispatch[]): Record<DispatchStatus, number> {
  const counts = Object.fromEntries(BOARD_STATUSES.map((s) => [s, 0])) as Record<DispatchStatus, number>;
  for (const d of dispatches) counts[d.status] += 1;
  return counts;
}

/** Jobs booked today — the same definition as the board summary's `jobCount`,
 *  so today's value and the end of its sparkline agree. */
export function jobCount(dispatches: BoardDispatch[]): number {
  return dispatches.filter((d) => d.status !== 'CANCELLED' && d.status !== 'NO_SHOW').length;
}

export function completedCount(dispatches: BoardDispatch[]): number {
  return dispatches.filter((d) => d.status === 'COMPLETED').length;
}

/**
 * Working = has work today. Off = no work AND an absence. Idle = neither.
 * Mutually exclusive on purpose: `timeOff` holds partial-day absences, so a
 * tech with a 9am appointment and an afternoon of jobs is working, not off.
 */
export function techCounts(techs: BoardTech[]): { working: number; off: number; idle: number } {
  let working = 0;
  let off = 0;
  let idle = 0;
  for (const tech of techs) {
    if (tech.committedCount > 0) working += 1;
    else if ((tech.timeOff ?? []).length > 0) off += 1;
    else idle += 1;
  }
  return { working, off, idle };
}

export type TechMode = 'onSite' | 'enRoute' | 'next' | 'done' | 'none';

export interface TechRow {
  tech: BoardTech;
  mode: TechMode;
  /** The stop the row names: the current one, or the next one. */
  stop: BoardDispatch | null;
  /** "since" (arrivedAt) on site; "next" (window start) en route or waiting. */
  at: string | null;
  done: number;
  total: number;
}

const MODE_ORDER: Record<TechMode, number> = { onSite: 0, enRoute: 1, next: 2, none: 3, done: 4 };

function isOnSite(d: BoardDispatch): boolean {
  if (d.status === 'IN_PROGRESS') return true;
  return d.arrivedAt != null && d.departedAt == null && d.status !== 'COMPLETED' && d.status !== 'NO_SHOW';
}

/**
 * One row per tech with work today, ordered by what a dispatcher scans for:
 * on site, en route, waiting on their next stop, then done. There is no live
 * location or ETA anywhere in the platform, so a row only ever says "since"
 * (the recorded arrival) or "next" (the booked window) — never "ETA".
 */
export function techRows(techs: BoardTech[], dispatches: BoardDispatch[]): TechRow[] {
  const byTech = new Map<string, BoardDispatch[]>();
  for (const d of dispatches) {
    if (d.status === 'CANCELLED') continue;
    const list = byTech.get(d.assignedUserId) ?? [];
    list.push(d);
    byTech.set(d.assignedUserId, list);
  }

  const rows = techs
    .filter((tech) => tech.committedCount > 0)
    .map((tech): TechRow => {
      const stops = (byTech.get(tech.id) ?? []).sort((a, b) =>
        a.arrivalWindowStart.localeCompare(b.arrivalWindowStart),
      );
      const done = stops.filter((d) => d.status === 'COMPLETED').length;
      const base = { tech, done, total: tech.committedCount };

      const onSite = stops.find(isOnSite);
      if (onSite) return { ...base, mode: 'onSite', stop: onSite, at: onSite.arrivedAt };
      const enRoute = stops.find((d) => d.status === 'EN_ROUTE');
      if (enRoute) return { ...base, mode: 'enRoute', stop: enRoute, at: enRoute.arrivalWindowStart };
      const next = stops.find((d) => d.status === 'SCHEDULED');
      if (next) return { ...base, mode: 'next', stop: next, at: next.arrivalWindowStart };
      // Work exists but none of it is visible here (another region's), so there
      // is nothing honest to name.
      if (stops.length === 0) return { ...base, mode: 'none', stop: null, at: null };
      return { ...base, mode: 'done', stop: null, at: null };
    });

  return rows.sort(
    (a, b) =>
      MODE_ORDER[a.mode] - MODE_ORDER[b.mode] ||
      (a.at ?? '').localeCompare(b.at ?? '') ||
      a.tech.name.localeCompare(b.tech.name),
  );
}

/** Hour of day in the browser's clock, for the greeting only. */
export function greetingPart(now: Date): 'morning' | 'afternoon' | 'evening' {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
