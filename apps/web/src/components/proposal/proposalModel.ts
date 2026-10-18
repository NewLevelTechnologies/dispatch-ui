// The proposal builder's reading of a quote: options, their lines, the
// add-ons and how each option treats them. Every figure is the server's.
import type {
  AddOnMode,
  DocumentAdjustment,
  Promotion,
  PricedSaving,
  PricedSelection,
  Quote,
  QuoteLineItem,
  QuoteOption,
  QuoteOptionFields,
  UpdateQuoteHeaderRequest,
} from '../../api/setup';
import { REASON_LABEL, toDateInput } from '../document/documentModel';

export const isProposal = (q: Pick<Quote, 'presentation'>) => q.presentation === 'PROPOSAL';

/** Every option in display order, across groups. */
export const allOptions = (q: Quote): QuoteOption[] =>
  [...(q.optionGroups ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((g) => [...g.options].sort((a, b) => a.sortOrder - b.sortOrder));

const byOrder = (a: QuoteLineItem, b: QuoteLineItem) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

export const optionLines = (q: Quote, optionId: string) =>
  q.lineItems.filter((l) => l.optionId === optionId && l.role !== 'ADD_ON').sort(byOrder);

/**
 * The option's system line: the one built from its pricebook item, else its
 * first pricebook line. Its photo, specs and highlights describe the option.
 */
export const systemLine = (q: Quote, o: QuoteOption) => {
  const lines = optionLines(q, o.id);
  return lines.find((l) => !!l.itemId && l.itemId === o.presentationItemId) ?? lines.find((l) => !!l.itemId) ?? null;
};

/** Required lines on the whole quote: sold with every option. */
export const sharedLines = (q: Quote) =>
  q.lineItems.filter((l) => !l.optionId && l.role !== 'ADD_ON').sort(byOrder);

export const addOnLines = (q: Quote) => q.lineItems.filter((l) => l.role === 'ADD_ON').sort(byOrder);

/** Missing from `addOnModes` means offered. */
export const modeOf = (option: QuoteOption, lineId: string): AddOnMode => option.addOnModes?.[lineId] ?? 'OFFER';

export const NEXT_MODE: Record<AddOnMode, AddOnMode> = { OFFER: 'INCLUDED', INCLUDED: 'HIDDEN', HIDDEN: 'OFFER' };

/** The option's own photo, else its pricebook item's. */
export const optionPhoto = (o: QuoteOption) => o.photos[0] ?? o.itemPresentation?.photos?.[0] ?? null;

/** The quote's highlights for the option, else its item's. */
export const optionHighlights = (o: QuoteOption) =>
  o.highlights.length ? o.highlights : (o.itemPresentation?.highlights ?? []);

/** An option's content, for PUT (replaced as a whole), with `change` applied. */
export function optionFields(o: QuoteOption, change: Partial<QuoteOptionFields> = {}): QuoteOptionFields {
  return {
    name: o.name,
    tagline: o.tagline ?? null,
    recommended: o.recommended,
    presentationItemId: o.presentationItemId ?? null,
    photoIds: o.photos.map((p) => p.id),
    specs: o.specs,
    highlights: o.highlights,
    rebateAmount: o.rebateAmount ?? null,
    ...change,
  };
}

/** The header edit replaces every field, so the current ones go back with `change`. */
export function headerFields(
  q: Quote,
  version: number,
  change: Partial<UpdateQuoteHeaderRequest> = {},
): UpdateQuoteHeaderRequest {
  return {
    version,
    title: q.title ?? null,
    quoteDate: toDateInput(q.quoteDate) || null,
    expirationDate: toDateInput(q.expirationDate) || null,
    serviceLocationId: q.serviceLocationId ?? null,
    customerPoNumber: q.customerPoNumber ?? null,
    notes: q.notes ?? null,
    ...change,
  };
}

export interface SendCheck {
  ok: boolean;
  /** Shown either way; `soft` problems don't block anything. */
  text: string;
  soft?: boolean;
}

/** A saving's name: its source's (a member plan), else its reason. */
export const savingLabel = (s: PricedSaving) =>
  s.label ||
  (s.reasonCode === 'INCENTIVE' && s.validThrough
    ? 'Decide-today savings'
    : s.kind === 'WAIVE'
      ? 'Waived'
      : (REASON_LABEL[s.reasonCode] ?? s.reasonCode));

/** "24.8%". */
export const marginPct = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

/** The priced card for an option, when the selection has loaded. */
export const pricedOption = (priced: PricedSelection | undefined, optionId: string) =>
  priced?.options.find((p) => p.optionId === optionId);

/** What the builder lists under "Before sending". `priced` adds the margin floor. */
export function sendChecks(q: Quote, priced?: PricedSelection): SendCheck[] {
  const options = allOptions(q);
  const belowFloor = (priced?.options ?? []).filter((p) => p.totals.margin?.belowFloor);
  return [
    options.length >= 2
      ? { ok: true, text: `${options.length} options` }
      : { ok: false, text: 'Add a second option to compare' },
    ...options
      .filter((o) => optionLines(q, o.id).length === 0)
      .map((o) => ({ ok: false, text: `${o.name} has no lines` })),
    ...belowFloor.map((p) => ({
      ok: false,
      text: `${p.name} is below the ${marginPct(p.totals.margin?.floor ?? 0)} margin floor`,
    })),
    ...options.filter((o) => !optionPhoto(o)).map((o) => ({ ok: false, soft: true, text: `${o.name} has no photo` })),
  ];
}

/** Whether a promotion applies on this quote: its own setting unless the quote overrides it. */
export function promotionApplies(p: Promotion, quote: Pick<Quote, 'promotionOverrides'>): boolean {
  const choice = quote.promotionOverrides?.[p.id];
  return choice === 'APPLY' || (choice !== 'EXCLUDE' && p.autoApply);
}

/** The decide-today saving: a quote-wide incentive with an end date. */
export const decideToday = (quote: Pick<Quote, 'adjustments'>): DocumentAdjustment | undefined =>
  (quote.adjustments ?? []).find((a) => !a.lineId && !a.optionId && a.reasonCode === 'INCENTIVE' && !!a.validThrough);
