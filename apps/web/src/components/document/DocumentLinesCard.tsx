/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import clsx from 'clsx';
import { formatCurrency } from '@dispatch/utils';
import type { DocumentLineItem } from '../../api/setup';
import { Card } from '../catalyst/card';
import { DenseTable, DenseTHead, DenseRow } from '../ui/DenseTable';
import { Tag } from '../ui/Pill';
import {
  LINE_TYPE_LABEL,
  LINE_TYPE_TONE,
  TAX_CLASS_LABEL,
  adjustmentChip,
  documentShare,
  isLegacy,
  lineAdjustments,
  lineMargin,
  lineProvenance,
  pct,
  sortLines,
  unitPriceNote,
  type PricedDocument,
} from './documentModel';

/**
 * The document's lines: one component for quotes and invoices (the line
 * editor; read-only until editing lands). Pricing context — rate plan and
 * tax — sits in the card head because it explains the numbers below it.
 */
export function DocumentLinesCard({
  doc,
  showCost,
  onShowCostChange,
}: {
  doc: PricedDocument;
  showCost: boolean;
  onShowCostChange: (show: boolean) => void;
}) {
  const legacy = isLegacy(doc);
  const lines = sortLines(doc.lineItems);
  const costCols = !legacy && showCost;

  return (
    <Card
      padding="none"
      title={
        <span className="flex flex-wrap items-center gap-2">
          Lines <span className="text-[11px] font-normal text-fg-muted">{lines.length}</span>
          {!legacy && <PricingContext doc={doc} />}
        </span>
      }
      action={
        !legacy && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fg">
            <input
              type="checkbox"
              checked={showCost}
              onChange={(e) => onShowCostChange(e.target.checked)}
              className="accent-[var(--accent-600)]"
            />
            Cost &amp; margin <Tag word>Internal</Tag>
          </label>
        )
      }
    >
      <div className="overflow-x-auto">
        <DenseTable className={legacy ? undefined : costCols ? 'min-w-[1040px]' : 'min-w-[880px]'}>
          <DenseTHead>
            <tr>
              <th>Item</th>
              <th className="right">Qty</th>
              <th className="right">Unit price</th>
              {!legacy && <th>Adjustments</th>}
              {!legacy && <th>Tax</th>}
              <th className="right">Amount</th>
              {costCols && <th className="right">Cost</th>}
              {costCols && <th className="right">Margin</th>}
            </tr>
          </DenseTHead>
          <tbody>
            {lines.map((line) => (
              <LineRow key={line.id} line={line} doc={doc} legacy={legacy} showCost={costCols} />
            ))}
            {!lines.length && (
              <tr>
                <td colSpan={8} className="py-7 text-center text-[12.5px] text-fg-muted">
                  No lines yet.
                </td>
              </tr>
            )}
          </tbody>
        </DenseTable>
      </div>
    </Card>
  );
}

function PricingContext({ doc }: { doc: PricedDocument }) {
  const tax = doc.tax;
  const taxValue = tax?.exempt
    ? 'Exempt'
    : tax?.jurisdictionName
      ? `${tax.jurisdictionName}${tax.jurisdictionRate != null ? ` · ${pct(tax.jurisdictionRate)}` : ' · no rate'}`
      : 'Not set';
  const chips: [string, string][] = [
    ...(doc.ratePlanName ? ([['Rate plan', doc.ratePlanName]] as [string, string][]) : []),
    ['Tax', taxValue],
  ];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {chips.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-border bg-bg px-2 py-0.5 text-[11.5px] font-normal"
        >
          <span className="text-fg-muted">{k}</span>
          <span className="font-semibold text-fg-strong">{v}</span>
        </span>
      ))}
    </span>
  );
}

function LineRow({
  line,
  doc,
  legacy,
  showCost,
}: {
  line: DocumentLineItem;
  doc: PricedDocument;
  legacy: boolean;
  showCost: boolean;
}) {
  const own = lineAdjustments(line.id, doc.adjustments);
  const share = documentShare(line, doc.adjustments);
  const net = line.netAmount ?? line.lineTotal;
  const discounted = !legacy && net < line.lineTotal;
  const note = legacy ? null : unitPriceNote(line);
  const margin = lineMargin(line);
  const lineCost = line.unitCost != null ? line.unitCost * line.quantity : null;

  return (
    <DenseRow>
      <td>
        {line.type && (
          <div className={clsx('text-[10px] font-bold uppercase tracking-[0.04em]', LINE_TYPE_TONE[line.type])}>
            {LINE_TYPE_LABEL[line.type]}
          </div>
        )}
        <div className="text-[12.5px] font-medium text-fg-strong">{line.description}</div>
        {!legacy && <Provenance line={line} />}
      </td>
      <td className="right num" data-label="Qty">
        {line.quantity}
        {line.unit && <div className="text-[10.5px] text-fg-muted">{line.unit}</div>}
      </td>
      <td className="right num" data-label="Unit price">
        {formatCurrency(line.unitPrice)}
        {note && <div className="text-[10.5px] leading-tight text-fg-muted">{note}</div>}
      </td>
      {!legacy && (
        <td data-label="Adjustments">
          <div className="flex flex-col items-start gap-1">
            {own.map((a) => (
              <span
                key={a.id}
                className="whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold text-success-500"
                style={{ background: 'color-mix(in oklch, var(--success-500) 12%, transparent)' }}
              >
                {adjustmentChip(a)}
              </span>
            ))}
            {share > 0 && <span className="text-[11px] tabular-nums text-fg-muted">Doc discount −{formatCurrency(share)}</span>}
            {!own.length && share <= 0 && <span className="text-fg-dim">—</span>}
          </div>
        </td>
      )}
      {!legacy && (
        <td data-label="Tax">
          <div className="text-[12px] text-fg">{line.taxClass ? TAX_CLASS_LABEL[line.taxClass] : '—'}</div>
          <div className="text-[10.5px] tabular-nums text-fg-muted">
            {line.taxable && line.taxRate != null
              ? `${pct(line.taxRate)} · ${formatCurrency(line.taxAmount ?? 0)}`
              : 'Not taxed'}
          </div>
        </td>
      )}
      <td className="right num" data-label="Amount">
        {discounted && <div className="text-[11px] text-fg-muted line-through">{formatCurrency(line.lineTotal)}</div>}
        <div className="text-[13px] font-semibold text-fg-strong">{formatCurrency(net)}</div>
      </td>
      {showCost && (
        <td className={clsx('right num', lineCost == null && 'text-fg-muted')} data-label="Cost">
          {lineCost == null ? 'Unknown' : formatCurrency(lineCost)}
        </td>
      )}
      {showCost && (
        <td className="right num" data-label="Margin">
          {margin == null ? <span className="text-fg-dim">—</span> : `${margin}%`}
        </td>
      )}
    </DenseRow>
  );
}

function Provenance({ line }: { line: DocumentLineItem }) {
  const p = lineProvenance(line);
  const text =
    p.kind === 'pricebook' ? (
      <span className="font-mono">{p.sku ?? 'Pricebook item'}</span>
    ) : p.kind === 'labor' ? (
      `Labor · ${p.rateName ?? 'rate type'}`
    ) : p.kind === 'po' ? (
      'From a purchase order'
    ) : (
      'Freeform · not in pricebook'
    );
  return <div className="mt-px text-[11px] text-fg-muted">{text}</div>;
}
