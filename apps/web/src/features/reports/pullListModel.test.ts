import { describe, it, expect } from 'vitest';
import type { FilterPullList } from '../../api/setup';
import { customDaysProblem, filterCount, formatDays, pullListCsv, resolveDays, stopCount, stopDay } from './pullListModel';

const TODAY = '2026-10-08';

describe('resolveDays', () => {
  it('defaults to tomorrow, the day the list is pulled for', () => {
    expect(resolveDays(null, TODAY)).toEqual({ kind: 'tomorrow', date: '2026-10-09', dateTo: '2026-10-09' });
    expect(resolveDays('junk', TODAY).kind).toBe('tomorrow');
  });

  it('takes today, one picked day, or a picked range, past days included', () => {
    expect(resolveDays('today', TODAY)).toEqual({ kind: 'today', date: TODAY, dateTo: TODAY });
    expect(resolveDays('2026-10-01', TODAY)).toEqual({ kind: 'custom', date: '2026-10-01', dateTo: '2026-10-01' });
    expect(resolveDays('2026-10-09..2026-10-12', TODAY)).toEqual({
      kind: 'custom',
      date: '2026-10-09',
      dateTo: '2026-10-12',
    });
  });

  it('refuses a range the server would: reversed, or over 31 days', () => {
    expect(customDaysProblem('2026-10-12', '2026-10-09')).toBe('order');
    expect(customDaysProblem('2026-10-01', '2026-11-01')).toBeNull();
    expect(customDaysProblem('2026-10-01', '2026-11-02')).toBe('tooLong');
    expect(resolveDays('2026-10-01..2026-11-02', TODAY).kind).toBe('tomorrow');
  });
});

describe('formatDays', () => {
  it('names the day, and both ends of a range, with a year only when it isn’t this one', () => {
    expect(formatDays('2026-10-09', '2026-10-09', TODAY)).toBe('Fri, Oct 9');
    expect(formatDays('2026-10-09', '2026-10-12', TODAY)).toBe('Fri, Oct 9 – Mon, Oct 12');
    expect(formatDays('2027-01-04', '2027-01-04', TODAY)).toBe('Mon, Jan 4, 2027');
    expect(stopDay('2026-10-12')).toBe('Mon 12');
  });
});

const list: FilterPullList = {
  date: '2026-10-09',
  dateTo: '2026-10-09',
  techs: [
    {
      userId: 'u1',
      name: 'Alice Adams',
      stops: [
        {
          dispatchId: 'd1',
          workOrderId: 'wo1',
          workOrderNumber: 'WO-1042',
          arrivalWindowStart: '2026-10-09T14:00:00Z',
          arrivalWindowEnd: '2026-10-09T16:00:00Z',
          customerName: 'Acme, "Main"',
          locationName: 'Main Street Shop',
          streetAddress: '100 Main St',
          city: 'Springfield',
          filters: [
            { lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2, equipmentName: 'RTU-1' },
            { lengthIn: 20, widthIn: 25, thicknessIn: 2, quantity: 1, equipmentName: 'RTU-2' },
          ],
        },
        {
          dispatchId: 'd2',
          workOrderId: 'wo2',
          workOrderNumber: 'WO-1043',
          arrivalWindowStart: '2026-10-09T17:00:00Z',
          arrivalWindowEnd: null,
          customerName: null,
          locationName: null,
          streetAddress: null,
          city: null,
          filters: [],
        },
      ],
      totals: [
        { lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2 },
        { lengthIn: 20, widthIn: 25, thicknessIn: 2, quantity: 1 },
      ],
    },
  ],
  totals: [
    { lengthIn: 16, widthIn: 20, thicknessIn: 1, quantity: 2, equipmentCount: 1 },
    { lengthIn: 20, widthIn: 25, thicknessIn: 2, quantity: 1, equipmentCount: 1 },
  ],
  regionIds: null,
};

describe('counts', () => {
  it('counts filters, not sizes, and every stop', () => {
    expect(filterCount(list.totals)).toBe(3);
    expect(stopCount(list)).toBe(2);
  });
});

describe('pullListCsv', () => {
  it('writes a row per filter in printed order, and keeps a stop with none', () => {
    const csv = pullListCsv(list, {
      headers: ['Tech', 'Date', 'Window', 'WO', 'Customer', 'Location', 'Address', 'City', 'Equipment', 'Size', 'Qty'],
      tech: (n) => n ?? 'Unnamed',
      day: (iso) => iso.slice(0, 10),
      window: (_start, end) => (end ? '10–12a' : '1p'),
    });
    expect(csv.split('\r\n')).toEqual([
      'Tech,Date,Window,WO,Customer,Location,Address,City,Equipment,Size,Qty',
      'Alice Adams,2026-10-09,10–12a,WO-1042,"Acme, ""Main""",Main Street Shop,100 Main St,Springfield,RTU-1,16×20×1,2',
      'Alice Adams,2026-10-09,10–12a,WO-1042,"Acme, ""Main""",Main Street Shop,100 Main St,Springfield,RTU-2,20×25×2,1',
      'Alice Adams,2026-10-09,1p,WO-1043,,,,,,,',
      '',
    ]);
  });
});
