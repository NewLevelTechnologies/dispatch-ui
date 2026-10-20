// ─────────────────────────────────────────────────────────────────
// KPI.tsx — dashboard stat card with colored left bar.
//
// Use sparingly. Put 4 across at most. Skip them entirely on list/
// detail pages — they're for the dashboard.
//
//   <KPI label="Open invoices" value="$48,920" delta="3 overdue"
//        bar="var(--warning-500)" />
//   <KPI label="Completed" value={7} sub="of 38" />
//   <KPI label="Jobs today" value={38} spark={[31,34,29,36,33,38]} />
//   <KPI label="Outstanding AR" value="$12,400" tag="As of today" />
// ─────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from 'react';
import { Sparkline } from './Sparkline';

type Props = {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaDir?: 'up' | 'down';
  meta?: string;
  /** CSS color for the left rule. Use a token like 'var(--accent-500)'. */
  bar?: string;
  /** Muted suffix after the value, e.g. "of 16". */
  sub?: ReactNode;
  /** Trend series drawn bottom-right in the bar color. Needs 2+ points. */
  spark?: number[];
  /** Tiny uppercase tag after the label, e.g. "As of today" when the figure
   *  doesn't follow the page's selected period. */
  tag?: string;
};

export function KPI({ label, value, delta, deltaDir = 'up', meta, bar, sub, spark, tag }: Props) {
  const sparkValues = spark && spark.length >= 2 ? spark : null;
  return (
    <div className="kpi" style={{ '--bar': bar } as CSSProperties}>
      <div className="kpi-label">
        {label}
        {tag && <span className="tag-tiny">{tag}</span>}
      </div>
      <div className="kpi-value">
        {value}
        {sub != null && <span className="kpi-sub">{sub}</span>}
      </div>
      <div className={`kpi-foot${sparkValues ? ' has-spark' : ''}`}>
        {delta && (
          <span className={`kpi-delta ${deltaDir}`}>
            {deltaDir === 'up' ? '▲' : '▼'} {delta}
          </span>
        )}
        {meta && <span className="kpi-meta">{meta}</span>}
      </div>
      {sparkValues && (
        <Sparkline values={sparkValues} color={bar} filled className="kpi-spark" />
      )}
    </div>
  );
}
