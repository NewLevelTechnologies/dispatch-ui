import { describe, it, expect } from 'vitest';
import {
  agingBuckets,
  cumulative,
  hours,
  matchesRevenueMtd,
  money,
  percentChange,
  revenueWeeks,
  shortDate,
} from './revenueSelectors';

const days = (asOf: string, amounts: number[]) =>
  amounts.map((amount, i) => ({ date: `${asOf.slice(0, 8)}${String(i + 1).padStart(2, '0')}`, amount }));

describe('revenueWeeks', () => {
  it('buckets 7 days from the 1st and marks the week in progress as partial', () => {
    const weeks = revenueWeeks(days('2026-09-17', Array(17).fill(100)), '2026-09-17');
    expect(weeks).toEqual([
      { label: 'Sep 1–7', amount: 700, partial: false },
      { label: 'Sep 8–14', amount: 700, partial: false },
      { label: 'Sep 15–21', amount: 300, partial: true },
    ]);
  });

  it('caps the last bucket at the month end and is complete on its last day', () => {
    const weeks = revenueWeeks(days('2026-09-30', Array(30).fill(1)), '2026-09-30');
    expect(weeks.at(-1)).toEqual({ label: 'Sep 29–30', amount: 2, partial: false });
  });

  it('is empty with no days', () => {
    expect(revenueWeeks([], '2026-09-01')).toEqual([]);
  });
});

describe('money + change', () => {
  it('formats whole dollars and compact labels', () => {
    expect(money(48920.4)).toBe('$48,920');
    expect(money(12400, { compact: true })).toBe('$12.4K');
    expect(money(640, { compact: true })).toBe('$640');
  });

  it('has no percent change without a previous period', () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
  });

  it('runs a cumulative total for the sparkline', () => {
    expect(cumulative(days('2026-09-03', [1, 2, 3]))).toEqual([1, 3, 6]);
  });
});

describe('agingBuckets', () => {
  it('folds 61–90 and 91+ into one 61+ bucket', () => {
    const b = (amount: number, count: number) => ({ amount, count });
    const rows = agingBuckets({
      asOf: '2026-09-30',
      outstanding: 1000,
      overdue: b(600, 6),
      current: b(400, 4),
      days1To30: b(300, 3),
      days31To60: b(100, 1),
      days61To90: b(150, 1),
      days91Plus: b(50, 1),
      averageDaysToPay: 18.5,
      currency: 'USD',
      regionIds: null,
    });
    expect(rows.map((r) => [r.id, r.amount, r.count, r.tone])).toEqual([
      ['current', 400, 4, 'success'],
      ['days1To30', 300, 3, 'warning'],
      ['days31To60', 100, 1, 'danger'],
      ['days61Plus', 200, 2, 'danger'],
    ]);
  });
});

describe('tech productivity formatting', () => {
  it('shows hours to one decimal without a trailing zero', () => {
    expect(hours(42)).toBe('42');
    expect(hours(6.54)).toBe('6.5');
  });

  it('compares the card total to Revenue MTD to the cent', () => {
    expect(matchesRevenueMtd(48920.1, 48920.1)).toBe(true);
    expect(matchesRevenueMtd(0.1 + 0.2, 0.3)).toBe(true);
    expect(matchesRevenueMtd(48920.1, 48920.11)).toBe(false);
  });

  it('formats an invoice date without shifting the day', () => {
    expect(shortDate('2026-09-01')).toBe('Sep 1');
  });
});
