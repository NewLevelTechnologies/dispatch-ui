import { describe, it, expect } from 'vitest';
import { isExpired, toPresentation } from './presentModel';
import { pricedSelection, proposalQuote } from './proposalFixtures';

const names = { quote: { singular: 'Estimate', plural: 'Estimates' } };

describe('toPresentation', () => {
  it('reads the quote into the proposal page’s shape: options, add-ons and their modes per option', () => {
    const data = toPresentation({
      quote: proposalQuote({ customerName: 'Tanya Reyes', advisorName: 'Danny Ortiz', advisorTitle: 'Comfort Advisor', advisorPhotoUrl: 'https://cdn/danny.jpg' }),
      priced: pricedSelection(),
      approval: undefined,
      tenant: { companyName: 'Coolfront', phone: '(602) 555-0100', logoSmallUrl: 'https://cdn/logo.png' } as never,
      names,
      today: '2026-10-17',
    });

    expect(data.tenant).toMatchObject({ displayName: 'Coolfront', supportPhone: '(602) 555-0100', logoUrl: 'https://cdn/logo.png', glossary: names });
    expect(data.customer.name).toBe('Tanya Reyes');
    expect(data.quote.advisor).toEqual({ name: 'Danny Ortiz', phone: null, title: 'Comfort Advisor', photoUrl: 'https://cdn/danny.jpg' });
    const [essential, comfort] = data.quote.proposal!.groups[0].options;
    // The item's highlights and photo stand in when the option has none of its own.
    expect(essential.highlights).toEqual(['10-yr parts warranty']);
    expect(essential.photos).toEqual([{ url: 'https://cdn/x.jpg', thumbnailUrl: 'https://cdn/x-t.jpg' }]);
    expect(comfort).toMatchObject({ recommended: true, rebateAmount: 400, photos: [] });
    expect(comfort.lines).toEqual([{ description: '3-ton 17 SEER2 two-stage system', quantity: 1, unit: null }]);
    const tstat = data.quote.proposal!.addOns.find((a) => a.lineId === 'l-tstat')!;
    expect(tstat.modes).toEqual({ 'o-1': 'OFFER', 'o-2': 'INCLUDED' });
    expect(data.quote.selection?.totals.totalAmount).toBe(16930);
    expect(data.quote.expired).toBe(false);
  });

  it('calls a sent quote past its date expired; a draft never is', () => {
    expect(isExpired(proposalQuote({ status: 'SENT', expirationDate: '2026-10-16' }), '2026-10-17')).toBe(true);
    expect(isExpired(proposalQuote({ status: 'SENT', expirationDate: '2026-10-17' }), '2026-10-17')).toBe(false);
    expect(isExpired(proposalQuote({ status: 'DRAFT', expirationDate: '2026-10-01' }), '2026-10-17')).toBe(false);
  });
});
