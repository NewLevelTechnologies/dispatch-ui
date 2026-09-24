// Time off as the board writes it (handoff §0b): all-day spans only, one row
// per absence however many days it covers.
import { toIsoAt } from './arrivalWindows';
import { shiftDay } from './boardMove';

/** The fixed reasons. The code goes in `reason`; the translated word is the
 *  `label` the hatched row prints, so a row always says something. */
export const TIME_OFF_REASONS = ['TIME_OFF', 'SICK', 'TRAINING', 'OTHER'] as const;
export type TimeOffReason = (typeof TIME_OFF_REASONS)[number];

/** Midnight to midnight in the TENANT's zone, half-open: through the 22nd
 *  means up to midnight starting the 23rd. */
export function allDaySpan(
  from: string,
  through: string,
  timeZone: string,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: toIsoAt(from, 0, timeZone),
    endsAt: toIsoAt(shiftDay(through, 1), 0, timeZone),
  };
}

/** Half-hour steps across the board's working day (6a–8p). A part-day
 *  absence is a fact about the day ("dentist 9–10:30"), and half-hours are as
 *  fine as anyone states one. */
export const TIME_OFF_HOURS: readonly number[] = Array.from(
  { length: (20 - 6) * 2 + 1 },
  (_, i) => 6 + i / 2,
);

/** Part of ONE day, in the tenant's zone. Single-day by design: "every
 *  afternoon this week" is a recurrence, and that model is not improvised in
 *  a dialog. */
export function partialSpan(
  date: string,
  startHour: number,
  endHour: number,
  timeZone: string,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: toIsoAt(date, startHour, timeZone),
    endsAt: toIsoAt(date, endHour, timeZone),
  };
}

/** Work that is still going to happen — the only kind an absence strands. */
const LIVE = new Set(['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS']);

/**
 * THE time-off predicate (§0b): a live visit that falls inside one of its
 * technician's absences — any all-day span, or a part-day span its window
 * overlaps. Touching edges don't count; a job starting as the absence ends is
 * fine. The Tech is off chip's count, its filter, the block outline and the
 * dialog's warning all ask this one function, so they cannot drift apart.
 */
export function hitsTimeOff(
  visit: { status: string; arrivalWindowStart: string; arrivalWindowEnd: string },
  spans: readonly { startsAt: string; endsAt: string; allDay: boolean }[] | undefined,
): boolean {
  if (!LIVE.has(visit.status) || !spans?.length) return false;
  const start = Date.parse(visit.arrivalWindowStart);
  const end = Date.parse(visit.arrivalWindowEnd);
  return spans.some(
    (span) => span.allDay || (Date.parse(span.startsAt) < end && start < Date.parse(span.endsAt)),
  );
}
