import { describe, it, expect } from 'vitest';
import type { InvoiceListItemRow } from '../../api/setup';
import { bucketOn, daysPastDue, presetDate, receivablesCsv, resolveAsOf } from './receivablesModel';

const TODAY = '2026-10-08';

describe('resolveAsOf', () => {
  it('defaults to the end of last month, for month-end close', () => {
    expect(resolveAsOf(null, TODAY)).toEqual({ kind: 'lastMonthEnd', date: '2026-09-30' });
  });

  it('resolves the presets against today', () => {
    expect(presetDate('today', TODAY)).toBe(TODAY);
    expect(presetDate('lastQuarterEnd', TODAY)).toBe('2026-09-30');
    expect(presetDate('lastQuarterEnd', '2026-03-15')).toBe('2025-12-31');
    expect(presetDate('lastYearEnd', TODAY)).toBe('2025-12-31');
    expect(presetDate('lastMonthEnd', '2026-03-02')).toBe('2026-02-28');
  });

  it('takes a picked day up to today, and the default for anything later', () => {
    expect(resolveAsOf('2026-06-30', TODAY)).toEqual({ kind: 'date', date: '2026-06-30' });
    expect(resolveAsOf(TODAY, TODAY)).toEqual({ kind: 'date', date: TODAY });
    expect(resolveAsOf('2026-10-09', TODAY).kind).toBe('lastMonthEnd');
    expect(resolveAsOf('junk', TODAY).kind).toBe('lastMonthEnd');
  });
});

describe('aging on a date', () => {
  it('counts days past due from the date asked about', () => {
    expect(daysPastDue('2026-09-01', '2026-09-30')).toBe(29);
    expect(bucketOn('2026-09-30', '2026-09-30')).toBe('current');
    expect(bucketOn('2026-08-31', '2026-09-30')).toBe('days1To30');
    expect(bucketOn('2026-08-30', '2026-09-30')).toBe('days31To60');
    expect(bucketOn('2026-07-02', '2026-09-30')).toBe('days61To90');
    expect(bucketOn('2026-07-01', '2026-09-30')).toBe('days91Plus');
    expect(bucketOn('2026-07-01', '2026-10-08')).toBe('days91Plus');
  });
});

describe('receivablesCsv', () => {
  it('writes each open invoice with its age on the date', () => {
    const row = {
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-31',
      customerName: 'Reyes, Bob',
      workOrderNumber: 'WO-9',
      regionId: 'r1',
      totalAmount: 500,
      balanceDue: 0,
    } as InvoiceListItemRow;
    const csv = receivablesCsv([row], '2026-09-30', {
      headers: ['No', 'Issued', 'Due', 'Days', 'Age', 'Customer', 'WO', 'Region', 'Total', 'Balance today'],
      bucket: (k) => k,
      region: () => 'West',
    });
    expect(csv).toBe(
      'No,Issued,Due,Days,Age,Customer,WO,Region,Total,Balance today\r\n' +
        'INV-1,2026-08-01,2026-08-31,30,days1To30,"Reyes, Bob",WO-9,West,500.00,0.00\r\n',
    );
  });
});
