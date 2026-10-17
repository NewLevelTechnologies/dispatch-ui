// "Present in home": the app's quote, its priced choice and the company,
// read into the shape the customer's proposal page renders, so the tablet
// shows exactly what the link shows. Cost and margin never cross over: the
// page has no place for them.
import type {
  PricedSelection,
  PublicApproval,
  PublicPricedSelection,
  PublicQuoteResponse,
  Quote,
  QuoteApproval,
  TenantSettings,
} from '../../api/setup';
import { addOnLines, allOptions, modeOf, optionHighlights, optionLines } from './proposalModel';

type Names = Record<string, { singular: string; plural: string }>;

/** Sent and past its expiration date (the link's `expired`). */
export function isExpired(quote: Quote, today: string): boolean {
  return quote.status === 'SENT' && !!quote.expirationDate && quote.expirationDate.slice(0, 10) < today;
}

export function toPresentation({
  quote,
  priced,
  approval,
  tenant,
  names,
  today,
}: {
  quote: Quote;
  priced: PricedSelection | undefined;
  approval: QuoteApproval | undefined;
  tenant: TenantSettings | undefined;
  /** The tenant's glossary, for the page's own words ("Estimate" for quote). */
  names: Names;
  today: string;
}): PublicQuoteResponse {
  const options = allOptions(quote);
  const groups = [...(quote.optionGroups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const money = (n: number | null | undefined) => (n == null ? null : String(n));
  return {
    tenant: {
      displayName: tenant?.companyName ?? null,
      companySlogan: null,
      supportEmail: null,
      supportPhone: tenant?.phone ?? null,
      logoUrl: tenant?.logoSmallUrl ?? tenant?.logoThumbnailUrl ?? null,
      streetAddress: null,
      city: null,
      state: null,
      zipCode: null,
      glossary: names,
    },
    customer: { id: quote.customerId, name: quote.customerName ?? '' },
    preview: false,
    quote: {
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      quoteDate: quote.quoteDate,
      expirationDate: quote.expirationDate,
      revision: quote.revision,
      title: quote.title ?? null,
      subtotal: money(quote.subtotal),
      taxRate: money(quote.taxRate),
      taxAmount: money(quote.taxAmount),
      totalAmount: money(quote.totalAmount),
      notes: null,
      lineItems: [],
      presentation: 'PROPOSAL',
      coverNote: quote.coverNote ?? null,
      advisor: {
        name: quote.advisorName ?? null,
        phone: null,
        title: quote.advisorTitle ?? null,
        photoUrl: quote.advisorPhotoUrl ?? null,
      },
      expired: isExpired(quote, today),
      proposal: {
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          options: options
            .filter((o) => o.groupId === g.id)
            .map((o) => ({
              id: o.id,
              name: o.name,
              tagline: o.tagline ?? null,
              recommended: o.recommended,
              specs: o.specs,
              highlights: optionHighlights(o),
              photos: (o.photos.length ? o.photos : (o.itemPresentation?.photos ?? [])).map((p) => ({
                url: p.url,
                thumbnailUrl: p.thumbnailUrl,
              })),
              description: o.itemPresentation?.description ?? null,
              rebateAmount: o.rebateAmount ?? null,
              lines: optionLines(quote, o.id).map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit ?? null })),
            })),
        })),
        addOns: addOnLines(quote).map((l) => ({
          lineId: l.id,
          description: l.description,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
          recommended: !!l.recommended,
          recommendationNote: l.recommendationNote ?? null,
          presentation: null,
          modes: Object.fromEntries(options.map((o) => [o.id, modeOf(o, l.id)])),
        })),
      },
      selection: (priced as PublicPricedSelection | undefined) ?? null,
      approval: (approval as PublicApproval | undefined) ?? null,
    },
  };
}
