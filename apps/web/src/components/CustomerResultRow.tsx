/* eslint-disable i18next/no-literal-string -- short operational labels (Payer / N locations) kept literal to match the dense list rows. */
import type { ReactNode } from 'react';
import { Pill } from './ui/Pill';

// Shared customer "result row" identity cluster — used by the Add-Customer
// duplicate guard and the Add-Location customer picker so a match reads the
// same everywhere:
//
//   Paul Wilcox  [Payer?]
//   1942 Lenox Rd NE, Atlanta GA · 1 location · C-1442
//
// Caller owns the interaction (clickable row, "Use existing →" button, etc.);
// this only renders the disambiguating detail. Fields are optional — it shows
// whatever the data source carries (the lean picker search omits address/count;
// the list query includes them).
export function CustomerResultRow({
  name,
  customerNumber,
  addressLine,
  locationCount,
  isPayer,
}: {
  name: string;
  customerNumber?: string | null;
  addressLine?: string | null;
  locationCount?: number | null;
  isPayer?: boolean;
}) {
  const meta: ReactNode[] = [];
  if (addressLine) meta.push(addressLine);
  // A payer has no service locations by definition — show the flag instead of a count.
  if (!isPayer && typeof locationCount === 'number') {
    meta.push(`${locationCount} location${locationCount === 1 ? '' : 's'}`);
  }
  if (customerNumber) meta.push(<span className="font-mono">{customerNumber}</span>);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[12.5px] font-semibold text-fg-strong">{name}</span>
        {isPayer && <Pill tone="warning">Payer</Pill>}
      </div>
      {meta.length > 0 && (
        <div className="mt-0.5 truncate text-[11px] text-fg-muted">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="text-fg-dim"> · </span>}
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerResultRow;
