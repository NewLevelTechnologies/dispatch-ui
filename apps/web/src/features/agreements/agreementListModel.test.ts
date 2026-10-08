import { describe, it, expect } from 'vitest';
import { formatWindowDates, listParams, parseSort, parseStatuses, windowState } from './agreementListModel';

const TODAY = '2026-10-08';

describe('list params', () => {
  it('shows the agreements in force by default, any status on request', () => {
    expect(parseStatuses([])).toEqual(['ACTIVE']);
    expect(parseStatuses(['SUSPENDED', 'junk'])).toEqual(['SUSPENDED']);
    expect(parseStatuses(['any'])).toEqual([]);
  });

  it('sorts by customer by default and keeps a known sort', () => {
    expect(parseSort(null)).toEqual({ key: 'customerName', dir: 'asc' });
    expect(parseSort('monthlyValue,desc')).toEqual({ key: 'monthlyValue', dir: 'desc' });
    expect(parseSort('bogus,desc')).toEqual({ key: 'customerName', dir: 'asc' });
  });

  it('asks for the renewing-soon set by its rule alone, which is active only', () => {
    const base = { q: '', statuses: ['SUSPENDED' as const], scope: ['r1'], sort: null, page: 2, size: 50 };
    expect(listParams({ ...base, renewing: false })).toEqual({
      q: undefined,
      status: ['SUSPENDED'],
      renewingWithinDays: undefined,
      regionIds: ['r1'],
      sort: 'customerName,asc',
      page: 1,
      size: 50,
    });
    expect(listParams({ ...base, renewing: true })).toMatchObject({ status: undefined, renewingWithinDays: 30 });
  });
});

describe('visit windows', () => {
  it('reads a window against today', () => {
    expect(windowState('2026-09-01', '2026-09-30', TODAY)).toEqual({ kind: 'overdue', days: 8 });
    expect(windowState('2026-10-01', '2026-10-31', TODAY)).toEqual({ kind: 'open', days: 23 });
    expect(windowState('2026-10-12', '2026-10-31', TODAY)).toEqual({ kind: 'upcoming', days: 4 });
  });

  it('names the dates, with years only when they differ from this one', () => {
    expect(formatWindowDates('2026-10-01', '2026-10-31', TODAY)).toBe('Oct 1 – 31');
    expect(formatWindowDates('2026-09-28', '2026-10-04', TODAY)).toBe('Sep 28 – Oct 4');
    expect(formatWindowDates('2026-12-20', '2027-01-10', TODAY)).toBe('Dec 20, 2026 – Jan 10, 2027');
  });
});
