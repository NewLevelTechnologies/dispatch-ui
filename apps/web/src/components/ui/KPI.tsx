// ─────────────────────────────────────────────────────────────────
// KPI.tsx — dashboard stat card with colored left bar.
//
// Use sparingly. Put 4 across at most. Skip them entirely on list/
// detail pages — they're for the dashboard.
//
//   <KPI label="Open invoices" value="$48,920" delta="3 overdue"
//        bar="var(--warning-500)" />
// ─────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaDir?: 'up' | 'down';
  meta?: string;
  /** CSS color for the left rule. Use a token like 'var(--accent-500)'. */
  bar?: string;
};

export function KPI({ label, value, delta, deltaDir = 'up', meta, bar }: Props) {
  return (
    <div className="kpi" style={{ '--bar': bar } as CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="flex items-center gap-2">
        {delta && (
          <span className={`kpi-delta ${deltaDir}`}>
            {deltaDir === 'up' ? '▲' : '▼'} {delta}
          </span>
        )}
        {meta && <span className="kpi-meta">{meta}</span>}
      </div>
    </div>
  );
}
