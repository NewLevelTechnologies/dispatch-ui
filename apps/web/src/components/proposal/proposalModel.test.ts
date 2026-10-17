import { describe, it, expect } from 'vitest';
import { addOnLines, allOptions, headerFields, modeOf, optionFields, optionHighlights, optionLines, optionPhoto, sendChecks } from './proposalModel';
import { option, proposalQuote } from './proposalFixtures';

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
});
