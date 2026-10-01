import { describe, it, expect } from 'vitest';
import {
  comparisonLabel,
  isCurrentPeriod,
  parsePeriod,
  periodGroups,
  periodName,
  resolvePeriod,
  revenueMonths,
} from './period';

const TODAY = '2026-01-14';

describe('periodGroups', () => {
  it('offers this month and the 12 before it, this and last quarter, YTD and last year', () => {
    const [months, quarters, years] = periodGroups(TODAY);
    expect(months.options).toHaveLength(13);
    expect(months.options[0]).toEqual({ id: '2026-01', hint: 'thisMonth' });
    expect(months.options[1]).toEqual({ id: '2025-12', hint: 'lastMonth' });
    expect(months.options.at(-1)?.id).toBe('2025-01');
    // Last quarter crosses the year boundary in Q1.
    expect(quarters.options.map((o) => o.id)).toEqual(['2026-Q1', '2025-Q4']);
    expect(years.options.map((o) => o.id)).toEqual(['2026-YTD', '2025']);
  });
});

describe('resolvePeriod', () => {
  it('reads an offered period and falls back to this month otherwise', () => {
    expect(resolvePeriod('2025-Q4', TODAY).kind).toBe('quarter');
    expect(resolvePeriod(null, TODAY).id).toBe('2026-01');
    expect(resolvePeriod('2024-06', TODAY).id).toBe('2026-01');
    expect(resolvePeriod('garbage', TODAY).id).toBe('2026-01');
  });
});

describe('naming', () => {
  it('names each kind the way the sub line and chip read', () => {
    expect(periodName(parsePeriod('2026-09')!)).toBe('September 2026');
    expect(periodName(parsePeriod('2026-Q3')!)).toBe('Q3 2026');
    expect(periodName(parsePeriod('2026-YTD')!)).toBe('2026');
    expect(periodName(parsePeriod('2025')!)).toBe('2025');
  });

  it('knows which periods are still running', () => {
    expect(isCurrentPeriod(parsePeriod('2026-01')!, TODAY)).toBe(true);
    expect(isCurrentPeriod(parsePeriod('2026-Q1')!, TODAY)).toBe(true);
    expect(isCurrentPeriod(parsePeriod('2026-YTD')!, TODAY)).toBe(true);
    expect(isCurrentPeriod(parsePeriod('2025')!, TODAY)).toBe(false);
  });

  it('labels the delta by the basis the backend chose', () => {
    expect(comparisonLabel(parsePeriod('2026-01')!, 'sameDaysLastYear')).toEqual({ kind: 'sameDays', label: '2025' });
    expect(comparisonLabel(parsePeriod('2025-08')!, 'samePeriodLastYear')).toEqual({ kind: 'period', label: 'Aug 2024' });
    expect(comparisonLabel(parsePeriod('2025-Q4')!, 'samePeriodLastYear')?.label).toBe('Q4 2024');
    expect(comparisonLabel(parsePeriod('2026-01')!, 'previousMonth')?.label).toBe('Dec 2025');
    expect(comparisonLabel(parsePeriod('2025')!, null)).toBeNull();
  });
});

describe('revenueMonths', () => {
  const days = [
    { date: '2026-07-01', amount: 10 },
    { date: '2026-07-31', amount: 5 },
    { date: '2026-08-14', amount: 20 },
  ];

  it('sums days into calendar months and marks the running month partial', () => {
    expect(revenueMonths(days, '2026-08-14', true)).toEqual([
      { label: 'Jul', amount: 15, partial: false },
      { label: 'Aug', amount: 20, partial: true },
    ]);
  });

  it('has no partial month in a past period', () => {
    expect(revenueMonths(days, '2026-09-30', false).some((m) => m.partial)).toBe(false);
  });
});
