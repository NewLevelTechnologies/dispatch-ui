// ─────────────────────────────────────────────────────────────────
// "My day" — pure selectors over the tech's own stops for one
// tenant-local day. A port of web's `apps/web/src/features/my-day/
// myDayModel.ts`; keep the two in step, since both render the same
// design from the same endpoint.
//
// The unit of work is the DISPATCH (one trip to one site), not the work
// order: a work order visited twice today is two stops, in arrival order,
// both linking to the same work order.
// ─────────────────────────────────────────────────────────────────
import type { DispatchStatus, MyDayStop } from '@dispatch/api';

/** A stop that's behind the tech: done, or not happening. */
export function isPast(status: DispatchStatus): boolean {
  return status === 'COMPLETED' || status === 'NO_SHOW' || status === 'CANCELLED';
}

/** The tech is on this one right now. */
export function isLive(status: DispatchStatus): boolean {
  return status === 'EN_ROUTE' || status === 'IN_PROGRESS';
}

/**
 * The day's route. The server already returns only released work, in arrival
 * order — the only thing dropped here is a cancellation the tech has been
 * told about: it isn't work, and the board hides it too.
 */
export function routeStops(stops: readonly MyDayStop[]): MyDayStop[] {
  return stops.filter((s) => s.status !== 'CANCELLED');
}

/** The ONE stop to act on: whatever is live, else the first still scheduled. */
export function pickFocus(stops: readonly MyDayStop[]): MyDayStop | null {
  return stops.find((s) => isLive(s.status)) ?? stops.find((s) => s.status === 'SCHEDULED') ?? null;
}

/**
 * The focus card's primary action. Driving and arriving flip the dispatch
 * status directly; completing hands off to the work order, where the visit is
 * closed out properly — it is never flipped blindly from here.
 */
export type FocusAction =
  // Narrower than web's `DispatchStatus` on purpose: these are the only two
  // statuses this action ever sets, and saying so lets the callback that
  // receives it be honest about what it accepts.
  | { kind: 'status'; to: 'EN_ROUTE' | 'IN_PROGRESS'; labelKey: 'startDriving' | 'arrived' }
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
export function onSiteMinutes(stops: readonly MyDayStop[]): number {
  return stops.reduce((sum, s) => {
    if (!s.arrivedAt || !s.departedAt) return sum;
    const ms = new Date(s.departedAt).getTime() - new Date(s.arrivedAt).getTime();
    return ms > 0 ? sum + ms / 60000 : sum;
  }, 0);
}

/**
 * Tomorrow's card hides only when there's nothing AND it's a weekend — an
 * empty weekday is worth saying out loud; an empty Saturday is normal.
 */
export function showTomorrow(count: number, tomorrow: string): boolean {
  if (count > 0) return true;
  const day = new Date(`${tomorrow}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Days reachable from the stepper either side of today. Further out is the
 * Schedule tab's job — this screen is one day in depth, not a calendar.
 */
export const DAY_RANGE = 7;

/** Shift a tenant-local YYYY-MM-DD by whole days, staying in that calendar. */
export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Clamp a step to the range the stepper can reach. */
export function clampOffset(offset: number): number {
  return Math.max(-DAY_RANGE, Math.min(DAY_RANGE, offset));
}

/**
 * The step a horizontal swipe asks for: left = forward a day, right = back.
 * Short drags are scrolling or taps, not steps.
 */
export function swipeStep(dx: number): -1 | 0 | 1 {
  if (Math.abs(dx) <= 70) return 0;
  return dx < 0 ? 1 : -1;
}

/** "Today" / "Yesterday" / "Tomorrow", else the weekday. */
export function dayName(offset: number, date: string | undefined, t: (k: string) => string): string {
  if (offset === 0) return t('myDay.stepper.today');
  if (offset === -1) return t('myDay.stepper.yesterday');
  if (offset === 1) return t('myDay.stepper.tomorrow');
  if (!date) return '';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}
