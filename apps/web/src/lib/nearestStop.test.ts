import { describe, it, expect } from 'vitest';
import { formatMiles, nearestStops, shortName, straightLineMiles } from './nearestStop';
import type { BoardDispatch, BoardTech, UnscheduledWorkOrder } from '../api/setup';

const TZ = 'UTC';

// Phoenix-ish: about a mile apart north–south, and a few east–west.
const SITE = { latitude: 33.45, longitude: -112.07 };
const NEAR = { latitude: 33.4645, longitude: -112.07 };
const FAR = { latitude: 33.6, longitude: -111.9 };

function workOrder(over: Partial<UnscheduledWorkOrder> = {}): UnscheduledWorkOrder {
  return {
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-3911',
    workOrderSummary: 'No cooling',
    workOrderTypeId: null,
    customerId: 'c1',
    customerName: 'Pham, A.',
    serviceLocationId: 'l1',
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    latitude: SITE.latitude,
    longitude: SITE.longitude,
    priority: 'NORMAL',
    itemCount: 1,
    recurring: false,
    dispatchRegionId: 'r1',
    divisionId: null,
    createdAt: '2026-03-15T09:00:00Z',
    ...over,
  };
}

function tech(over: Partial<BoardTech> = {}): BoardTech {
  return {
    id: 'u1',
    name: 'Jordan Wei',
    regionIds: ['r1'],
    primaryRegionId: 'r1',
    stopCount: 1,
    ...over,
  };
}

function stop(over: Partial<BoardDispatch> = {}): BoardDispatch {
  return {
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T12:00:00Z',
    arrivalWindowEnd: '2026-03-15T14:00:00Z',
    estimatedDuration: null,
    releasedAt: null,
    version: 1,
    assignedUserId: 'u1',
    assignedUserName: 'Jordan Wei',
    workOrderId: 'wo-other',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'Tune-up',
    customerId: 'c2',
    customerName: 'Other',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l2',
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    latitude: NEAR.latitude,
    longitude: NEAR.longitude,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  };
}

describe('straightLineMiles', () => {
  it('measures about a mile for a hundredth of a degree of latitude', () => {
    const miles = straightLineMiles(SITE, NEAR);
    expect(miles).toBeCloseTo(1, 1);
  });

  // A location that never geocoded is not at 0,0 — it is unknown, and the
  // signal must be absent rather than wrong.
  it('returns null when either end has no coordinates', () => {
    expect(straightLineMiles(SITE, { latitude: null, longitude: null })).toBeNull();
    expect(straightLineMiles({ latitude: null, longitude: 5 }, SITE)).toBeNull();
  });

  // Longitude degrees narrow toward the poles; ignoring that overstates
  // east–west distance by about 17% at this latitude.
  it('scales longitude by the latitude', () => {
    const eastWest = straightLineMiles(SITE, { latitude: 33.45, longitude: -112.08 })!;
    const northSouth = straightLineMiles(SITE, { latitude: 33.46, longitude: -112.07 })!;
    expect(eastWest).toBeLessThan(northSouth);
  });
});

describe('shortName', () => {
  it('keeps the first name and initials the last', () => {
    expect(shortName('Jordan Wei')).toBe('Jordan W.');
    expect(shortName('Maya  Alvarez')).toBe('Maya A.');
  });

  it('leaves a single name alone', () => {
    expect(shortName('Cher')).toBe('Cher');
  });
});

describe('nearestStops', () => {
  it('names the closest booked stop, its technician and its window start', () => {
    const result = nearestStops([workOrder()], [tech()], [stop()], TZ);
    expect(result['wo-1']).toMatchObject({ techName: 'Jordan W.', at: '12p' });
    expect(result['wo-1'].miles).toBeCloseTo(1, 1);
  });

  it('picks the nearer of two stops', () => {
    const result = nearestStops(
      [workOrder()],
      [tech(), tech({ id: 'u2', name: 'Kenji Tran' })],
      [
        stop({ id: 'far', assignedUserId: 'u2', ...FAR }),
        stop({ id: 'near', assignedUserId: 'u1', ...NEAR }),
      ],
      TZ,
    );
    expect(result['wo-1'].techName).toBe('Jordan W.');
  });

  // Absent, not zero, not a placeholder: early on a fresh day every card is
  // bare, and that is correct.
  it('returns nothing when the day has no booked stops', () => {
    expect(nearestStops([workOrder()], [tech()], [], TZ)).toEqual({});
  });

  it('returns nothing for a work order whose site never geocoded', () => {
    const result = nearestStops(
      [workOrder({ latitude: null, longitude: null })],
      [tech()],
      [stop()],
      TZ,
    );
    expect(result).toEqual({});
  });

  it('ignores a stop whose own site never geocoded', () => {
    const result = nearestStops(
      [workOrder()],
      [tech()],
      [stop({ latitude: null, longitude: null })],
      TZ,
    );
    expect(result).toEqual({});
  });

  // A cancelled visit is not a trip anyone is making.
  it('ignores cancelled stops', () => {
    const result = nearestStops([workOrder()], [tech()], [stop({ status: 'CANCELLED' })], TZ);
    expect(result).toEqual({});
  });

  // A hint naming someone the dispatcher cannot see is worse than no hint.
  it('considers only the technicians in scope', () => {
    const result = nearestStops(
      [workOrder()],
      [tech({ id: 'u2', name: 'Kenji Tran' })],
      [stop({ assignedUserId: 'u1' })],
      TZ,
    );
    expect(result).toEqual({});
  });

  // Someone out all day is not going near anything.
  it('skips a technician who is off for the day', () => {
    const result = nearestStops(
      [workOrder()],
      [
        tech({
          timeOff: [
            { startsAt: '2026-03-15T00:00:00Z', endsAt: '2026-03-16T00:00:00Z', allDay: true, label: 'Vacation' },
          ],
        }),
      ],
      [stop()],
      TZ,
    );
    expect(result).toEqual({});
  });

  // A morning absence still leaves an afternoon route to be near.
  it('keeps a technician who is only out for part of the day', () => {
    const result = nearestStops(
      [workOrder()],
      [
        tech({
          timeOff: [
            { startsAt: '2026-03-15T15:00:00Z', endsAt: '2026-03-15T19:00:00Z', allDay: false, label: 'Appointment' },
          ],
        }),
      ],
      [stop()],
      TZ,
    );
    expect(result['wo-1']).toBeDefined();
  });
});

describe('formatMiles', () => {
  // A decimal under a mile would imply precision a straight line between two
  // rooftops does not have.
  it('collapses anything under a mile', () => {
    expect(formatMiles(0.4)).toBe('<1');
    expect(formatMiles(0.99)).toBe('<1');
  });

  it('gives one decimal above a mile', () => {
    expect(formatMiles(2.14)).toBe('2.1');
  });
});
