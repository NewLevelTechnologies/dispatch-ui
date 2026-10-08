import { describe, it, expect } from 'vitest';
import {
  cadenceSuffix,
  formatWindowDates,
  hasNarrowing,
  listParams,
  parseFilters,
  parseSort,
  parseStatuses,
  windowState,
} from './agreementListModel';

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

  it('sorts soonest renewal first when narrowed to the renewing', () => {
    expect(parseSort(null, true)).toEqual({ key: 'termEnd', dir: 'asc' });
    expect(parseSort('monthlyValue,desc', true)).toEqual({ key: 'monthlyValue', dir: 'desc' });
  });

  it('reads the chips from the URL', () => {
    const f = parseFilters(new URLSearchParams('status=any&plan=none&renewing=30&visits=behind&billing=none'));
    expect(f).toEqual({
      q: '',
      statuses: [],
      plan: 'none',
      renewing: true,
      visitsBehind: true,
      noBilling: true,
    });
    expect(hasNarrowing(f)).toBe(true);
    expect(hasNarrowing(parseFilters(new URLSearchParams('status=DRAFT')))).toBe(false);
  });

  it('keeps the status beside the renewing window, so Home’s Active count matches', () => {
    const page = { scope: ['r1'], sort: null, page: 2, size: 50 };
    expect(listParams(parseFilters(new URLSearchParams('renewing=30')), page)).toEqual({
      q: undefined,
      status: ['ACTIVE'],
      planId: undefined,
      noPlan: undefined,
      renewingWithinDays: 30,
      visitsBehind: undefined,
      noBilling: undefined,
      regionIds: ['r1'],
      sort: 'termEnd,asc',
      page: 1,
      size: 50,
    });
  });

  it('asks for one plan, or the custom ones', () => {
    const page = { scope: undefined, sort: null, page: 1, size: 50 };
    expect(listParams(parseFilters(new URLSearchParams('plan=p1')), page)).toMatchObject({ planId: ['p1'], noPlan: undefined });
    expect(listParams(parseFilters(new URLSearchParams('plan=none')), page)).toMatchObject({ planId: undefined, noPlan: true });
  });

  it('writes the real cadence under the monthly figure', () => {
    expect(cadenceSuffix('QUARTER', 1)).toBe('/ qtr');
    expect(cadenceSuffix('MONTH', 2)).toBe('/ 2 mo');
    expect(cadenceSuffix('YEAR', 1)).toBe('/ yr');
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
