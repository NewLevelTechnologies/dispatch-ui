// The proposal builder's reading of a quote: options, their lines, the
// add-ons and how each option treats them. Every figure is the server's.
import type {
  AddOnMode,
  Quote,
  QuoteLineItem,
  QuoteOption,
  QuoteOptionFields,
  UpdateQuoteHeaderRequest,
} from '../../api/setup';
import { toDateInput } from '../document/documentModel';

export const isProposal = (q: Pick<Quote, 'presentation'>) => q.presentation === 'PROPOSAL';

/** Every option in display order, across groups. */
export const allOptions = (q: Quote): QuoteOption[] =>
  [...(q.optionGroups ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((g) => [...g.options].sort((a, b) => a.sortOrder - b.sortOrder));

const byOrder = (a: QuoteLineItem, b: QuoteLineItem) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

export const optionLines = (q: Quote, optionId: string) =>
  q.lineItems.filter((l) => l.optionId === optionId && l.role !== 'ADD_ON').sort(byOrder);

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

/** What the builder lists under "Before sending". */
export function sendChecks(q: Quote): SendCheck[] {
  const options = allOptions(q);
  return [
    options.length >= 2
      ? { ok: true, text: `${options.length} options` }
      : { ok: false, text: 'Add a second option to compare' },
    ...options
      .filter((o) => optionLines(q, o.id).length === 0)
      .map((o) => ({ ok: false, text: `${o.name} has no lines` })),
    ...options.filter((o) => !optionPhoto(o)).map((o) => ({ ok: false, soft: true, text: `${o.name} has no photo` })),
  ];
}
