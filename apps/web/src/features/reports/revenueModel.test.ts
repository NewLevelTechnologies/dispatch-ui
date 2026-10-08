import { describe, it, expect } from 'vitest';
import type { InvoiceListItemRow, RevenueReport } from '../../api/setup';
import {
  buckets,
  chartUnit,
  changePct,
  customRangeProblem,
  formatPct,
  formatSpan,
  ghostWindow,
  groupFilter,
  invoicesHref,
  rangeName,
  resolveRange,
  revenueCsv,
  windowName,
} from './revenueModel';

const TODAY = '2026-10-07';

const days = (from: string, amounts: number[]) =>
  amounts.map((amount, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), amount };
  });

describe('resolveRange', () => {
  it('defaults to last month, a finished period', () => {
    const r = resolveRange(null, TODAY);
    expect(r).toMatchObject({ id: '2026-09', kind: 'period', from: '2026-09-01', to: '2026-09-30' });
    expect(rangeName(r)).toBe('September 2026');
  });

  it('takes Home’s period ids, asking for the whole period (the server cuts at today)', () => {
    expect(resolveRange('2026-Q4', TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolveRange('2026-YTD', TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolveRange('2024-02', TODAY)).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('takes a custom range and rejects one the backend would', () => {
    expect(resolveRange('2026-09-08..2026-10-04', TODAY)).toMatchObject({ kind: 'custom', from: '2026-09-08', to: '2026-10-04' });
    expect(rangeName(resolveRange('2026-09-08..2026-10-04', TODAY))).toBe('Sep 8 – Oct 4, 2026');
    // Reversed, future, too long, or a future period: the default instead.
    for (const raw of ['2026-10-04..2026-09-08', '2026-11-01..2026-11-30', '2023-01-01..2026-01-01', '2026-11', 'junk'])
      expect(resolveRange(raw, TODAY).id).toBe('2026-09');
  });

  it('allows a span just under three years', () => {
    expect(customRangeProblem('2023-01-01', '2025-12-31', TODAY)).toBeNull();
    expect(customRangeProblem('2023-01-01', '2026-01-01', TODAY)).toBe('tooLong');
  });
});

describe('names', () => {
  it('names whole months, quarters and years, and dates anything else', () => {
    expect(windowName('2026-08-01', '2026-08-31')).toBe('Aug 2026');
    expect(windowName('2026-04-01', '2026-06-30')).toBe('Q2 2026');
    expect(windowName('2025-01-01', '2025-12-31')).toBe('2025');
    expect(windowName('2025-10-01', '2025-10-07')).toBe('Oct 1 – 7, 2025');
    expect(formatSpan('2025-12-01', '2026-01-31')).toBe('Dec 1, 2025 – Jan 31, 2026');
  });

  it('signs a change to one decimal, with nothing to compare against as null', () => {
    expect(changePct(110, 100)).toBe(10);
    expect(formatPct(changePct(97, 100)!)).toBe('−3.0%');
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(5, null)).toBeNull();
  });
});

describe('chart', () => {
  it('picks the unit from the range length', () => {
    expect(chartUnit(31)).toBe('day');
    expect(chartUnit(92)).toBe('week');
    expect(chartUnit(365)).toBe('month');
  });

  it('marks weekends and month starts on a daily chart', () => {
    // Sep 26 2026 is a Saturday.
    const b = buckets(days('2026-09-26', [1, 2, 3, 4, 5, 6]), 'day');
    expect(b.map((x) => x.weekend)).toEqual([true, true, false, false, false, false]);
    expect(b[5]).toMatchObject({ label: '1', monthStart: true, title: 'Oct 1, 2026' });
  });

  it('groups weeks in sevens from the first day and months by calendar month', () => {
    const w = buckets(days('2026-07-01', Array(10).fill(1)), 'week');
    expect(w.map((x) => [x.label, x.amount])).toEqual([['Jul 1', 7], ['Jul 8', 3]]);
    expect(w[1].title).toBe('Jul 8 – 10, 2026');
    const m = buckets(days('2026-01-30', [1, 1, 1, 1]), 'month');
    expect(m.map((x) => [x.label, x.amount])).toEqual([['Jan', 2], ['Feb', 2]]);
  });

  it('lines daily ghosts up by weekday against last year, otherwise by the comparison window', () => {
    const report = {
      from: '2026-09-01',
      to: '2026-09-30',
      comparison: { basis: 'sameDatesLastYear', from: '2025-09-01', to: '2025-09-30' },
    } as RevenueReport;
    expect(ghostWindow(report, 'day')).toEqual({ from: '2025-09-02', to: '2025-10-01', sameWeekdays: true });
    expect(ghostWindow(report, 'week')).toEqual({ from: '2025-09-01', to: '2025-09-30', sameWeekdays: false });
    expect(ghostWindow({ ...report, comparison: null }, 'day')).toBeNull();
  });
});

describe('drill-down', () => {
  it('turns a group into its invoice-list filter, unassigned included', () => {
    expect(groupFilter('division', 'd1')).toEqual({ divisionIds: ['d1'] });
    expect(groupFilter('division', null)).toEqual({ noDivision: true });
    expect(groupFilter('workOrderType', null)).toEqual({ noWorkOrderType: true });
    expect(groupFilter('region', 'r1')).toEqual({ regionIds: ['r1'] });
    expect(groupFilter('none', 'x')).toEqual({});
  });

  it('links to the invoices list with the report’s dates, scope and group', () => {
    const r = { from: '2026-09-01', to: '2026-09-30' };
    expect(invoicesHref(r, undefined)).toBe('/invoices?status=billed&from=2026-09-01&to=2026-09-30');
    expect(invoicesHref(r, ['r1'], { groupBy: 'division', id: null })).toBe(
      '/invoices?status=billed&from=2026-09-01&to=2026-09-30&region=r1&division=none',
    );
    expect(invoicesHref(r, ['r1'], { groupBy: 'region', id: 'r1' })).toBe(
      '/invoices?status=billed&from=2026-09-01&to=2026-09-30&region=r1',
    );
  });
});

describe('revenueCsv', () => {
  it('writes one escaped row per invoice under a plain header', () => {
    const row = {
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-09-30',
      customerName: 'Reyes, "Bob"',
      workOrderNumber: null,
      divisionId: 'd1',
      workOrderTypeId: null,
      regionId: 'r1',
      subtotal: 100,
      taxAmount: 8.25,
      totalAmount: 108.25,
    } as InvoiceListItemRow;
    const csv = revenueCsv([row], {
      headers: ['Number', 'Date', 'Customer', 'WO', 'Division', 'Type', 'Region', 'Subtotal', 'Tax', 'Total'],
      division: (id) => (id ? 'HVAC' : ''),
      type: (id) => (id ? 'x' : 'No type'),
      region: () => 'West',
    });
    expect(csv).toBe(
      'Number,Date,Customer,WO,Division,Type,Region,Subtotal,Tax,Total\r\n' +
        'INV-1,2026-09-30,"Reyes, ""Bob""",,HVAC,No type,West,100.00,8.25,108.25\r\n',
    );
  });
});
