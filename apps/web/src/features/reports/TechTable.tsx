// The Tech productivity report's table: Home's scorecard over the range, with
// each tech's weekly trend and, when compared, their revenue in the other
// window. Rows open the same drill-in as Home.
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon, ReceiptPercentIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import type { TechnicianProductivityResponse } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Avatar } from '../../components/ui/Avatar';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { CellStack, CellSub, CellTop, DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { callbacksCoverage, excludedParts, hours, longDate, money, unattributedAmount } from '../home/revenueSelectors';
import { changePct, formatPct } from './revenueModel';
import { trendBars, type TrendBar } from './techModel';

const DASH = '—';
const LOW_FIRST_VISIT = 0.8;
const MANY_CALLBACKS = 3;
const TREND_H = 22;

function Change({ current, previous }: { current: number; previous: number | null | undefined }) {
  const pct = changePct(current, previous ?? null);
  if (pct == null) return <span className="text-fg-muted">{DASH}</span>;
  return <span className={clsx('rp-change', pct >= 0 ? 'up' : 'down')}>{formatPct(pct)}</span>;
}

/** One tech's bars on the table's shared scale, so heights compare across rows. */
function Trend({ bars, max }: { bars: TrendBar[]; max: number }) {
  const { t } = useTranslation();
  if (bars.length < 2) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <span className="tp-trend" style={{ height: TREND_H }} aria-hidden data-testid="tech-trend">
      {bars.map((b, i) => (
        <span
          key={i}
          title={t('reports.techs.table.trendBar', { window: b.title, revenue: money(b.revenue), count: b.jobs })}
          style={{ height: b.revenue > 0 ? Math.max(1, Math.round((b.revenue / max) * TREND_H)) : 0 }}
        />
      ))}
    </span>
  );
}

export function TechTable({
  data,
  comparisonLabel,
  nameOf,
  onOpen,
}: {
  data: TechnicianProductivityResponse;
  /** "Sep 2025"; null with no comparison. */
  comparisonLabel: string | null;
  nameOf: (name: string | null) => string;
  onOpen: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const words = {
    agreement: getName('agreement'),
    invoice: getName('invoice'),
    invoices: getName('invoice', true),
    tech: getName('technician'),
    techs: getName('technician', true),
    workOrder: getName('work_order'),
    workOrders: getName('work_order', true),
  };
  const hasCmp = data.comparison != null;
  const callbacks = callbacksCoverage(data.periodStart, data.asOf, data.callbacksTrackedSince);
  const trends = data.technicians.map((r) => trendBars(r.weekly, data.asOf));
  const trendMax = Math.max(1, ...trends.flat().map((b) => b.revenue));
  const showTrend = trends.some((b) => b.length >= 2);
  const maxPerHour = Math.max(0, ...data.technicians.map((r) => r.revenuePerInvoicedHour ?? 0));
  const unattributed = unattributedAmount(data);
  // Columns after Revenue (and its comparison), for the unattributed and total rows.
  const tailCols = 6;

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.techs.table.title', words)}</CardTitle>
        <CardSub>{t('reports.techs.table.hint', words)}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table home-techs">
            <DenseTHead>
              <tr>
                <th>{getName('technician')}</th>
                {showTrend && <th>{t('reports.techs.table.trend')}</th>}
                <th className="right">{t('dashboard.revenue.techs.jobs')}</th>
                <th className="right">{t('dashboard.revenue.techs.revenue')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
                <th className="right rp-opt">{t('dashboard.revenue.techs.avgTicket')}</th>
                <th className="right">{t('dashboard.revenue.techs.onSite')}</th>
                <th>{t('dashboard.revenue.techs.perHour')}</th>
                <th className="right">{t('dashboard.revenue.techs.firstVisit')}</th>
                <th className="right">
                  {callbacks === 'partial' && data.callbacksTrackedSince
                    ? t('dashboard.revenue.techs.callbacksSince', { date: longDate(data.callbacksTrackedSince) })
                    : t('dashboard.revenue.techs.callbacks')}
                </th>
                <th aria-hidden />
              </tr>
            </DenseTHead>
            <tbody>
              {data.technicians.map((r, i) => {
                const name = nameOf(r.name);
                const parts = excludedParts(r.excludedHours);
                const rate = r.firstVisit.rate;
                return (
                  <DenseRow key={r.userId} onClick={() => onOpen(r.userId)} data-testid="tech-row">
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={name} size="sm" />
                        <span className="strong">{name}</span>
                      </div>
                    </td>
                    {showTrend && (
                      <td data-label={t('reports.techs.table.trend')}>
                        <Trend bars={trends[i]} max={trendMax} />
                      </td>
                    )}
                    <td className="right num" data-label={t('dashboard.revenue.techs.jobs')}>
                      {r.jobs}
                    </td>
                    <td className="right num strong" data-label={t('dashboard.revenue.techs.revenue')}>
                      {money(r.revenue)}
                    </td>
                    {hasCmp && (
                      <td className="right num muted-cell" data-label={comparisonLabel ?? ''}>
                        {r.comparison ? money(r.comparison.revenue) : DASH}
                      </td>
                    )}
                    {hasCmp && (
                      <td className="right num" data-label={t('reports.revenue.table.change')}>
                        <Change current={r.revenue} previous={r.comparison?.revenue} />
                      </td>
                    )}
                    <td className="right num rp-opt" data-label={t('dashboard.revenue.techs.avgTicket')}>
                      {r.averageTicket != null ? money(r.averageTicket) : DASH}
                    </td>
                    <td className="right num" data-label={t('dashboard.revenue.techs.onSite')}>
                      <CellStack>
                        <span>{hours(r.onSiteHours)}</span>
                        {parts.length > 0 && (
                          <span
                            className="muted rp-opt whitespace-nowrap"
                            title={`${t('dashboard.revenue.techs.excludedHint')} ${parts
                              .map((x) =>
                                t(`dashboard.revenue.techs.excludedLong.${x.key}`, { ...words, hours: hours(x.hours) }),
                              )
                              .join(', ')}`}
                          >
                            {parts
                              .map((x) => t(`dashboard.revenue.techs.excluded.${x.key}`, { ...words, hours: hours(x.hours) }))
                              .join(' · ')}
                          </span>
                        )}
                      </CellStack>
                    </td>
                    <td data-label={t('dashboard.revenue.techs.perHour')}>
                      {r.revenuePerInvoicedHour != null ? (
                        <div className="flex items-center gap-2">
                          <span className="home-prog rp-opt w-[70px] shrink-0">
                            <span
                              style={{
                                width: `${maxPerHour > 0 ? Math.round((r.revenuePerInvoicedHour / maxPerHour) * 100) : 0}%`,
                                background: 'var(--accent-500)',
                              }}
                            />
                          </span>
                          <span className="num strong">{money(r.revenuePerInvoicedHour)}</span>
                        </div>
                      ) : (
                        DASH
                      )}
                    </td>
                    <td
                      className={`right num${rate != null && rate < LOW_FIRST_VISIT ? ' home-warn' : ''}`}
                      data-label={t('dashboard.revenue.techs.firstVisit')}
                    >
                      {rate != null ? `${Math.round(rate * 100)}%` : DASH}
                    </td>
                    <td
                      className={`right num${callbacks !== 'none' && r.callbacks >= MANY_CALLBACKS ? ' home-danger' : ''}`}
                      data-label={t('dashboard.revenue.techs.callbacks')}
                    >
                      {callbacks === 'none' ? DASH : r.callbacks}
                    </td>
                    <td className="home-chev">
                      <ChevronRightIcon className="size-3" />
                    </td>
                  </DenseRow>
                );
              })}
              {unattributed > 0 && (
                <DenseRow className="home-unattr" data-testid="unattributed-row">
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="home-unattr-ico">
                        <ReceiptPercentIcon className="size-3" />
                      </span>
                      <CellStack>
                        <CellTop>{t('dashboard.revenue.techs.unattributed')}</CellTop>
                        <CellSub>
                          {t('dashboard.revenue.techs.unattributedSub', {
                            noWorkOrder: money(data.unattributed.noWorkOrder.amount),
                            noTechArrived: money(data.unattributed.noTechArrived.amount),
                            ...words,
                          })}
                        </CellSub>
                      </CellStack>
                    </div>
                  </td>
                  {showTrend && <td />}
                  <td className="right num muted">
                    {data.unattributed.noWorkOrder.count + data.unattributed.noTechArrived.count}
                  </td>
                  <td className="right num strong">{money(unattributed)}</td>
                  {hasCmp && <td colSpan={2} />}
                  <td colSpan={tailCols} />
                </DenseRow>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('dashboard.revenue.techs.total')}</td>
                {showTrend && <td />}
                <td />
                <td className="right num strong">{money(data.totalRevenue)}</td>
                {hasCmp && <td className="right num muted-cell">{money(data.comparison!.totalRevenue)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Change current={data.totalRevenue} previous={data.comparison!.totalRevenue} />
                  </td>
                )}
                <td colSpan={tailCols} />
              </tr>
            </tfoot>
          </DenseTable>
        </div>
        <div className="home-card-note">{t('dashboard.revenue.techs.foot', words)}</div>
      </CardBody>
    </Card>
  );
}
