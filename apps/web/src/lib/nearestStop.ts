// ─────────────────────────────────────────────────────────────────────
// "Who is already going near this?" — the rail's routing signal.
//
// It measures the UNSCHEDULED job's site against sites already BOOKED that
// day. Site-to-site, never tech-to-site: no GPS is involved anywhere, which
// is why it works identically on tomorrow's board — and tomorrow is where it
// earns the most, since that is when routes are built from scratch and
// clustering is the whole game. ("Who can get there right now" is a different
// question, needs live position, and is not this.)
//
// It is a FACT, not a recommendation. "Nearest · Kenji T. · 2.1 mi · 2p" can
// be overruled at a glance, where "Suggested: Kenji" invites blind trust and
// then blame. Auto-assign is out of scope and this must not smuggle it in —
// so: no ranking, no score, no sort order, exactly one named stop.
//
// It is NOT filtered by division, skill or certification, and must not become
// so. Technicians carry no division data at all, and filtering on the
// candidate stop's division ("already doing HVAC nearby") is the tempting
// middle path and worse than either option — it reads as qualification
// without being it, since one HVAC job does not make someone an HVAC tech.
// ─────────────────────────────────────────────────────────────────────
import type { BoardDispatch, BoardTech, UnscheduledWorkOrder } from '../api/setup';
import { formatHour, zonedHour } from './boardTime';

interface Point {
  latitude: number | null;
  longitude: number | null;
}

const MILES_PER_DEGREE = 69;

/**
 * Equirectangular approximation, in miles. Plenty for ranking candidates
 * inside a metro, and deliberately NOT drive time: this exists for comparison
 * between candidates, and a road-network estimate would assert precision the
 * comparison does not need. Real drive time is a different signal with a
 * different source.
 */
export function straightLineMiles(a: Point, b: Point): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }
  const meanLat = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dLat = (a.latitude - b.latitude) * MILES_PER_DEGREE;
  const dLng = (a.longitude - b.longitude) * MILES_PER_DEGREE * Math.cos(meanLat);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** "Jordan Wei" → "Jordan W." — enough to know who, short enough to fit. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export interface NearestStop {
  /** Already shortened for display. */
  techName: string;
  miles: number;
  /** The booked stop's arrival-window start, in the tenant's zone. */
  at: string;
}

/**
 * One nearest-booked-stop fact per unscheduled work order, or no entry at all.
 *
 * Absent — not zero, not a placeholder — when there is nothing to compare.
 * Early on a fresh day every card is bare, and that is correct.
 *
 * Scope-bound by design: only the technicians handed in are considered, so
 * narrowing to one region legitimately changes the answer. Never widen it to
 * the whole fleet — a hint naming someone the dispatcher cannot see is worse
 * than no hint.
 */
export function nearestStops(
  workOrders: UnscheduledWorkOrder[],
  techs: BoardTech[],
  dispatches: BoardDispatch[],
  timeZone: string,
): Record<string, NearestStop> {
  // A technician who is out all day is not going near anything.
  const available = techs.filter((tech) => !(tech.timeOff ?? []).some((span) => span.allDay));
  const byTech = new Map(available.map((tech) => [tech.id, tech.name]));

  const stops = dispatches.filter(
    (d) =>
      d.status !== 'CANCELLED' &&
      d.latitude != null &&
      d.longitude != null &&
      byTech.has(d.assignedUserId),
  );
  if (stops.length === 0) return {};

  const result: Record<string, NearestStop> = {};

  for (const workOrder of workOrders) {
    if (workOrder.latitude == null || workOrder.longitude == null) continue;

    let best: { stop: BoardDispatch; miles: number } | null = null;
    for (const stop of stops) {
      const miles = straightLineMiles(workOrder, stop);
      if (miles == null) continue;
      if (!best || miles < best.miles) best = { stop, miles };
    }
    if (!best) continue;

    const hour = zonedHour(best.stop.arrivalWindowStart, timeZone);
    result[workOrder.workOrderId] = {
      techName: shortName(byTech.get(best.stop.assignedUserId) ?? ''),
      miles: best.miles,
      at: hour == null ? '' : formatHour(hour),
    };
  }

  return result;
}

/** Under a mile is "<1": one decimal there would imply a precision a
 *  straight line between two rooftops does not have. */
export function formatMiles(miles: number): string {
  return miles < 1 ? '<1' : miles.toFixed(1);
}
