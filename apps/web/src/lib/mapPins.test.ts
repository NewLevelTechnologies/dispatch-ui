import { describe, it, expect } from 'vitest';
import {
  boundsOf,
  nearestTechToPoint,
  pinClassName,
  routeLegs,
  techRouteColor,
  unassignedPinClassName,
} from './mapPins';
import type { BoardDispatch } from '../api/setup';

function stop(over: Partial<BoardDispatch> = {}): BoardDispatch {
  return {
    id: 'd1',
    seq: 1,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-03-15T12:00:00Z',
    arrivalWindowEnd: '2026-03-15T14:00:00Z',
    estimatedDuration: null,
    releasedAt: '2026-03-15T07:00:00Z',
    divisionId: null,
    version: 1,
    windowChangedAt: null,
    assignedUserId: 'u1',
    assignedUserName: 'Jordan Wei',
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-1',
    workOrderTypeId: null,
    workOrderSummary: 'Tune-up',
    customerId: 'c1',
    customerName: 'Pham, A.',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l1',
    serviceLocationName: null,
    serviceLocationStreet: null,
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    serviceLocationZip: null,
    latitude: 33.45,
    longitude: -112.07,
    driveMinFromPrev: null,
    arrivedAt: null,
    departedAt: null,
    addressedWorkItemIds: [],
    ...over,
  };
}

describe('pinClassName', () => {
  it('tones from the shared status map, matching the timeline block', () => {
    expect(pinClassName({ status: 'SCHEDULED', released: true, priority: 'NORMAL' })).toBe(
      'db-pin scheduled',
    );
    expect(pinClassName({ status: 'COMPLETED', released: true, priority: 'NORMAL' })).toBe(
      'db-pin completed',
    );
  });

  it('gives en route and on site the same class family — live is not its own hue', () => {
    const enRoute = pinClassName({ status: 'EN_ROUTE', released: true, priority: 'NORMAL' });
    const onSite = pinClassName({ status: 'IN_PROGRESS', released: true, priority: 'NORMAL' });
    expect(enRoute).toBe('db-pin enroute');
    // Not equal to en route's class, but both resolve to violet in CSS. What
    // matters is that neither borrows accent, which means selection.
    expect(onSite).toBe('db-pin inprogress');
    expect(enRoute).not.toContain('accent');
    expect(onSite).not.toContain('accent');
  });

  it('treats release as ORTHOGONAL to status, not another status', () => {
    // The trap this guards: folding "not released" into the status enum, at
    // which point an unreleased EN_ROUTE dispatch can only render as one.
    const held = pinClassName({ status: 'EN_ROUTE', released: false, priority: 'NORMAL' });
    expect(held).toContain('enroute');
    expect(held).toContain('held');
  });

  it('marks urgent but not high — only the top band gets the halo', () => {
    expect(pinClassName({ status: 'SCHEDULED', released: true, priority: 'URGENT' })).toContain(
      'pri-urgent',
    );
    expect(pinClassName({ status: 'SCHEDULED', released: true, priority: 'HIGH' })).not.toContain(
      'pri-urgent',
    );
  });

  it('never emits the string "emergency" — it is not in the priority enum', () => {
    const all = (['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((priority) =>
      pinClassName({ status: 'SCHEDULED', released: true, priority }),
    );
    expect(all.join(' ')).not.toMatch(/emg|emergency/i);
  });

  it('stacks selection, focus and dimming on top of a status', () => {
    expect(
      pinClassName({
        status: 'SCHEDULED',
        released: false,
        priority: 'URGENT',
        dimmed: true,
        focused: true,
        selected: true,
      }),
    ).toBe('db-pin scheduled held pri-urgent dim on sel');
  });
});

describe('unassignedPinClassName', () => {
  it('tints the ring for the two priorities that warrant it', () => {
    expect(unassignedPinClassName('URGENT')).toBe('db-pin un urgent');
    expect(unassignedPinClassName('HIGH')).toBe('db-pin un high');
  });

  it('leaves ordinary work a plain dashed ring', () => {
    expect(unassignedPinClassName('NORMAL')).toBe('db-pin un');
    expect(unassignedPinClassName('LOW')).toBe('db-pin un');
    expect(unassignedPinClassName(null)).toBe('db-pin un');
  });
});

describe('routeLegs', () => {
  it('walks the scheduled sequence regardless of array order', () => {
    const legs = routeLegs([
      stop({ id: 'c', seq: 3, latitude: 33.3 }),
      stop({ id: 'a', seq: 1, latitude: 33.1 }),
      stop({ id: 'b', seq: 2, latitude: 33.2 }),
    ]);
    expect(legs.map((l) => [l.from.id, l.to.id])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('marks a leg done when it LEAVES a completed stop', () => {
    const legs = routeLegs([
      stop({ id: 'a', seq: 1, status: 'COMPLETED' }),
      stop({ id: 'b', seq: 2, status: 'EN_ROUTE' }),
      stop({ id: 'c', seq: 3, status: 'SCHEDULED' }),
    ]);
    expect(legs.map((l) => l.done)).toEqual([true, false]);
  });

  it('joins across a stop with no coordinates rather than breaking the line', () => {
    // Two disconnected segments would read as two routes. The omission is
    // disclosed by the persistent missing-location count instead.
    const legs = routeLegs([
      stop({ id: 'a', seq: 1 }),
      stop({ id: 'b', seq: 2, latitude: null, longitude: null }),
      stop({ id: 'c', seq: 3 }),
    ]);
    expect(legs).toHaveLength(1);
    expect([legs[0].from.id, legs[0].to.id]).toEqual(['a', 'c']);
  });

  it('draws nothing for a single stop', () => {
    expect(routeLegs([stop()])).toEqual([]);
    expect(routeLegs([])).toEqual([]);
  });
});

describe('techRouteColor', () => {
  it('is stable per technician, so the map and the grid agree on who is who', () => {
    expect(techRouteColor('Jordan Wei')).toBe(techRouteColor('Jordan Wei'));
  });

  it('never returns an accent variable — accent means selection', () => {
    ['Jordan Wei', 'Kenji Tanaka', 'Paul Wilcox', 'Ana Ruiz'].forEach((name) => {
      expect(techRouteColor(name)).not.toContain('accent');
    });
  });
});

describe('boundsOf', () => {
  it('spans every located point', () => {
    expect(
      boundsOf([
        { latitude: 33.1, longitude: -112.2 },
        { latitude: 33.5, longitude: -111.8 },
      ]),
    ).toEqual({ west: -112.2, south: 33.1, east: -111.8, north: 33.5 });
  });

  it('ignores points with no coordinates', () => {
    expect(
      boundsOf([
        { latitude: 33.1, longitude: -112.2 },
        { latitude: null, longitude: null },
      ]),
    ).toEqual({ west: -112.2, south: 33.1, east: -112.2, north: 33.1 });
  });

  it('returns null when there is nothing to frame', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ latitude: null, longitude: null }])).toBeNull();
  });
});

describe('nearestTechToPoint', () => {
  const byTech = {
    u1: [stop({ id: 'a', latitude: 33.45, longitude: -112.07 })],
    u2: [stop({ id: 'b', latitude: 34.5, longitude: -111.0 })],
  };

  it('picks the technician with the closest booked stop', () => {
    expect(nearestTechToPoint({ latitude: 33.46, longitude: -112.06 }, byTech)).toBe('u1');
    expect(nearestTechToPoint({ latitude: 34.49, longitude: -111.01 }, byTech)).toBe('u2');
  });

  it('returns null for a drop nowhere near a route, so the pin snaps back', () => {
    // The whole point: assigning to whoever is least far away across the
    // metro would turn an aimless drop into a commitment.
    expect(nearestTechToPoint({ latitude: 40.0, longitude: -100.0 }, byTech)).toBeNull();
  });

  it('ignores stops with no coordinates', () => {
    expect(
      nearestTechToPoint({ latitude: 33.45, longitude: -112.07 }, {
        u3: [stop({ latitude: null, longitude: null })],
      }),
    ).toBeNull();
  });
});
