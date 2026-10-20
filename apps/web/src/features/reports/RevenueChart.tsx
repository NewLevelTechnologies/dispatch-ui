// The report's one chart: plain divs, current bars in the accent with the
// comparison as ghost bars behind. The unit follows the range's length.
import { useTranslation } from '@dispatch/i18n';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { money } from '../home/revenueSelectors';
import type { ChartBucket, ChartUnit } from './revenueModel';

const PLOT_H = 170;

export function RevenueChart({
  unit,
  bars,
  ghosts,
  rangeLabel,
  ghostLabel,
  title,
  format = money,
  max: fixedMax,
}: {
  unit: ChartUnit;
  bars: ChartBucket[];
  /** Lined up with `bars` by index; undefined with no comparison (or while it loads). */
  ghosts: ChartBucket[] | undefined;
  rangeLabel: string;
  /** "Sep 2025" or "Sep 2025, same weekdays". */
  ghostLabel: string | null;
  /** Card title; defaults to revenue by the chart's unit. */
  title?: string;
  /** A bar's value as text. Money by default. */
  format?: (n: number) => string;
  /** A fixed top of the scale (1 for a rate); else the tallest bar. */
  max?: number;
}) {
  const { t } = useTranslation();
  const max = fixedMax ?? Math.max(1, ...bars.map((b, i) => Math.max(b.amount, ghosts?.[i]?.amount ?? 0)));
  const px = (n: number) => Math.round((n / max) * PLOT_H);
  const crowded = bars.length > 20;
  // Label every bar while they fit; on a crowded daily chart every fifth day
  // and each month's first.
  const every = crowded ? (unit === 'day' ? 5 : 2) : 1;

  return (
    <Card>
      <CardHead>
        <CardTitle>{title ?? t(`reports.revenue.chart.${unit}`)}</CardTitle>
        <span className="rp-legend">
          <span>
            <span className="rp-key bar" />
            {rangeLabel}
          </span>
          {ghosts && ghostLabel && (
            <span>
              <span className="rp-key ghost" />
              {ghostLabel}
            </span>
          )}
        </span>
      </CardHead>
      <CardBody>
        <div
          className="rp-chart"
          style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: crowded ? 3 : 8 }}
        >
          {bars.map((b, i) => {
            const ghost = ghosts?.[i];
            const title = ghost
              ? `${b.title}: ${format(b.amount)} · ${ghostLabel}: ${format(ghost.amount)}`
              : `${b.title}: ${format(b.amount)}`;
            const labelled = i % every === 0 || b.monthStart;
            return (
              <div
                key={i}
                className={'rp-col' + (b.monthStart ? ' month-start' : '')}
                title={title}
                data-testid="report-bar"
              >
                <div className="rp-plot" style={{ height: PLOT_H }}>
                  {ghost && <span className="rp-ghost" style={{ height: px(ghost.amount) }} data-testid="report-ghost" />}
                  <span
                    className={'rp-bar' + (b.weekend ? ' weekend' : '')}
                    style={{ height: b.amount > 0 ? Math.max(1, px(b.amount)) : 0 }}
                  />
                </div>
                <span className="rp-x">{labelled ? (b.monthStart ? `${monthOf(b.title)} ${b.label}` : b.label) : ''}</span>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

/** "Oct" from a daily bucket's "Oct 1, 2026" title. */
const monthOf = (title: string) => title.slice(0, 3);
