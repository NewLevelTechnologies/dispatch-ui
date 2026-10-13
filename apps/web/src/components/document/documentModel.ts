// Pure display helpers for a priced quote or invoice (Pricebook Phase 1).
// The server does all the money math; nothing here recomputes a price, a tax
// or a total. These only label, group and sum what the server returned for
// display (e.g. the tax line's "on $X taxable" is the sum of the taxable
// lines' net amounts the server already settled).
import { formatCurrency } from '@dispatch/utils';
import type {
  AdjustmentReason,
  DocumentAdjustment,
  DocumentLineItem,
  DocumentTax,
  LineType,
  PricingModel,
  PricingRule,
  PricingWarning,
  TaxClass,
  UpdateLineRequest,
} from '../../api/setup';

/** The fields the document view reads; both `Quote` and `Invoice` satisfy it. */
export interface PricedDocument {
  pricingModel?: PricingModel;
  lineItems: DocumentLineItem[];
  adjustments?: DocumentAdjustment[];
  grossSubtotal?: number;
  adjustmentTotal?: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ratePlanName?: string | null;
  tax?: DocumentTax | null;
  warnings?: PricingWarning[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Documents created before the engine: read-only, taxed at the header rate. */
export const isLegacy = (doc: Pick<PricedDocument, 'pricingModel'>) => doc.pricingModel === 'LEGACY';

/** A fraction as a trimmed percent: 0.0825 → "8.25%", 0.1 → "10%". */
export function pct(fraction: number): string {
  return `${parseFloat((fraction * 100).toFixed(4))}%`;
}

export const LINE_TYPE_LABEL: Record<LineType, string> = {
  LABOR: 'Labor',
  SERVICE: 'Service',
  MATERIAL: 'Material',
  EQUIPMENT: 'Equipment',
  FEE: 'Fee',
};

/** Eyebrow color per line type — the mock's palette, as semantic tokens. */
export const LINE_TYPE_TONE: Record<LineType, string> = {
  LABOR: 'text-info-500',
  SERVICE: 'text-fg-accent',
  MATERIAL: 'text-violet-500',
  EQUIPMENT: 'text-success-500',
  FEE: 'text-warning-fg',
};

export const TAX_CLASS_LABEL: Record<TaxClass, string> = {
  LABOR: 'Labor',
  MATERIALS: 'Materials',
  EQUIPMENT: 'Equipment',
  FEE: 'Fee',
};

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  MEMBER: 'Member',
  REPAIR_APPROVED: 'Repair approved',
  GOODWILL: 'Goodwill',
  PROMOTION: 'Promotion',
  INCENTIVE: 'Incentive',
  DISCRETIONARY: 'Discretionary',
  OTHER: 'Other',
};

/** Lines in display order. */
export function sortLines<L extends DocumentLineItem>(lines: L[]): L[] {
  return [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

const isMember = (a: DocumentAdjustment) => a.sourceType === 'AGREEMENT' || a.reasonCode === 'MEMBER';

/** Who/why an adjustment is: the agreement's label for a member benefit, else the reason. */
export function adjustmentReasonLabel(a: DocumentAdjustment): string {
  if (isMember(a)) return a.sourceLabel ? `${a.sourceLabel} member` : 'Member';
  return REASON_LABEL[a.reasonCode] ?? a.reasonCode;
}

/** The figure part of a chip: "Waived", "−15%", "−$25.00". */
export function adjustmentFigure(a: DocumentAdjustment): string {
  if (a.kind === 'WAIVE') return 'Waived';
  if (a.kind === 'PERCENT') return `−${pct(a.value ?? 0)}`;
  return `−${formatCurrency(a.value ?? 0)}`;
}

/** "−15% · Silver member", "Waived · Goodwill". */
export const adjustmentChip = (a: DocumentAdjustment) => `${adjustmentFigure(a)} · ${adjustmentReasonLabel(a)}`;

/** Adjustments attached to one line (not document-wide ones). */
export function lineAdjustments(lineId: string, adjustments: DocumentAdjustment[] = []): DocumentAdjustment[] {
  return adjustments.filter((a) => a.lineId === lineId);
}

/**
 * The line's share of document-wide adjustments: the server's per-line
 * `adjustmentAmount` includes it, so it is what's left after the line's own.
 */
export function documentShare(line: DocumentLineItem, adjustments: DocumentAdjustment[] = []): number {
  const own = lineAdjustments(line.id, adjustments).reduce((s, a) => s + a.computedAmount, 0);
  return Math.max(0, round2((line.adjustmentAmount ?? 0) - own));
}

/** Where a line came from, for the muted line under its description. */
export type LineProvenance =
  | { kind: 'pricebook'; sku: string | null }
  | { kind: 'labor'; rateName: string | null }
  | { kind: 'po' }
  | { kind: 'freeform' };

export function lineProvenance(line: DocumentLineItem): LineProvenance {
  if (line.itemId) return { kind: 'pricebook', sku: line.itemSku ?? null };
  if (line.laborRateTypeId) return { kind: 'labor', rateName: line.laborRateTypeName ?? null };
  if (line.sourcePoLineId) return { kind: 'po' };
  return { kind: 'freeform' };
}

const RULE_NOTE: Record<PricingRule, (v: number | null | undefined) => string> = {
  MARKUP_TIER: (v) => `cost + ${pct(v ?? 0)} · plan tier`,
  PLAN_LABOR_RATE: () => 'plan labor rate',
  CATEGORY_MULTIPLIER: (v) => `× ${v ?? 1} · category`,
  PRICE_MULTIPLIER: (v) => `× ${v ?? 1} · plan`,
};

/**
 * The muted note under a unit price: what the rate plan did ("list $89.00 ·
 * × 0.9 · plan"), or that the user typed it. Null when the price is the list
 * price as-is.
 */
export function unitPriceNote(line: DocumentLineItem): string | null {
  const parts: string[] = [];
  if (line.catalogUnitPrice != null && line.catalogUnitPrice !== line.unitPrice) {
    parts.push(`list ${formatCurrency(line.catalogUnitPrice)}`);
  }
  if (line.priceOverridden && (line.itemId || line.laborRateTypeId)) parts.push('price typed');
  else if (line.pricingRule) parts.push(RULE_NOTE[line.pricingRule](line.pricingRuleValue));
  return parts.length ? parts.join(' · ') : null;
}

/** One row of the totals stack's savings section. */
export interface SavingsRow {
  key: string;
  label: string;
  amount: number;
  /** Document-wide: says it was spread over the lines before tax. */
  spreadOver?: number;
}

/**
 * Line adjustments grouped by who/why ("Silver member", "Goodwill"); each
 * document-wide adjustment on its own row, since it's one decision.
 */
export function savingsRows(doc: PricedDocument): SavingsRow[] {
  const adjustments = doc.adjustments ?? [];
  const grouped = new Map<string, number>();
  for (const a of adjustments) {
    if (a.lineId == null) continue;
    const label = adjustmentReasonLabel(a);
    grouped.set(label, round2((grouped.get(label) ?? 0) + a.computedAmount));
  }
  const rows: SavingsRow[] = [...grouped].map(([label, amount]) => ({ key: `line:${label}`, label, amount }));
  const spreadOver = doc.lineItems.filter((l) => documentShare(l, adjustments) > 0).length;
  for (const a of adjustments) {
    if (a.lineId != null) continue;
    const figure = a.kind === 'PERCENT' ? ` ${pct(a.value ?? 0)}` : '';
    rows.push({
      key: a.id,
      label: `Document discount · ${adjustmentReasonLabel(a)}${figure}`,
      amount: a.computedAmount,
      spreadOver,
    });
  }
  return rows;
}

/** What member benefits saved on this document, for the header's "Includes $X member savings". */
export function memberSavings(adjustments: DocumentAdjustment[] = []): number {
  return round2(adjustments.filter(isMember).reduce((s, a) => s + a.computedAmount, 0));
}

/** The tax line under the subtotal, from the server's per-line tax. */
export interface TaxSummary {
  label: string;
  amount: number;
  sub: string | null;
}

export function taxSummary(doc: PricedDocument): TaxSummary {
  if (isLegacy(doc)) {
    // LEGACY header rate is a whole percent (8.00 = 8%), unlike the engine's fractions.
    return {
      label: doc.taxRate > 0 ? `Tax · ${parseFloat(Number(doc.taxRate).toFixed(4))}%` : 'Tax',
      amount: doc.taxAmount,
      sub: null,
    };
  }
  const tax = doc.tax;
  if (tax?.exempt) {
    return {
      label: 'Tax',
      amount: doc.taxAmount,
      sub: tax.exemptCertificate ? `Tax-exempt · cert ${tax.exemptCertificate}` : 'Tax-exempt',
    };
  }
  const taxable = doc.lineItems.filter((l) => l.taxable);
  if (!taxable.length) return { label: 'Tax', amount: doc.taxAmount, sub: 'No taxable lines' };
  const base = round2(taxable.reduce((s, l) => s + (l.netAmount ?? l.lineTotal), 0));
  const name = tax?.jurisdictionName ? ` · ${tax.jurisdictionName}` : '';
  const rate = tax?.jurisdictionRate != null ? ` ${pct(tax.jurisdictionRate)}` : '';
  return { label: `Tax${name}${rate}`, amount: doc.taxAmount, sub: `on ${formatCurrency(base)} taxable` };
}

/**
 * Internal cost and margin. Lines with no cost are left out of BOTH sides
 * (an unknown cost is not a 100% margin) and counted, so the box can say so.
 */
export interface MarginSummary {
  cost: number;
  margin: number | null;
  unknownCount: number;
}

export function marginSummary(lines: DocumentLineItem[]): MarginSummary {
  const known = lines.filter((l) => l.unitCost != null);
  const cost = round2(known.reduce((s, l) => s + (l.unitCost ?? 0) * l.quantity, 0));
  const net = round2(known.reduce((s, l) => s + (l.netAmount ?? l.lineTotal), 0));
  return { cost, margin: net > 0 ? (net - cost) / net : null, unknownCount: lines.length - known.length };
}

/** One line's margin as a whole percent, or null when the cost is unknown or the line nets nothing. */
export function lineMargin(line: DocumentLineItem): number | null {
  const net = line.netAmount ?? line.lineTotal;
  if (line.unitCost == null || net <= 0) return null;
  return Math.round(((net - line.unitCost * line.quantity) / net) * 100);
}

/**
 * A document date for display. Business dates are LocalDate ("2026-10-09")
 * and must not go through `new Date(iso)`, which reads them as UTC midnight
 * and shows the day before in US timezones; audit fields are Instants.
 */
export function formatDocDate(value: string | null | undefined, withYear = true): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

/** Member benefit labels on the document, de-duplicated ("Comfort Club"). */
export function memberLabel(adjustments: DocumentAdjustment[] = []): string | null {
  const labels = [...new Set(adjustments.filter(isMember).map((a) => a.sourceLabel).filter((l): l is string => !!l))];
  return labels.length ? labels.join(', ') : null;
}

/** Line types a freeform line can take; labor lines come from a rate type. */
export const FREEFORM_TYPES: LineType[] = ['SERVICE', 'MATERIAL', 'EQUIPMENT', 'FEE'];

/** Freeform and PO lines are priced by hand, so their description and price are typed in place. */
export const isHandPriced = (line: DocumentLineItem) => {
  const kind = lineProvenance(line).kind;
  return kind === 'freeform' || kind === 'po';
};

/**
 * An edit replaces the whole line, so send everything it holds with the
 * change applied. Re-sending the same item or rate type keeps the values
 * copied when it was added; nothing is re-read from the pricebook.
 */
export function lineUpdate(
  line: DocumentLineItem,
  version: number,
  change: Partial<Pick<DocumentLineItem, 'description' | 'quantity' | 'unitPrice'>>,
): UpdateLineRequest {
  const opt = <T>(v: T | null | undefined) => (v == null ? undefined : v);
  return {
    version,
    type: opt(line.type),
    description: change.description ?? line.description,
    quantity: change.quantity ?? line.quantity,
    unitPrice: change.unitPrice ?? line.unitPrice,
    unitCost: opt(line.unitCost),
    unit: opt(line.unit),
    taxClass: opt(line.taxClass),
    laborRateTypeId: opt(line.laborRateTypeId),
    itemId: opt(line.itemId),
  };
}

/** Lines in a new order after dragging `fromId` onto `toId`'s slot. */
export function moveLine(ids: string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** LocalDate for a date input; tolerates an ISO instant. */
export const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');
