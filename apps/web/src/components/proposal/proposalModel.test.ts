import { describe, it, expect } from 'vitest';
import { addOnLines, allOptions, decideToday, headerFields, marginPct, promotionApplies, modeOf, savingLabel, optionFields, optionHighlights, optionLines, optionPhoto, sendChecks } from './proposalModel';
import { option, pricedSelection, proposalQuote } from './proposalFixtures';

describe('proposalModel', () => {
  it('reads options in order, their lines, and the add-ons', () => {
    const q = proposalQuote();
    expect(allOptions(q).map((o) => o.name)).toEqual(['Essential', 'Comfort']);
    expect(optionLines(q, 'o-2').map((l) => l.id)).toEqual(['l-2']);
    expect(addOnLines(q).map((l) => l.id)).toEqual(['l-ducts', 'l-tstat']);
  });

  it('treats an add-on missing from an option’s modes as offered', () => {
    const [essential, comfort] = allOptions(proposalQuote());
    expect(modeOf(essential, 'l-tstat')).toBe('OFFER');
    expect(modeOf(comfort, 'l-tstat')).toBe('INCLUDED');
  });

  it('falls back to the pricebook item’s photo and highlights', () => {
    const o = option();
    expect(optionPhoto(o)?.id).toBe('m-1');
    expect(optionHighlights(o)).toEqual(['10-yr parts warranty']);
    expect(optionHighlights(option({ highlights: ['Quiet'] }))).toEqual(['Quiet']);
  });

  it('sends an option back whole, with the change', () => {
    expect(optionFields(option({ photos: [{ id: 'm-9', url: 'u', thumbnailUrl: 't' }] }), { name: 'Basic' })).toEqual({
      name: 'Basic',
      tagline: 'Dependable cooling at the lowest price',
      recommended: false,
      presentationItemId: 'item-1',
      photoIds: ['m-9'],
      specs: ['15.2 SEER2'],
      highlights: [],
      rebateAmount: null,
    });
  });

  it('sends the header back whole, dates as dates', () => {
    const q = proposalQuote({ title: 'Replace AC', quoteDate: '2026-10-17T00:00:00Z', notes: 'Gate code 1234' });
    expect(headerFields(q, 7, { coverNote: 'Hi' })).toEqual({
      version: 7,
      title: 'Replace AC',
      quoteDate: '2026-10-17',
      expirationDate: null,
      serviceLocationId: null,
      customerPoNumber: null,
      notes: 'Gate code 1234',
      coverNote: 'Hi',
    });
  });

  it('lists what to fix before sending: one option, empty options, missing photos (soft)', () => {
    expect(sendChecks(proposalQuote())).toEqual([
      { ok: true, text: '2 options' },
      { ok: false, soft: true, text: 'Comfort has no photo' },
    ]);
    const lonely = proposalQuote({
      optionGroups: [{ id: 'g-1', name: 'Options', sortOrder: 0, options: [option({ id: 'o-9', name: 'Option 1' })] }],
    });
    expect(sendChecks(lonely)).toEqual([
      { ok: false, text: 'Add a second option to compare' },
      { ok: false, text: 'Option 1 has no lines' },
    ]);
  });

  it('adds below-floor options to the checks once priced', () => {
    expect(sendChecks(proposalQuote(), pricedSelection())).toContainEqual({ ok: false, text: 'Comfort is below the 35% margin floor' });
  });

  it('names a saving by its source, else its reason', () => {
    const base = { adjustmentId: 'a', lineId: null, kind: 'AMOUNT' as const, amount: 5 };
    expect(savingLabel({ ...base, reasonCode: 'MEMBER', label: 'Comfort Club' })).toBe('Comfort Club');
    expect(savingLabel({ ...base, reasonCode: 'GOODWILL', label: null })).toBe('Goodwill');
    expect(savingLabel({ ...base, kind: 'WAIVE', reasonCode: 'OTHER', label: null })).toBe('Waived');
    expect(marginPct(0.2478)).toBe('24.8%');
  });

  it('knows whether a promotion applies here: its own setting unless the quote overrides it', () => {
    const p = { id: 'p-1', autoApply: true } as never;
    const optional = { id: 'p-2', autoApply: false } as never;
    expect(promotionApplies(p, {})).toBe(true);
    expect(promotionApplies(p, { promotionOverrides: { 'p-1': 'EXCLUDE' } })).toBe(false);
    expect(promotionApplies(optional, {})).toBe(false);
    expect(promotionApplies(optional, { promotionOverrides: { 'p-2': 'APPLY' } })).toBe(true);
  });

  it('finds the decide-today saving and names it', () => {
    const base = { lineId: null, kind: 'AMOUNT' as const, value: 350, reasonNote: null, computedAmount: 350, createdByUserId: null, createdAt: null, sourceType: 'MANUAL' as const };
    const today = { ...base, id: 'a-2', reasonCode: 'INCENTIVE' as const, validThrough: '2026-10-12' };
    expect(decideToday({ adjustments: [{ ...base, id: 'a-1', reasonCode: 'INCENTIVE' }, today] })).toBe(today);
    expect(savingLabel({ adjustmentId: 'a-2', lineId: null, kind: 'AMOUNT', reasonCode: 'INCENTIVE', label: null, amount: 350, validThrough: '2026-10-12' })).toBe(
      'Decide-today savings',
    );
  });
});
