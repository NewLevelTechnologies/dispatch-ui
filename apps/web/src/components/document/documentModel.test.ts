import { describe, it, expect } from 'vitest';
import type { DocumentAdjustment, DocumentLineItem } from '../../api/setup';
import {
  adjustmentChip,
  documentShare,
  formatDocDate,
  lineMargin,
  lineUpdate,
  marginSummary,
  memberLabel,
  moveLine,
  pct,
  savingsRows,
  taxSummary,
  unitPriceNote,
  type PricedDocument,
} from './documentModel';

const adj = (over: Partial<DocumentAdjustment>): DocumentAdjustment => ({
  id: 'a',
  lineId: 'l1',
  kind: 'AMOUNT',
  value: 10,
  reasonCode: 'GOODWILL',
  reasonNote: null,
  computedAmount: 10,
  createdByUserId: null,
  createdAt: null,
  sourceType: 'MANUAL',
  ...over,
});

const line = (over: Partial<DocumentLineItem>): DocumentLineItem => ({
  id: 'l1',
  description: 'Line',
  quantity: 1,
  unitPrice: 100,
  lineTotal: 100,
  netAmount: 100,
  ...over,
});

const doc = (over: Partial<PricedDocument>): PricedDocument => ({
  pricingModel: 'ENGINE',
  lineItems: [],
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 0,
  ...over,
});

describe('documentModel', () => {
  it('formats fractions as trimmed percents', () => {
    expect(pct(0.0825)).toBe('8.25%');
    expect(pct(0.1)).toBe('10%');
    expect(pct(0.15)).toBe('15%');
  });

  it('reads LocalDate strings as local days (no UTC shift)', () => {
    expect(formatDocDate('2026-10-01')).toBe('Oct 1, 2026');
    expect(formatDocDate('2026-10-01', false)).toBe('Oct 1');
    expect(formatDocDate(null)).toBeNull();
  });

  it('labels adjustments by figure and who/why', () => {
    expect(adjustmentChip(adj({ kind: 'PERCENT', value: 0.15 }))).toBe('−15% · Goodwill');
    expect(adjustmentChip(adj({ kind: 'AMOUNT', value: 25 }))).toBe('−$25.00 · Goodwill');
    expect(
      adjustmentChip(adj({ kind: 'WAIVE', value: null, reasonCode: 'MEMBER', sourceType: 'AGREEMENT', sourceLabel: 'Silver' })),
    ).toBe('Waived · Silver member');
  });

  it("derives a line's document-discount share from its adjustmentAmount, never negative", () => {
    const adjustments = [adj({ computedAmount: 10 })];
    expect(documentShare(line({ adjustmentAmount: 14.5 }), adjustments)).toBe(4.5);
    expect(documentShare(line({ adjustmentAmount: 10 }), adjustments)).toBe(0);
    expect(documentShare(line({ adjustmentAmount: null }), [])).toBe(0);
  });

  it('notes what the plan did, or that the price was typed', () => {
    expect(unitPriceNote(line({ unitPrice: 43.2, catalogUnitPrice: 48, pricingRule: 'PRICE_MULTIPLIER', pricingRuleValue: 0.9 }))).toBe(
      'list $48.00 · × 0.9 · plan',
    );
    expect(unitPriceNote(line({ unitPrice: 60, pricingRule: 'MARKUP_TIER', pricingRuleValue: 0.4 }))).toBe(
      'cost + 40% · plan tier',
    );
    expect(unitPriceNote(line({ itemId: 'i', unitPrice: 90, catalogUnitPrice: 89, priceOverridden: true }))).toBe('list $89.00 · price typed');
    // A freeform line's price is always typed — nothing worth saying.
    expect(unitPriceNote(line({ priceOverridden: true }))).toBeNull();
  });

  it('groups line savings by reason and keeps each document discount separate', () => {
    const rows = savingsRows(
      doc({
        lineItems: [line({ id: 'l1', adjustmentAmount: 15 }), line({ id: 'l2', adjustmentAmount: 8 }), line({ id: 'l3', adjustmentAmount: 0 })],
        adjustments: [
          adj({ id: 'm1', lineId: 'l1', reasonCode: 'MEMBER', sourceType: 'AGREEMENT', sourceLabel: 'Silver', computedAmount: 10 }),
          adj({ id: 'm2', lineId: 'l2', reasonCode: 'MEMBER', sourceType: 'AGREEMENT', sourceLabel: 'Silver', computedAmount: 5 }),
          adj({ id: 'd1', lineId: null, kind: 'PERCENT', value: 0.05, computedAmount: 8 }),
        ],
      }),
    );
    expect(rows).toEqual([
      { key: 'line:Silver member', label: 'Silver member', amount: 15 },
      { key: 'd1', label: 'Document discount · Goodwill 5%', amount: 8, spreadOver: 2 },
    ]);
  });

  it('summarizes tax from the taxable lines the server marked', () => {
    const tax = { jurisdictionId: 'j', jurisdictionName: 'Phoenix, AZ', jurisdictionRate: 0.086, exempt: false, exemptCertificate: null };
    expect(
      taxSummary(doc({ tax, taxAmount: 8.6, lineItems: [line({ taxable: true, netAmount: 100 }), line({ id: 'l2', taxable: false, netAmount: 50 })] })),
    ).toEqual({ label: 'Tax · Phoenix, AZ 8.6%', amount: 8.6, sub: 'on $100.00 taxable' });
    expect(taxSummary(doc({ tax, lineItems: [line({ taxable: false })] })).sub).toBe('No taxable lines');
    expect(taxSummary(doc({ pricingModel: 'LEGACY', taxRate: 8, taxAmount: 8 })).label).toBe('Tax · 8%');
  });

  it('leaves unknown-cost lines out of margin instead of counting them as free', () => {
    const lines = [line({ unitCost: 40, quantity: 2, netAmount: 100 }), line({ id: 'l2', unitCost: null, netAmount: 50 })];
    expect(marginSummary(lines)).toEqual({ cost: 80, margin: 0.2, unknownCount: 1 });
    expect(lineMargin(lines[0])).toBe(20);
    expect(lineMargin(lines[1])).toBeNull();
  });

  it('names the agreements member benefits came from, once each', () => {
    const m = { reasonCode: 'MEMBER' as const, sourceType: 'AGREEMENT' as const, sourceLabel: 'Silver' };
    expect(memberLabel([adj({ id: '1', ...m }), adj({ id: '2', ...m }), adj({ id: '3' })])).toBe('Silver');
    expect(memberLabel([adj({})])).toBeNull();
  });

  it('moves a dragged line into the target slot', () => {
    expect(moveLine(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveLine(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    const same = ['a', 'b'];
    expect(moveLine(same, 'a', 'a')).toBe(same);
  });

  it('switching a labor line’s rate keeps a typed description and drops the copied price', () => {
    const line = {
      id: 'l1', sortOrder: 0, type: 'LABOR', description: 'Diagnose no-cool', laborRateTypeId: 'r-reg', laborRateTypeName: 'Regular',
      quantity: 2, unit: 'hr', unitPrice: 95, unitCost: 38, lineTotal: 190, taxClass: 'LABOR',
    } as DocumentLineItem;
    expect(lineUpdate(line, 4, { laborRateTypeId: 'r-ot' })).toEqual({
      version: 4, type: 'LABOR', description: 'Diagnose no-cool', quantity: 2, taxClass: 'LABOR', laborRateTypeId: 'r-ot',
    });
    expect(lineUpdate({ ...line, description: 'Regular' }, 4, { laborRateTypeId: 'r-ot' }).description).toBeUndefined();
  });
});
