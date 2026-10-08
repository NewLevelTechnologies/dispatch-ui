import { describe, it, expect } from 'vitest';
import type { TechnicianProductivityResponse } from '../../api/setup';
import { creditedRevenue, MAX_TREND_WEEKS, techCsv, trendBars } from './techModel';

const week = (weekStart: string, revenue: number, jobs = 1) => ({ weekStart, revenue, jobs });

describe('trendBars', () => {
  it('draws weeks, the last one cut at asOf', () => {
    const bars = trendBars([week('2026-09-01', 100), week('2026-09-08', 200), week('2026-09-15', 50)], '2026-09-17');
    expect(bars.map((b) => [b.title, b.revenue])).toEqual([
      ['Sep 1 – 7, 2026', 100],
      ['Sep 8 – 14, 2026', 200],
      ['Sep 15 – 17, 2026', 50],
    ]);
  });

  it('draws months for a long range, each week in the month it starts in', () => {
    const weekly = Array.from({ length: MAX_TREND_WEEKS + 1 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i * 7));
      return week(d.toISOString().slice(0, 10), 10, 2);
    });
    const bars = trendBars(weekly, '2026-07-05');
    expect(bars[0]).toEqual({ title: 'Jan 2026', revenue: 50, jobs: 10 });
    expect(bars).toHaveLength(7);
  });
});

const data = {
  periodStart: '2026-09-01',
  asOf: '2026-09-30',
  technicians: [
    {
      userId: 'u1',
      name: 'Lena Lead',
      jobs: 12,
      revenue: 9800,
      averageTicket: 816.67,
      onSiteHours: 61.5,
      invoicedHours: 55,
      revenuePerInvoicedHour: 178.18,
      excludedHours: { agreement: 2, billedLater: 0, billedEarlier: 1.5, notBilled: 3 },
      firstVisit: { eligible: 10, completed: 9, rate: 0.9 },
      callbacks: 1,
      comparison: { jobs: 10, revenue: 8400, onSiteHours: 58, callbacks: 0 },
      weekly: [],
    },
  ],
  unattributed: { noWorkOrder: { count: 2, amount: 4000 }, noTechArrived: { count: 1, amount: 1250 } },
  totalRevenue: 15050,
  currency: 'USD',
  regionIds: null,
  comparison: { basis: 'previousPeriod', from: '2026-08-01', to: '2026-08-31', totalRevenue: 14000 },
} as TechnicianProductivityResponse;

describe('techCsv', () => {
  it('writes the techs, the unattributed amounts and the total, with the comparison on the right', () => {
    const csv = techCsv(data, {
      headers: ['Tech', 'Jobs', 'Revenue', 'Avg', 'OnSite', 'Inv', 'PerHr', 'FVE', 'FVC', 'CB', 'BL', 'BE', 'NB', 'AG'],
      comparisonHeaders: ['CJobs', 'CRevenue', 'COnSite', 'CCB'],
      name: (n) => n ?? 'Former',
      unattributed: { noWorkOrder: 'No WO', noTechArrived: 'No tech' },
      total: 'Total',
    });
    expect(csv.split('\r\n')).toEqual([
      'Tech,Jobs,Revenue,Avg,OnSite,Inv,PerHr,FVE,FVC,CB,BL,BE,NB,AG,CJobs,CRevenue,COnSite,CCB',
      'Lena Lead,12,9800.00,816.67,61.5,55.0,178.18,10,9,1,0.0,1.5,3.0,2.0,10,8400.00,58.0,0',
      'No WO,2,4000.00,,,,,,,,,,,,,,,',
      'No tech,1,1250.00,,,,,,,,,,,,,,,',
      'Total,,15050.00,,,,,,,,,,,,,14000.00,,',
      '',
    ]);
  });

  it('leaves the comparison columns out without a comparison', () => {
    const csv = techCsv(
      { ...data, comparison: null },
      {
        headers: ['Tech', 'Jobs', 'Revenue', 'Avg', 'OnSite', 'Inv', 'PerHr', 'FVE', 'FVC', 'CB', 'BL', 'BE', 'NB', 'AG'],
        comparisonHeaders: ['CJobs', 'CRevenue', 'COnSite', 'CCB'],
        name: (n) => n ?? 'Former',
        unattributed: { noWorkOrder: 'No WO', noTechArrived: 'No tech' },
        total: 'Total',
      },
    );
    expect(csv.split('\r\n')[0].split(',')).toHaveLength(14);
    expect(csv.split('\r\n')[4]).toBe('Total,,15050.00,,,,,,,,,,,');
  });

  it('credits techs with the total less the unattributed amounts', () => {
    expect(creditedRevenue(data)).toBe(9800);
  });
});
