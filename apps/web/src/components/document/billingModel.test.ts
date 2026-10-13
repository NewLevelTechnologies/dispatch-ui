import { describe, expect, it } from 'vitest';
import type { Invoice, Quote, QuoteInvoiceable } from '../../api/setup';
import { billingStats, buildBillingTree, invoicedPercent, localDate } from './billingModel';

const quote = (over: Partial<Quote>): Quote =>
  ({ id: 'q', quoteNumber: 'Q', status: 'ACCEPTED', totalAmount: 0, lineItems: [], createdAt: '2026-10-01T00:00:00Z', ...over }) as Quote;
const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'i',
    invoiceNumber: 'INV',
    status: 'SENT',
    totalAmount: 0,
    amountPaid: 0,
    balanceDue: 0,
    lineItems: [],
    createdAt: '2026-10-02T00:00:00Z',
    ...over,
  }) as Invoice;
const line = (id: string, sourceQuoteLineId?: string) => ({ id, sourceQuoteLineId }) as Invoice['lineItems'][number];

describe('buildBillingTree', () => {
  it('nests invoices under the quote they were billed from, a void next to its reissue', () => {
    const q1 = quote({ id: 'q1', lineItems: [{ id: 'ql1' }, { id: 'ql2' }] as Quote['lineItems'], createdAt: '2026-10-01T00:00:00Z' });
    const q2 = quote({ id: 'q2', status: 'SENT', createdAt: '2026-10-05T00:00:00Z' });
    const voided = invoice({ id: 'i1', status: 'VOID', lineItems: [line('a', 'ql2')], createdAt: '2026-10-03T00:00:00Z' });
    // The reissue's lines were all removed; it still follows its original.
    const reissue = invoice({ id: 'i2', status: 'DRAFT', reissuedFromInvoiceId: 'i1', createdAt: '2026-10-04T00:00:00Z' });
    const direct = invoice({ id: 'i3', lineItems: [line('b')], createdAt: '2026-10-06T00:00:00Z' });

    const tree = buildBillingTree([q1, q2], [reissue, direct, voided]);

    expect(tree.map((n) => (n.kind === 'quote' ? n.quote.id : n.invoice.id))).toEqual(['i3', 'q2', 'q1']);
    const q1Node = tree[2];
    expect(q1Node.kind === 'quote' && q1Node.invoices.map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});

describe('billingStats', () => {
  it('counts issued invoices as billed and keeps drafts, void and cancelled out', () => {
    const stats = billingStats(
      [quote({ status: 'ACCEPTED', totalAmount: 1000 }), quote({ status: 'SENT', totalAmount: 400 }), quote({ status: 'DECLINED', totalAmount: 99 })],
      [
        invoice({ status: 'SENT', totalAmount: 600, amountPaid: 100, balanceDue: 500 }),
        invoice({ status: 'PAID', totalAmount: 200, amountPaid: 200, balanceDue: 0 }),
        invoice({ status: 'DRAFT', totalAmount: 150, balanceDue: 150 }),
        invoice({ status: 'VOID', totalAmount: 600 }),
      ],
    );
    expect(stats).toEqual({ accepted: 1000, awaiting: 400, invoiced: 800, inDraft: 150, collected: 300, balance: 500 });
  });
});

describe('invoicedPercent', () => {
  const base = { quoteId: 'q', status: 'ACCEPTED' as const };
  const l = (quantity: number, invoicedQuantity: number, unitPrice: number) => ({
    quoteLineId: `${quantity}-${unitPrice}`,
    sortOrder: 0,
    description: 'x',
    type: null,
    unit: null,
    unitPrice,
    quantity,
    invoicedQuantity,
    remainingQuantity: quantity - invoicedQuantity,
  });

  it('weights lines by value and rounds down, so 100 means nothing is left', () => {
    const inv: QuoteInvoiceable = { ...base, lines: [l(1, 1, 300), l(2, 0, 50), l(1, 0, -20)] };
    expect(invoicedPercent(inv)).toBe(75);
    expect(invoicedPercent({ ...base, lines: [l(3, 2.999, 100)] })).toBe(99);
    expect(invoicedPercent({ ...base, lines: [l(2, 2, 100)] })).toBe(100);
    expect(invoicedPercent({ ...base, lines: [l(1, 0, -5)] })).toBeNull();
  });
});

describe('localDate', () => {
  it('uses the local calendar day', () => {
    expect(localDate(0, new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12');
    expect(localDate(30, new Date(2026, 9, 12, 23, 30))).toBe('2026-11-11');
  });
});
