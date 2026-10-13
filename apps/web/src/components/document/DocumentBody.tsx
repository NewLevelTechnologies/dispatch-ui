/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { useState } from 'react';
import { formatCurrency } from '@dispatch/utils';
import { Card } from '../catalyst/card';
import { Callout } from '../ui/Callout';
import { DocumentLinesCard, type LineEditing } from './DocumentLinesCard';
import { DocumentTotals, type InvoiceSettlement } from './DocumentTotals';
import type { PricedDocument } from './documentModel';

/** Lines, totals and notes — the part quotes and invoices share outright. */
export function DocumentBody({
  doc,
  notes,
  settlement,
  editing,
}: {
  doc: PricedDocument;
  notes?: string | null;
  settlement?: InvoiceSettlement;
  /** Present while the document is editable. */
  editing?: LineEditing;
}) {
  // Internal cost/margin, on by default: CSRs price with it in view. Off hides
  // it from both the table and the totals (e.g. while screen-sharing).
  const [showCost, setShowCost] = useState(true);
  return (
    <>
      <DocumentLinesCard doc={doc} showCost={showCost} onShowCostChange={setShowCost} editing={editing} />
      <div className="mt-3.5 flex flex-col-reverse items-stretch gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 md:max-w-[520px] md:flex-1">
          {notes && (
            <Card title="Notes">
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg">{notes}</p>
            </Card>
          )}
        </div>
        <DocumentTotals doc={doc} settlement={settlement} showCost={showCost} />
      </div>
    </>
  );
}

/**
 * Draft-only pricing warnings, worded from `code` (never the server's
 * `message`). An unrecognized code still surfaces, generically.
 */
export function DocumentWarnings({
  doc,
  billToName,
  nte,
}: {
  doc: PricedDocument;
  billToName: string;
  nte?: number | null;
}) {
  const warnings = doc.warnings ?? [];
  if (!warnings.length) return null;
  return (
    <div className="mb-2.5 flex flex-col gap-2">
      {warnings.map((w) => {
        switch (w.code) {
          case 'TAX_JURISDICTION_NOT_SET':
            return (
              <Callout key={w.code} kind="warning" title="No tax charged">
                No tax jurisdiction applies to this location, and the company has no default jurisdiction.
              </Callout>
            );
          case 'TAX_RATE_NOT_SET':
            return (
              <Callout key={w.code} kind="warning" title="No tax charged">
                {doc.tax?.jurisdictionName ?? 'This location’s tax jurisdiction'} has no tax rate set yet.
              </Callout>
            );
          case 'NTE_EXCEEDED':
            return (
              <Callout key={w.code} kind="warning" title="Over not-to-exceed">
                This job’s invoices, this one included, come to more than its
                {nte != null ? ` ${formatCurrency(nte)}` : ''} not-to-exceed. Get approval from {billToName} before
                sending.
              </Callout>
            );
          default:
            return (
              <Callout key={w.code} kind="warning">
                This draft has a pricing issue to check before it’s sent.
              </Callout>
            );
        }
      })}
    </div>
  );
}
