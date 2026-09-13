// ─────────────────────────────────────────────────────────────────────
// Map pin and route presentation.
//
// Pure on purpose: every rule the `Map Pin Spec.html` sheet states is a
// function of the dispatch record, so it can be asserted in a unit test
// without a WebGL canvas, a tile server, or jsdom pretending to have either.
// The renderer does nothing but hand these strings to a DOM marker.
//
// TWO VOCABULARIES THAT MUST NOT COLLIDE, per the spec:
//   · status  → the pin's FILL, from the one shared presentation map.
//   · accent  → selection and navigation ONLY, never status.
// That is what lets the selection ring be accent while every fill is a
// status colour without either reading as the other.
// ─────────────────────────────────────────────────────────────────────
import type { BoardDispatch, DispatchStatus, WorkOrderPriority } from '../api/setup';
import { statusClass } from './dispatchStatus';
import { roleColor } from '@dispatch/utils';

export interface PinState {
  status: DispatchStatus;
  /** Null `releasedAt` = still on deck. ORTHOGONAL to status — a dashed ring
   *  can sit on a scheduled pin or an en-route one, so this is never folded
   *  into the status enum. */
  released: boolean;
  priority: WorkOrderPriority | null;
  /** Another technician's route while one is focused. A focus, not a filter:
   *  the others stay visible for comparison. */
  dimmed?: boolean;
  /** This pin belongs to the focused technician. */
  focused?: boolean;
  /** Matches `selId` — the SAME selection the timeline block shows, and it
   *  must use the same ring. This is the rule most likely to be re-invented
   *  per surface. */
  selected?: boolean;
}

/**
 * The pin's class list.
 *
 * Note `statusClass()` yields `inprogress`, not the spec sheet's `onsite`.
 * The sheet is written against the mock; this codebase already ships
 * `.db-block.inprogress` from the same helper, and one vocabulary across
 * block and pin matters more than matching the sheet's spelling. Both
 * render the same violet either way — "on site" is not its own hue.
 */
export function pinClassName(state: PinState): string {
  return [
    'db-pin',
    statusClass(state.status),
    state.released ? '' : 'held',
    state.priority === 'URGENT' ? 'pri-urgent' : '',
    state.dimmed ? 'dim' : '',
    state.focused ? 'on' : '',
    state.selected ? 'sel' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Unassigned work — dashed, no sequence, draggable.
 *
 * Priority tints the ring rather than filling it: an unassigned job has no
 * status to report, so a fill would invent one. Only HIGH and URGENT tint;
 * NORMAL and LOW are the unremarkable case and get the plain dashed ring.
 */
export function unassignedPinClassName(priority: WorkOrderPriority | null): string {
  const tint = priority === 'URGENT' || priority === 'HIGH' ? priority.toLowerCase() : '';
  return ['db-pin', 'un', tint].filter(Boolean).join(' ');
}

export interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

/** Narrowed to a pin-able stop: both coordinates present. */
export type Located<T> = T & { latitude: number; longitude: number };

export function isLocated<T extends Coordinates>(value: T): value is Located<T> {
  return value.latitude != null && value.longitude != null;
}

export interface RouteLeg {
  from: Located<BoardDispatch>;
  to: Located<BoardDispatch>;
  /** Solid when the leg has been driven, dashed when it is still a plan.
   *  Keyed off the leg's ORIGIN: leaving a completed stop is what makes the
   *  hop behind you real. */
  done: boolean;
}

/**
 * Legs through a technician's scheduled sequence — never GPS breadcrumbs.
 * The planned path is what exposes a bad route; a breadcrumb trail only
 * tells you about a route you can no longer change.
 *
 * Stops with no coordinates are dropped and the survivors joined across the
 * gap, rather than breaking the line: two disconnected segments read as two
 * routes, which is a worse lie than a slightly-wrong one. The omission is
 * disclosed by the persistent "N jobs have no location" count, which is the
 * whole reason that count is persistent.
 */
export function routeLegs(stops: BoardDispatch[]): RouteLeg[] {
  const located = stops.filter(isLocated).sort((a, b) => a.seq - b.seq);
  const legs: RouteLeg[] = [];
  for (let i = 1; i < located.length; i++) {
    legs.push({
      from: located[i - 1],
      to: located[i],
      done: located[i - 1].status === 'COMPLETED',
    });
  }
  return legs;
}

/**
 * One colour per technician, and deliberately the SAME hash their avatar
 * uses — so the map and the grid agree on who's who without a second
 * palette to keep in sync.
 *
 * Never `--accent-*`: a route drawn in the selection colour would read as
 * "this one is selected".
 */
export function techRouteColor(name: string): string {
  return roleColor(name);
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Extent of everything worth framing, or null when there is nothing to
 *  frame. Returned as plain numbers so this module stays free of the map
 *  library — the renderer builds the LngLatBounds. */
export function boundsOf(points: Coordinates[]): Bounds | null {
  const located = points.filter(isLocated);
  if (located.length === 0) return null;
  return located.reduce<Bounds>(
    (acc, p) => ({
      west: Math.min(acc.west, p.longitude),
      south: Math.min(acc.south, p.latitude),
      east: Math.max(acc.east, p.longitude),
      north: Math.max(acc.north, p.latitude),
    }),
    {
      west: located[0].longitude,
      south: located[0].latitude,
      east: located[0].longitude,
      north: located[0].latitude,
    },
  );
}

/**
 * Nearest technician to a dropped point, by proximity to the stops they are
 * already booked for — the same site-to-site measure the rail's "who's
 * already going near this" hint uses, and for the same reason: it needs no
 * location signal, so it works identically on tomorrow's board.
 *
 * Returns null when the drop is nowhere near anyone, which is what makes the
 * pin snap back instead of assigning to whoever happens to be least far away
 * across the whole metro.
 */
export function nearestTechToPoint(
  point: { latitude: number; longitude: number },
  stopsByTech: Record<string, BoardDispatch[]>,
  maxDegrees = 0.18,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const [techId, stops] of Object.entries(stopsByTech)) {
    for (const stop of stops) {
      if (!isLocated(stop)) continue;
      const dLat = stop.latitude - point.latitude;
      const dLng = stop.longitude - point.longitude;
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = techId;
      }
    }
  }
  return bestDistance <= maxDegrees ? bestId : null;
}
