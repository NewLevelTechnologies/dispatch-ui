import type { ReactNode } from 'react';

/**
 * One cell of a page's summary strip (Roles, Reports): an eyebrow label, a
 * big figure and an optional line under it. Not the dashboard's KPI. The
 * host lays cells out in a bordered grid; `last` drops the divider.
 */
export function SummaryCell({
  label,
  value,
  sub,
  last,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  last?: boolean;
}) {
  // The vertical dividers only line up in the desktop single-row layout. In
  // the 2-col mobile layout they'd land between odd/even cells where they
  // don't belong — hide below sm, restore at sm:.
  return (
    <div className={'px-4 py-[11px]' + (last ? '' : ' sm:border-r sm:border-border-soft')}>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">{label}</div>
      <div className="mt-0.5 text-[20px] font-bold leading-none tracking-[-0.02em] text-fg-strong tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] text-fg-muted">{sub}</div>}
    </div>
  );
}
