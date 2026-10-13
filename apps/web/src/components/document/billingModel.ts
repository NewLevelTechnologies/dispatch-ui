import { InvoiceStatus, QuoteStatus, type Invoice, type Quote, type QuoteInvoiceable } from '../../api/setup';

/** A work order's documents as the billing tab lists them: each quote with the invoices billed from it. */
export type BillingNode =
  | { kind: 'quote'; quote: Quote; invoices: Invoice[] }
  | { kind: 'invoice'; invoice: Invoice };

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

/**
 * Nests each invoice under the quote its lines were billed from (a line's
 * `sourceQuoteLineId`). A reissue copies its lines, links included, so a
 * voided invoice and its correction sit together, oldest first. Invoices
 * not billed from one of these quotes stand on their own. Newest first.
 */
export function buildBillingTree(quotes: Quote[], invoices: Invoice[]): BillingNode[] {
  const quoteOfLine = new Map<string, string>();
  for (const q of quotes) for (const l of q.lineItems ?? []) quoteOfLine.set(l.id, q.id);

  const quoteOf = new Map<string, string>();
  for (const inv of invoices) {
    const line = (inv.lineItems ?? []).find((l) => l.sourceQuoteLineId && quoteOfLine.has(l.sourceQuoteLineId));
    if (line) quoteOf.set(inv.id, quoteOfLine.get(line.sourceQuoteLineId!)!);
  }
  // A reissue whose lines were all removed still belongs with its original.
  for (const inv of invoices) {
    if (!quoteOf.has(inv.id) && inv.reissuedFromInvoiceId && quoteOf.has(inv.reissuedFromInvoiceId)) {
      quoteOf.set(inv.id, quoteOf.get(inv.reissuedFromInvoiceId)!);
    }
  }

  const nodes: { createdAt: string; node: BillingNode }[] = [
    ...quotes.map((quote) => ({
      createdAt: quote.createdAt,
      node: {
        kind: 'quote' as const,
        quote,
        invoices: invoices.filter((i) => quoteOf.get(i.id) === quote.id).sort(byCreated),
      },
    })),
    ...invoices
      .filter((i) => !quoteOf.has(i.id))
      .map((invoice) => ({ createdAt: invoice.createdAt, node: { kind: 'invoice' as const, invoice } })),
  ];
  return nodes.sort((a, b) => byCreated(b, a)).map((n) => n.node);
}

/** Issued invoices: what the customer has been asked to pay. */
const ISSUED: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PAID];

export interface BillingStats {
  accepted: number;
  awaiting: number;
  invoiced: number;
  inDraft: number;
  collected: number;
  balance: number;
}

/** Sums of the documents' own totals; drafts aren't billed yet, void and cancelled never were. */
export function billingStats(quotes: Quote[], invoices: Invoice[]): BillingStats {
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const issued = invoices.filter((i) => ISSUED.includes(i.status));
  return {
    accepted: sum(quotes.filter((q) => q.status === QuoteStatus.ACCEPTED), (q) => q.totalAmount),
    awaiting: sum(quotes.filter((q) => q.status === QuoteStatus.SENT), (q) => q.totalAmount),
    invoiced: sum(issued, (i) => i.totalAmount),
    inDraft: sum(invoices.filter((i) => i.status === InvoiceStatus.DRAFT), (i) => i.totalAmount),
    collected: sum(issued, (i) => i.amountPaid),
    balance: sum(issued, (i) => i.balanceDue),
  };
}

/**
 * How much of an accepted quote is on invoices, by list value
 * (quantity × unit price), from the server's invoiced quantities. Rounded
 * down, so 100 means nothing is left. Credit lines can't be billed and
 * don't count. Null when there's nothing billable.
 */
export function invoicedPercent(invoiceable: QuoteInvoiceable): number | null {
  let whole = 0;
  let billed = 0;
  let left = 0;
  for (const l of invoiceable.lines) {
    if (l.unitPrice <= 0) continue;
    whole += l.quantity * l.unitPrice;
    billed += l.invoicedQuantity * l.unitPrice;
    left += l.remainingQuantity;
  }
  if (whole <= 0) return null;
  if (left <= 0) return 100;
  return Math.min(99, Math.floor((billed / whole) * 100));
}

/** Today in the browser's time zone, YYYY-MM-DD (toISOString would give UTC's date). */
export function localDate(offsetDays = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
