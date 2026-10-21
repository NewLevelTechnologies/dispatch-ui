// ─────────────────────────────────────────────────────────────────────
// "My day" — the technician's landing. Pure selectors over the tech's own
// dispatches for one tenant-local day.
//
// The unit of work is the DISPATCH (one trip to one site), not the work
// order: a work order with two visits today is two stops, in arrival-window
// order, both linking to the same work order. Everything here is derived
// from the dispatch read — nothing is stored.
// ─────────────────────────────────────────────────────────────────────
import type { DispatchBoardRow, DispatchStatus } from '../../api/setup';
import { formatHour, zonedHour } from '../../lib/boardTime';

/** A stop that's behind the tech: it's done, or it isn't happening. */
export function isPast(status: DispatchStatus): boolean {
  return status === 'COMPLETED' || status === 'NO_SHOW' || status === 'CANCELLED';
}

/** The tech is on this one right now. */
export function isLive(status: DispatchStatus): boolean {
  return status === 'EN_ROUTE' || status === 'IN_PROGRESS';
}

/**
 * The day's route, in arrival order.
 *
 * Unreleased dispatches are left out: that is the board's "on deck" state —
 * assigned, but not handed to the tech — and showing it would put a draft
 * schedule on the tech's phone. Cancelled visits are left out too, the same
 * as the board's default; they aren't work.
 */
export function routeStops(rows: readonly DispatchBoardRow[]): DispatchBoardRow[] {
  return rows
    .filter((r) => !!r.releasedAt && r.status !== 'CANCELLED')
    .sort((a, b) => a.arrivalWindowStart.localeCompare(b.arrivalWindowStart));
}

/** The ONE stop to act on: whatever is live, else the first still scheduled. */
export function pickFocus(stops: readonly DispatchBoardRow[]): DispatchBoardRow | null {
  return stops.find((s) => isLive(s.status)) ?? stops.find((s) => s.status === 'SCHEDULED') ?? null;
}

/**
 * The focus card's primary action. Driving and arriving flip the dispatch
 * status directly; completing hands off to the work order, where the visit is
 * closed out properly — it is never flipped blindly from here.
 */
export type FocusAction =
  | { kind: 'status'; to: DispatchStatus; labelKey: 'startDriving' | 'arrived' }
  | { kind: 'complete'; labelKey: 'completeVisit' };

export function focusAction(status: DispatchStatus): FocusAction | null {
  if (status === 'SCHEDULED') return { kind: 'status', to: 'EN_ROUTE', labelKey: 'startDriving' };
  if (status === 'EN_ROUTE') return { kind: 'status', to: 'IN_PROGRESS', labelKey: 'arrived' };
  if (status === 'IN_PROGRESS') return { kind: 'complete', labelKey: 'completeVisit' };
  return null;
}

/** "~45m", "~1h", "~1½h". Null when the dispatcher gave no estimate. */
export function formatEstimate(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `~${minutes}m`;
  const halves = Math.round((minutes / 60) * 2) / 2;
  const whole = Math.floor(halves);
  return `~${whole}${halves - whole ? '½' : ''}h`;
}

/** "6h 40m", "45m", "2h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Σ (departed − arrived) over visits that have both. */
export function onSiteMinutes(stops: readonly DispatchBoardRow[]): number {
  return stops.reduce((sum, s) => {
    if (!s.arrivedAt || !s.departedAt) return sum;
    const ms = new Date(s.departedAt).getTime() - new Date(s.arrivedAt).getTime();
    return ms > 0 ? sum + ms / 60000 : sum;
  }, 0);
}

/** A clock time in the tenant's zone: "8a", "10:42a". */
export function clock(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const h = zonedHour(iso, timeZone);
  return h == null ? null : formatHour(h);
}

/** Tomorrow's card hides only when there's nothing AND it's a weekend — an
 *  empty weekday is worth saying out loud; an empty Saturday is normal. */
export function showTomorrow(count: number, tomorrow: string): boolean {
  if (count > 0) return true;
  const day = new Date(`${tomorrow}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}
