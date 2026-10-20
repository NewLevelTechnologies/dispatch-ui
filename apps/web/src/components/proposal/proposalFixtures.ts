import type { PricedSelection, Quote, QuoteLineItem, QuoteOption, SelectionTotals } from '../../api/setup';

const totals = (total: number) => ({ grossSubtotal: total, adjustmentTotal: 0, subtotal: total, taxAmount: 0, totalAmount: total });

export function option(over: Partial<QuoteOption> = {}): QuoteOption {
  return {
    id: 'o-1',
    groupId: 'g-1',
    name: 'Essential',
    tagline: 'Dependable cooling at the lowest price',
    sortOrder: 0,
    recommended: false,
    selected: false,
    presentationItemId: 'item-1',
    itemPresentation: {
      highlights: ['10-yr parts warranty'],
      photos: [{ id: 'm-1', url: 'https://cdn/x.jpg', thumbnailUrl: 'https://cdn/x-t.jpg' }],
    },
    specs: ['15.2 SEER2'],
    highlights: [],
    photos: [],
    rebateAmount: null,
    addOnModes: {},
    totals: totals(11480),
    ...over,
  };
}

export function line(over: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'l-1',
    description: '3-ton 15.2 SEER2 split system',
    quantity: 1,
    unitPrice: 11100,
    lineTotal: 11100,
    type: 'EQUIPMENT',
    sortOrder: 0,
    optionId: 'o-1',
    role: 'REQUIRED',
    ...over,
  };
}

/** Essential (o-1) and Comfort (o-2, most popular, includes the thermostat), with two add-ons. */
export function proposalQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: 'q-1',
    customerId: 'c-1',
    quoteNumber: 'Q-1907',
    status: 'DRAFT',
    version: 4,
    pricingModel: 'ENGINE',
    quoteDate: null,
    expirationDate: null,
    subtotal: 15960,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 15960,
    presentation: 'PROPOSAL',
    coverNote: 'Here are two ways to go.',
    advisorUserId: null,
    optionGroups: [
      {
        id: 'g-1',
        name: 'Options',
        sortOrder: 0,
        options: [
          option(),
          option({
            id: 'o-2',
            name: 'Comfort',
            tagline: 'Quieter, steadier',
            sortOrder: 1,
            recommended: true,
            selected: true,
            rebateAmount: 400,
            itemPresentation: null,
            addOnModes: { 'l-tstat': 'INCLUDED' },
            totals: totals(15960),
          }),
        ],
      },
    ],
    selection: { optionIds: ['o-2'], addOnLineIds: [] },
    lineItems: [
      line({ itemId: 'item-1' }),
      line({ id: 'l-2', itemId: 'item-1', description: '3-ton 17 SEER2 two-stage system', unitPrice: 15580, lineTotal: 15580, optionId: 'o-2' }),
      line({ id: 'l-ducts', description: 'Duct sealing', unitPrice: 1850, lineTotal: 1850, optionId: null, role: 'ADD_ON', type: 'SERVICE' }),
      line({ id: 'l-tstat', description: 'Smart Wi-Fi thermostat', unitPrice: 420, lineTotal: 420, optionId: null, role: 'ADD_ON', type: 'EQUIPMENT' }),
    ],
    createdAt: '2026-10-17T12:00:00Z',
    updatedAt: '2026-10-17T12:00:00Z',
    ...over,
  };
}

const priced = (list: number, save: number, over: Partial<SelectionTotals> = {}): SelectionTotals => ({
  listPrice: list,
  youSave: save,
  subtotal: list - save,
  taxAmount: 0,
  totalAmount: list - save,
  rebateAmount: null,
  afterRebate: null,
  margin: { cost: 6980, margin: 0.38, costKnown: true, floor: 0.35, belowFloor: false },
  ...over,
});

const promo = (id: string, amount: number) => ({
  adjustmentId: id,
  lineId: null,
  kind: 'AMOUNT' as const,
  reasonCode: 'PROMOTION' as const,
  label: null,
  amount,
});

/** The customer chose Comfort + duct sealing; Comfort sits below a 35% floor. */
export function pricedSelection(over: Partial<PricedSelection> = {}): PricedSelection {
  return {
    quoteId: 'q-1',
    selection: { optionIds: ['o-2'], addOnLineIds: ['l-ducts'] },
    updatedVia: 'CUSTOMER',
    updatedAt: '2026-10-17T19:22:00Z',
    lines: [],
    savings: [promo('a-2', 500)],
    totals: priced(17430, 500, { rebateAmount: 400, afterRebate: 16530 }),
    options: [
      { optionId: 'o-1', groupId: 'g-1', name: 'Essential', selected: false, savings: [promo('a-1', 500)], totals: priced(11480, 500) },
      {
        optionId: 'o-2',
        groupId: 'g-1',
        name: 'Comfort',
        selected: true,
        savings: [promo('a-2', 500)],
        totals: priced(15960, 500, {
          rebateAmount: 400,
          afterRebate: 15060,
          margin: { cost: 10200, margin: 0.3402, costKnown: false, floor: 0.35, belowFloor: true },
        }),
      },
    ],
    priceRange: { low: 10980, high: 15460 },
    ...over,
  };
}
