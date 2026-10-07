import { describe, it, expect } from 'vitest';
import {
  EMPTY_YEAR,
  amountProblem,
  applyFill,
  fillFromSource,
  hitCount,
  monthStatus,
  monthlyActuals,
  periodTarget,
  signedPct,
  spreadTotal,
  sumSet,
  targetAmounts,
  weekTarget,
} from './targetModel';

const year = (fill: (i: number) => number | null) => Array.from({ length: 12 }, (_, i) => fill(i));

describe('targetAmounts', () => {
  it('places each month by number and keeps nulls as no target', () => {
    const out = targetAmounts({
      year: 2026,
      months: [
        { month: 2, amount: 140000 },
        { month: 1, amount: null },
      ],
      updatedBy: null,
      updatedByName: null,
      updatedAt: null,
      firstInvoiceYear: 2025,
    });
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(140000);
    expect(out.slice(2).every((v) => v === null)).toBe(true);
  });
});

describe('periodTarget', () => {
  const amounts = year((i) => (i === 7 ? null : 100000));

  it('sums the whole period, even while it is still running', () => {
    expect(periodTarget('2026-10-01', '2026-10-31', amounts)).toBe(100000);
    expect(periodTarget('2026-04-01', '2026-06-30', amounts)).toBe(300000);
  });

  it('is null when any month in the period has no target', () => {
    expect(periodTarget('2026-07-01', '2026-09-30', amounts)).toBeNull();
    expect(periodTarget('2026-01-01', '2026-12-31', amounts)).toBeNull();
  });
});

describe('weekTarget', () => {
  it('splits a month by days, so the weeks sum to the month within cents', () => {
    const asOf = '2026-10-31';
    const weeks = [0, 1, 2, 3, 4].map((i) => weekTarget(i, asOf, 165000) as number);
    expect(weeks[0]).toBeCloseTo((165000 * 7) / 31, 2);
    expect(weeks[4]).toBeCloseTo((165000 * 3) / 31, 2);
    expect(Math.abs(weeks.reduce((s, w) => s + w, 0) - 165000)).toBeLessThan(0.05);
  });

  it('is null without a month target', () => {
    expect(weekTarget(0, '2026-10-07', null)).toBeNull();
  });
});

describe('hitCount', () => {
  it('scores only complete buckets that have a target', () => {
    expect(
      hitCount([
        { amount: 50, target: 40, partial: false },
        { amount: 30, target: 40, partial: false },
        { amount: 90, target: null, partial: false },
        { amount: 90, target: 40, partial: true },
      ]),
    ).toEqual({ hit: 1, of: 2 });
  });
});

describe('monthStatus', () => {
  it('closes months before the current one', () => {
    expect(monthStatus(2026, 9, '2026-10-07')).toBe('closed');
    expect(monthStatus(2026, 10, '2026-10-07')).toBe('current');
    expect(monthStatus(2026, 11, '2026-10-07')).toBe('open');
    expect(monthStatus(2025, 12, '2026-10-07')).toBe('closed');
    expect(monthStatus(2027, 1, '2026-10-07')).toBe('open');
  });
});

describe('monthlyActuals', () => {
  it('sums days by month and leaves months the data never reaches null', () => {
    const out = monthlyActuals([
      { date: '2026-01-02', amount: 100 },
      { date: '2026-01-20', amount: 50 },
      { date: '2026-02-01', amount: 0 },
    ]);
    expect(out[0]).toBe(150);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeNull();
  });
});

describe('quick fill', () => {
  it('grows last year by a percent, rounded to $1,000, skipping months it has nothing for', () => {
    const source = year((i) => (i === 3 ? null : 141000));
    const out = fillFromSource(source, 8);
    expect(out[0]).toBe(152000);
    expect(out[3]).toBeUndefined();
  });

  it('spreads a total so the twelve months sum to it exactly', () => {
    const shape = [141, 120, 118, 130, 160, 197, 214, 211, 182, 142, 128, 151].map((v) => v * 1000);
    const out = spreadTotal(2_400_000, shape);
    expect(sumSet(out)).toBe(2_400_000);
    expect(out[6]).toBeGreaterThan(out[2]);
    expect(out.slice(0, 11).every((v) => v % 1000 === 0)).toBe(true);
  });

  it('splits evenly without a shape', () => {
    const out = spreadTotal(1_000_000, null);
    expect(sumSet(out)).toBe(1_000_000);
    expect(out[0]).toBe(83000);
  });

  it('leaves skipped months (closed ones) as they are', () => {
    const draft = year((i) => (i === 0 ? 5 : null));
    const out = applyFill(draft, year(() => 9) as number[], (m) => m < 10);
    expect(out[0]).toBe(5);
    expect(out[8]).toBeNull();
    expect(out[9]).toBe(9);
  });
});

describe('amountProblem', () => {
  it('treats blank as fine and 0 as "leave it blank"', () => {
    expect(amountProblem(null)).toBeNull();
    expect(amountProblem(0)).toBe('zero');
    expect(amountProblem(1_000_000_001)).toBe('tooLarge');
    expect(amountProblem(150000)).toBeNull();
  });
});

describe('signedPct', () => {
  it('uses a true minus and needs both sides', () => {
    expect(signedPct(108, 100)).toBe('+8.0%');
    expect(signedPct(97, 100)).toBe('−3.0%');
    expect(signedPct(null, 100)).toBeNull();
    expect(signedPct(5, 0)).toBeNull();
  });
});

it('EMPTY_YEAR is twelve nulls', () => {
  expect(EMPTY_YEAR).toHaveLength(12);
});
