/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@dispatch/utils';
import type { NestedInvoicePayment, PaymentMethod } from '../../api/setup';
import { formatDocDate, isLegacy, marginSummary, savingsRows, taxSummary, type PricedDocument } from './documentModel';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CHECK: 'Check',
  CREDIT_CARD: 'Card',
  DEBIT_CARD: 'Debit card',
  ACH: 'ACH',
  WIRE_TRANSFER: 'Wire',
  OTHER: 'Other',
};

/** Invoice-only money below the total, all as the server returned it. */
export interface InvoiceSettlement {
  amountPaid: number;
  balanceDue: number;
  payments: NestedInvoicePayment[];
  /** Offers to void each payment still applied. */
  onVoidPayment?: (payment: NestedInvoicePayment) => void;
}

/**
 * Subtotal → savings → tax → total, then (invoices) payments and balance.
 * Every figure is the server's; the only client sums are display groupings.
 */
export function DocumentTotals({
  doc,
  settlement,
  showCost,
}: {
  doc: PricedDocument;
  settlement?: InvoiceSettlement;
  showCost: boolean;
}) {
  const legacy = isLegacy(doc);
  const savings = legacy ? [] : savingsRows(doc);
  const tax = taxSummary(doc);
  const margin = marginSummary(doc.lineItems);
  // Reversed slices stay as history: the invoice was voided or cancelled and
  // the money went back to the payment's unapplied balance.
  const reversed = settlement?.payments.filter((p) => p.reversedAt) ?? [];
  const applied = settlement?.payments.filter((p) => !p.reversedAt && p.status !== 'VOID') ?? [];

  return (
    <div className="w-full max-w-[360px]">
      <TotalRow label="Subtotal" value={formatCurrency(legacy ? doc.subtotal : (doc.grossSubtotal ?? doc.subtotal))} />
      {savings.map((r) => (
        <TotalRow
          key={r.key}
          label={r.label}
          sub={r.spreadOver ? `Spread across ${r.spreadOver} line${r.spreadOver === 1 ? '' : 's'} before tax` : undefined}
          value={`−${formatCurrency(r.amount)}`}
          save
        />
      ))}
      <TotalRow label={tax.label} sub={tax.sub ?? undefined} value={formatCurrency(tax.amount)} />
      <div className="mt-1.5 flex items-baseline justify-between border-t-2 border-border-strong pt-2">
        <span className="text-[14px] font-bold text-fg-strong">Total</span>
        <span className="text-[17px] font-bold tabular-nums text-fg-strong">{formatCurrency(doc.totalAmount)}</span>
      </div>

      {settlement && (settlement.amountPaid > 0 || reversed.length > 0) && (
        <>
          <TotalRow label="Payments applied" value={`−${formatCurrency(settlement.amountPaid)}`} />
          {applied.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 pb-1 pl-3 text-[11.5px] text-fg-muted">
              <span>
                <span className="font-mono">{p.paymentNumber}</span> · {METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod} ·{' '}
                {formatDocDate(p.paymentDate, false)}
                {settlement.onVoidPayment && (
                  <button
                    type="button"
                    className="card-action ml-2"
                    aria-label={`Void ${p.paymentNumber}`}
                    onClick={() => settlement.onVoidPayment!(p)}
                  >
                    Void
                  </button>
                )}
              </span>
              <span className="tabular-nums">{formatCurrency(p.amount)}</span>
            </div>
          ))}
          {reversed.map((p) => (
            <TotalRow
              key={`${p.id}-${p.reversedAt}`}
              label={
                <>
                  <span className="font-mono">{p.paymentNumber}</span> returned to credit
                </>
              }
              value={<span className="line-through">{formatCurrency(p.amount)}</span>}
              muted
            />
          ))}
          <TotalRow label="Balance due" value={formatCurrency(settlement.balanceDue)} strong />
        </>
      )}

      {showCost && !legacy && (
        <div className="mt-2.5 rounded-sm border border-dashed border-border-strong bg-bg-elev-2 px-2.5 py-2 text-[12px]">
          <div className="flex justify-between">
            <span className="text-fg-muted">Internal · known cost</span>
            <span className="font-semibold tabular-nums text-fg-strong">{formatCurrency(margin.cost)}</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-fg-muted">Margin</span>
            <span className="font-semibold tabular-nums text-fg-strong">
              {margin.margin == null ? '—' : `${Math.round(margin.margin * 100)}%`}
            </span>
          </div>
          {margin.unknownCount > 0 && (
            <div className="mt-1 text-[11px] text-fg-muted">
              {margin.unknownCount} line{margin.unknownCount === 1 ? '' : 's'} with unknown cost left out.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  sub,
  save,
  strong,
  muted,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: string;
  save?: boolean;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={clsx('text-[12px]', strong ? 'font-semibold text-fg-strong' : 'text-fg-muted')}>
        {label}
        {sub && <span className="block text-[10.5px] text-fg-muted">{sub}</span>}
      </span>
      <span
        className={clsx(
          'whitespace-nowrap tabular-nums',
          strong ? 'text-[13.5px] font-bold' : 'text-[12.5px] font-medium',
          save ? 'text-success-500' : muted ? 'text-fg-muted' : 'text-fg-strong',
        )}
      >
        {value}
      </span>
    </div>
  );
}
