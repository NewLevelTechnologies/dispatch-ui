// ─────────────────────────────────────────────────────────────────────
// Dispatch status presentation — ONE map, shared.
//
// Extracted from DispatchDetailDrawer so the dispatch board can import it
// instead of declaring its own. When the board forked this (three tones
// diverged: IN_PROGRESS, NO_SHOW, CANCELLED), clicking a block opened a
// drawer that toned the same dispatch differently from the block behind it.
//
// If en route and on site ever need distinct hues, change it HERE so both
// surfaces move together. Never fork it per surface.
//
// `--accent-*` is reserved for navigation in this design system and must
// never carry status, which is why "on site" is violet + `live` (motion)
// rather than an accent fill: hue carries the status family, motion carries
// "right now".
// ─────────────────────────────────────────────────────────────────────
import type { DispatchStatus } from '../api/setup';

export type PillTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'
  | 'violet';

export interface StatusPresentation {
  tone: PillTone;
  /** EN_ROUTE + IN_PROGRESS — the tech is in motion or on the job right now.
   *  Drives the pulsing dot on pills and timeline blocks. */
  live?: boolean;
  /** CSS var for the block's left rail / pin fill. */
  accent: string;
}

export const DISPATCH_PRESENTATION: Record<DispatchStatus, StatusPresentation> = {
  SCHEDULED: { tone: 'info', accent: 'var(--info-500)' },
  EN_ROUTE: { tone: 'violet', live: true, accent: 'var(--violet-500)' },
  IN_PROGRESS: { tone: 'violet', live: true, accent: 'var(--violet-500)' },
  COMPLETED: { tone: 'success', accent: 'var(--success-500)' },
  NO_SHOW: { tone: 'warning', accent: 'var(--warning-500)' },
  CANCELLED: { tone: 'neutral', accent: 'var(--border-strong)' },
};

/**
 * "Right now" is a claim about NOW, so it cannot be true on any date but
 * today. A dispatch left `IN_PROGRESS` from last Tuesday — the ordinary case,
 * because closing a job out is the step techs forget — would otherwise paint a
 * pulsing violet dot on next Thursday's board and read as a technician
 * currently on site on a day that has not happened.
 *
 * Only the MOTION is dropped, not the hue. The board does not remap the status
 * itself: a record that says `IN_PROGRESS` on a past day is reporting a real
 * anomaly (nobody closed it out), and repainting it as `SCHEDULED` would trade
 * one lie for a worse one by hiding it. The server is the place that should
 * settle what a stale record means; the board's job is only to stop asserting
 * the one thing it can prove false.
 */
export function presentationFor(
  status: DispatchStatus,
  { isToday }: { isToday: boolean },
): StatusPresentation {
  const base = DISPATCH_PRESENTATION[status];
  return base.live && !isToday ? { ...base, live: false } : base;
}

/** Lowercase status, for the `.db-block.<status>` CSS hook. */
export function statusClass(status: DispatchStatus): string {
  return status.toLowerCase().replace('_', '');
}

/** CANCELLED is not work. It stays reachable behind a filter chip because it
 *  explains a hole in the day, but it is hidden by default. NO_SHOW is the
 *  opposite: it consumed the slot, so it stays on the board. */
export function isHiddenByDefault(status: DispatchStatus): boolean {
  return status === 'CANCELLED';
}
