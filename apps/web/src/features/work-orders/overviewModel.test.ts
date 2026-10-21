import { describe, it, expect } from 'vitest';
import type { DispatchBoardRow } from '../../api/setup';
import { deriveJobCost, pickHeroVisit } from './overviewModel';

const visit = (id: string, status: DispatchBoardRow['status'], extra: Partial<DispatchBoardRow> = {}) =>
  ({ id, status, arrivedAt: null, departedAt: null, ...extra }) as DispatchBoardRow;

describe('pickHeroVisit', () => {
  it('prefers the live visit', () => {
    const visits = [visit('a', 'COMPLETED'), visit('b', 'SCHEDULED'), visit('c', 'EN_ROUTE')];
    expect(pickHeroVisit(visits)?.id).toBe('c');
  });

  it('falls back to the next scheduled, then the most recent', () => {
    expect(pickHeroVisit([visit('a', 'COMPLETED'), visit('b', 'SCHEDULED')])?.id).toBe('b');
    expect(pickHeroVisit([visit('a', 'COMPLETED'), visit('b', 'COMPLETED')])?.id).toBe('b');
  });

  it('is null with no visits', () => {
    expect(pickHeroVisit([])).toBeNull();
  });
});

describe('deriveJobCost', () => {
  const visits = [
    // 1h 30m on site
    visit('a', 'COMPLETED', { arrivedAt: '2026-05-14T16:00:00Z', departedAt: '2026-05-14T17:30:00Z' }),
    // still on site — no departure, no hours yet
    visit('b', 'IN_PROGRESS', { arrivedAt: '2026-05-15T16:00:00Z' }),
  ];

  it('costs on-site hours at the labor rate, received parts, and margin over issued invoices', () => {
    const cost = deriveJobCost({
      visits,
      laborCostRate: 40,
      purchaseOrders: [
        { status: 'RECEIVED', totalCost: 100 },
        { status: 'ORDERED', totalCost: 500 }, // still on order — not cost yet
      ],
      invoices: [
        { status: 'SENT', totalAmount: 400 },
        { status: 'VOID', totalAmount: 999 },
        { status: 'DRAFT', totalAmount: 999 },
      ],
    });
    expect(cost.hours).toBeCloseTo(1.5);
    expect(cost.labor).toBe(60);
    expect(cost.parts).toBe(100);
    expect(cost.direct).toBe(160);
    expect(cost.invoiced).toBe(400);
    expect(cost.margin).toBe(60);
  });

  it('leaves labor unpriced without a cost rate and margin empty until invoiced', () => {
    const cost = deriveJobCost({ visits, laborCostRate: null, purchaseOrders: [], invoices: [] });
    expect(cost.labor).toBeNull();
    expect(cost.direct).toBe(0);
    expect(cost.margin).toBeNull();
  });
});
