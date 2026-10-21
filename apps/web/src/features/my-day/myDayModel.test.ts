import { describe, it, expect } from 'vitest';
import type { DispatchBoardRow } from '../../api/setup';
import {
  focusAction,
  formatDuration,
  formatEstimate,
  onSiteMinutes,
  pickFocus,
  routeStops,
  showTomorrow,
} from './myDayModel';

const row = (over: Partial<DispatchBoardRow>): DispatchBoardRow =>
  ({
    id: 'd',
    workOrderId: 'wo',
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-10-21T15:00:00Z',
    arrivalWindowEnd: '2026-10-21T16:00:00Z',
    releasedAt: '2026-10-20T20:00:00Z',
    arrivedAt: null,
    departedAt: null,
    ...over,
  }) as DispatchBoardRow;

describe('routeStops', () => {
  it('orders by arrival window and drops unreleased and cancelled visits', () => {
    const stops = routeStops([
      row({ id: 'late', arrivalWindowStart: '2026-10-21T20:00:00Z' }),
      row({ id: 'early', arrivalWindowStart: '2026-10-21T15:00:00Z' }),
      row({ id: 'on-deck', releasedAt: null }),
      row({ id: 'cancelled', status: 'CANCELLED' }),
    ]);
    expect(stops.map((s) => s.id)).toEqual(['early', 'late']);
  });
});

describe('pickFocus', () => {
  it('prefers a live stop over an earlier scheduled one', () => {
    const focus = pickFocus([row({ id: 'a' }), row({ id: 'b', status: 'IN_PROGRESS' })]);
    expect(focus?.id).toBe('b');
  });

  it('falls back to the first scheduled stop, and to nothing when the day is done', () => {
    expect(pickFocus([row({ id: 'a', status: 'COMPLETED' }), row({ id: 'b' })])?.id).toBe('b');
    expect(pickFocus([row({ status: 'COMPLETED' }), row({ status: 'NO_SHOW' })])).toBeNull();
  });
});

describe('focusAction', () => {
  it('walks scheduled → en route → on site, and hands completion to the work order', () => {
    expect(focusAction('SCHEDULED')).toMatchObject({ kind: 'status', to: 'EN_ROUTE' });
    expect(focusAction('EN_ROUTE')).toMatchObject({ kind: 'status', to: 'IN_PROGRESS' });
    expect(focusAction('IN_PROGRESS')).toEqual({ kind: 'complete', labelKey: 'completeVisit' });
    expect(focusAction('COMPLETED')).toBeNull();
  });
});

describe('formatting', () => {
  it('estimates in minutes under an hour and half-hours above', () => {
    expect(formatEstimate(null)).toBeNull();
    expect(formatEstimate(45)).toBe('~45m');
    expect(formatEstimate(60)).toBe('~1h');
    expect(formatEstimate(90)).toBe('~1½h');
  });

  it('formats durations', () => {
    expect(formatDuration(400)).toBe('6h 40m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(45)).toBe('45m');
  });

  it('sums on-site time over visits with both stamps', () => {
    expect(
      onSiteMinutes([
        row({ arrivedAt: '2026-10-21T15:00:00Z', departedAt: '2026-10-21T16:10:00Z' }),
        row({ arrivedAt: '2026-10-21T17:00:00Z', departedAt: null }),
      ]),
    ).toBe(70);
  });
});

describe('showTomorrow', () => {
  it('hides only an empty weekend day', () => {
    expect(showTomorrow(0, '2026-10-24')).toBe(false); // Saturday
    expect(showTomorrow(2, '2026-10-24')).toBe(true);
    expect(showTomorrow(0, '2026-10-22')).toBe(true); // Thursday
  });
});
