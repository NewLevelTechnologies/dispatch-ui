import { describe, it, expect } from 'vitest';
import type { BoardDispatch, BoardTech } from '../../api/setup';
import { completedCount, jobCount, statusCounts, techCounts, techRows } from './opsSelectors';

const tech = (id: string, over: Partial<BoardTech> = {}): BoardTech => ({
  id,
  name: `Tech ${id}`,
  regionIds: [],
  stopCount: 0,
  committedCount: 0,
  divisionIds: [],
  timeOff: [],
  ...over,
});

const stop = (id: string, techId: string, over: Partial<BoardDispatch> = {}): BoardDispatch =>
  ({
    id,
    assignedUserId: techId,
    status: 'SCHEDULED',
    arrivalWindowStart: '2026-09-30T14:00:00Z',
    arrivalWindowEnd: '2026-09-30T16:00:00Z',
    arrivedAt: null,
    departedAt: null,
    serviceLocationName: null,
    customerName: null,
    serviceLocationCity: null,
    workOrderNumber: null,
    ...over,
  }) as BoardDispatch;

const off = { startsAt: '2026-09-30T13:00:00Z', endsAt: '2026-09-30T15:00:00Z', allDay: false, label: 'Dentist' };

describe('techCounts', () => {
  it('counts a tech with work AND a partial absence as working, never also off', () => {
    const counts = techCounts([
      tech('a', { committedCount: 3, timeOff: [off] }),
      tech('b', { timeOff: [off] }),
      tech('c'),
    ]);
    expect(counts).toEqual({ working: 1, off: 1, idle: 1 });
  });
});

describe('job counts', () => {
  const dispatches = [
    stop('1', 'a', { status: 'COMPLETED' }),
    stop('2', 'a', { status: 'CANCELLED' }),
    stop('3', 'a', { status: 'NO_SHOW' }),
    stop('4', 'a'),
  ];

  it('excludes cancelled and no-show from jobs, matching the summary jobCount', () => {
    expect(jobCount(dispatches)).toBe(2);
    expect(completedCount(dispatches)).toBe(1);
  });

  it('counts every one of the six statuses', () => {
    const counts = statusCounts(dispatches);
    expect(counts.COMPLETED).toBe(1);
    expect(counts.CANCELLED).toBe(1);
    expect(counts.NO_SHOW).toBe(1);
    expect(counts.SCHEDULED).toBe(1);
    expect(counts.EN_ROUTE).toBe(0);
  });
});

describe('techRows', () => {
  it('names the current stop and orders on site → en route → next → done', () => {
    const techs = [
      tech('done', { committedCount: 1 }),
      tech('next', { committedCount: 2 }),
      tech('site', { committedCount: 2 }),
      tech('road', { committedCount: 1 }),
      tech('free'),
    ];
    const dispatches = [
      stop('d1', 'done', { status: 'COMPLETED' }),
      stop('n1', 'next', { status: 'COMPLETED' }),
      stop('n2', 'next', { arrivalWindowStart: '2026-09-30T18:00:00Z' }),
      stop('s1', 'site', { status: 'IN_PROGRESS', arrivedAt: '2026-09-30T13:42:00Z' }),
      stop('r1', 'road', { status: 'EN_ROUTE' }),
    ];

    const rows = techRows(techs, dispatches);

    expect(rows.map((r) => [r.tech.id, r.mode])).toEqual([
      ['site', 'onSite'],
      ['road', 'enRoute'],
      ['next', 'next'],
      ['done', 'done'],
    ]);
    expect(rows[0].at).toBe('2026-09-30T13:42:00Z');
    expect(rows[2].stop?.id).toBe('n2');
    expect(rows[2]).toMatchObject({ done: 1, total: 2 });
  });

  it('treats an arrival with no departure as on site even before the status catches up', () => {
    const rows = techRows(
      [tech('a', { committedCount: 1 })],
      [stop('1', 'a', { status: 'EN_ROUTE', arrivedAt: '2026-09-30T13:00:00Z' })],
    );
    expect(rows[0].mode).toBe('onSite');
  });

  it("names nothing for a tech whose only work is outside this board's scope", () => {
    const rows = techRows([tech('a', { committedCount: 2 })], []);
    expect(rows[0]).toMatchObject({ mode: 'none', stop: null, done: 0, total: 2 });
  });
});
