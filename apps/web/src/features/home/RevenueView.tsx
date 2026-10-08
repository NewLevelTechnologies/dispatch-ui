import type { ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from '@dispatch/i18n';
import {
  agreementApi,
  financialDashboardApi,
  revenueTargetsApi,
  type AgreementOverviewResponse,
  type FinancialDashboardQuotes,
  type FinancialDashboardReceivables,
  type FinancialDashboardRevenue,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { KPI } from '../../components/ui/KPI';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { TechProductivityCard } from './TechProductivityCard';
import { agingBuckets, cumulative, money, percentChange, revenueWeeks } from './revenueSelectors';
import { comparisonLabel, periodName, revenueMonths, toDateSuffix, type Period } from './period';
import {
  hitCount,
  periodTarget,
  targetAmounts,
  weekTarget,
  type MonthAmounts,
} from '../revenueTargets/targetModel';

const DASH = '—';

/** What the period-following figures and cards need to label themselves. */
export interface PeriodContext {
  period: Period;
  /** The period contains today ("to date"). */
  isCurrent: boolean;
  /** What to send the backend; undefined for the current month (its default). */
  apiPeriod: string | undefined;
  /** "Revenue MTD" in a current period, "Revenue" in a past one. */
  revenueLabel: string;
  /** The scope chip's regions; undefined = the whole company. */
  regionIds: string[] | undefined;
}

/**
 * One reporting period (default: this month to date). Revenue, Collected, the
 * chart and Tech productivity follow it; receivables, quotes and agreements
 * are current-only on the backend, so in a past period they say "As of
 * today" rather than pretending to be historical. Each card calls the service
 * that owns its numbers and loads on its own, all in the scope chip's
 * regions. Targets are company-wide and monthly: they show only when the
 * revenue covers the whole company, the period's months come from one year
 * (no period crosses one), and a month without a target draws no rule and
 * scores nothing.
 */
export function RevenueView({
  period,
  isCurrent,
  regionIds,
}: {
  period: Period;
  isCurrent: boolean;
  regionIds: string[] | undefined;
}) {
  const { t } = useTranslation();
  const apiPeriod = period.kind === 'month' && isCurrent ? undefined : period.id;
  const ctx: PeriodContext = {
    period,
    isCurrent,
    apiPeriod,
    revenueLabel: isCurrent
      ? t('dashboard.revenue.kpis.revenueToDate', { suffix: toDateSuffix(period) })
      : t('dashboard.revenue.kpis.revenue'),
    regionIds,
  };
  const asOfTag = isCurrent ? undefined : t('dashboard.revenue.asOfToday');
  const revenue = useQuery({
    // The unscoped key matches the targets setting's actuals read.
    queryKey: ['financial-dashboard', 'revenue', apiPeriod ?? 'current', ...(regionIds ? [regionIds] : [])],
    queryFn: () => financialDashboardApi.getRevenue({ period: apiPeriod, regionIds }),
  });
  const receivables = useQuery({
    queryKey: ['financial-dashboard', 'receivables', regionIds],
    queryFn: () => financialDashboardApi.getReceivables({ regionIds }),
  });
  const quotes = useQuery({
    queryKey: ['financial-dashboard', 'quotes', regionIds],
    queryFn: () => financialDashboardApi.getQuotes({ regionIds }),
  });
  // Same key as the attention row, so switching tabs is a cache hit.
  const agreements = useQuery({
    queryKey: ['agreements', 'overview', regionIds],
    queryFn: () => agreementApi.getOverview({ regionIds }),
  });
  // A failed or slow read just means no target line; the chart never waits on it.
  const targets = useQuery({
    queryKey: ['revenue-targets', period.year],
    queryFn: () => revenueTargetsApi.get(period.year),
    enabled: !regionIds,
  });
  // Targets are company-wide, so they apply only to whole-company revenue. The
  // response says what it covers: a user held to their own regions gets a
  // regional answer even with no chip set.
  const wholeCompany = revenue.data ? revenue.data.regionIds == null : !regionIds;
  const targetMonths = targets.data && wholeCompany ? targetAmounts(targets.data) : undefined;

  return (
    <div className="home-view">
      <RevenueKpis
        ctx={ctx}
        asOfTag={asOfTag}
        revenue={revenue.data}
        targets={targetMonths}
        receivables={receivables.data}
        quotes={quotes.data}
        agreements={agreements.data}
      />
      <div className="home-2col">
        <RevenueChartCard
          query={revenue}
          period={period}
          targets={targetMonths}
          reportHref={`/reports/revenue?${new URLSearchParams({
            range: period.id,
            from: 'home',
            ...(regionIds ? { region: regionIds[0] } : {}),
          }).toString()}`}
        />
        <ReceivablesCard
          query={receivables}
          tag={asOfTag}
          reportHref={`/reports/receivables?${new URLSearchParams({
            asOf: 'today',
            from: 'home',
            ...(regionIds ? { region: regionIds[0] } : {}),
          }).toString()}`}
        />
      </div>
      <TechProductivityCard revenue={revenue} ctx={ctx} />
      <div className="home-2col even">
        <QuotesCard query={quotes} tag={asOfTag} />
        <AgreementsCard query={agreements} tag={asOfTag} regionIds={regionIds} />
      </div>
    </div>
  );
}

function RevenueKpis({
  ctx,
  asOfTag,
  revenue,
  targets,
  receivables,
  quotes,
  agreements,
}: {
  ctx: PeriodContext;
  asOfTag: string | undefined;
  revenue?: FinancialDashboardRevenue;
  targets?: MonthAmounts;
  receivables?: FinancialDashboardReceivables;
  quotes?: FinancialDashboardQuotes;
  agreements?: AgreementOverviewResponse;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const plural = (code: string, count: number) => (count === 1 ? getName(code) : getName(code, true));

  // The delta is against whatever the backend says it's comparing to
  // (last year first, for seasonality); no basis → no delta, said plainly.
  // `comparison` is optional-chained so a backend without the period change
  // degrades to "no comparison" instead of taking the tab down.
  const comparison = revenue?.comparison;
  const vs = revenue ? comparisonLabel(ctx.period, comparison?.basis ?? null) : null;
  const change =
    revenue && vs && comparison?.billed != null ? percentChange(revenue.billed, comparison.billed) : null;
  const collectedPct = revenue && revenue.billed > 0 ? Math.round((revenue.collected / revenue.billed) * 100) : null;
  const overdue = receivables?.overdue;
  // The whole period's target beside the figure; the meta stays the delta's
  // label, so the % never reads as "% of target".
  const target = revenue && targets ? periodTarget(revenue.periodStart, revenue.periodEnd, targets) : null;

  return (
    <div className="home-kpis five">
      <KPI
        label={ctx.revenueLabel}
        value={revenue ? money(revenue.billed) : DASH}
        sub={
          target != null
            ? t('dashboard.revenue.kpis.ofTarget', { amount: money(target, { compact: true }) })
            : undefined
        }
        delta={change != null && change !== 0 ? `${Math.abs(change)}%` : undefined}
        deltaDir={change != null && change < 0 ? 'down' : 'up'}
        meta={
          revenue
            ? vs
              ? t(vs.kind === 'sameDays' ? 'dashboard.revenue.kpis.vsSameDays' : 'dashboard.revenue.kpis.vs', {
                  label: vs.label,
                })
              : t('dashboard.revenue.kpis.noComparison')
            : undefined
        }
        bar="var(--success-500)"
        spark={revenue ? cumulative(revenue.billedByDay) : undefined}
      />
      <KPI
        label={
          ctx.isCurrent
            ? t('dashboard.revenue.kpis.collectedToDate', { suffix: toDateSuffix(ctx.period) })
            : t('dashboard.revenue.kpis.collected')
        }
        value={revenue ? money(revenue.collected) : DASH}
        meta={collectedPct != null ? t('dashboard.revenue.kpis.collectedPct', { pct: collectedPct }) : undefined}
        bar="var(--accent-500)"
      />
      <KPI
        label={t('dashboard.revenue.kpis.outstandingAr')}
        tag={asOfTag}
        value={receivables ? money(receivables.outstanding) : DASH}
        delta={
          overdue && overdue.amount > 0
            ? t('dashboard.revenue.kpis.overdueDelta', { amount: money(overdue.amount, { compact: true }) })
            : undefined
        }
        deltaDir="down"
        meta={
          overdue && overdue.count > 0
            ? t('dashboard.revenue.kpis.pastDue', { count: overdue.count, entities: plural('invoice', overdue.count) })
            : undefined
        }
        bar="var(--warning-500)"
      />
      <KPI
        label={t('dashboard.revenue.kpis.openQuotes', { entities: getName('quote', true) })}
        tag={asOfTag}
        value={quotes ? money(quotes.openAmount) : DASH}
        meta={
          quotes
            ? quotes.winRate != null
              ? t('dashboard.revenue.kpis.openQuotesMeta', {
                  count: quotes.openCount,
                  entities: plural('quote', quotes.openCount),
                  rate: Math.round(quotes.winRate * 100),
                })
              : t('dashboard.revenue.kpis.openQuotesCount', {
                  count: quotes.openCount,
                  entities: plural('quote', quotes.openCount),
                })
            : undefined
        }
        bar="var(--info-500)"
      />
      <KPI
        label={t('dashboard.revenue.kpis.agreementRevenue', { entity: getName('agreement') })}
        tag={asOfTag}
        value={agreements ? money(agreements.recurringMonthly) : DASH}
        sub={agreements ? t('dashboard.revenue.kpis.perMonth') : undefined}
        meta={
          agreements
            ? t('dashboard.revenue.kpis.active', {
                count: agreements.activeAgreementCount,
                entities: plural('agreement', agreements.activeAgreementCount),
              })
            : undefined
        }
        bar="var(--violet-500)"
      />
    </div>
  );
}

/** Loading / error / body for one card, so every card fails on its own. */
function QueryCard<T>({
  title,
  tag,
  pill,
  action,
  query,
  children,
}: {
  title: string;
  /** "As of today" on a current-only card while a past period is selected. */
  tag?: string;
  /** Beside the title, e.g. the chart's "N of M weeks hit target". */
  pill?: ReactNode;
  action?: ReactNode;
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  let body: ReactNode;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || query.data === undefined)
    body = (
      <ErrorState
        title={t('dashboard.revenue.error')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else body = children(query.data);
  return (
    <Card>
      <CardHead>
        <CardTitle>
          {title}
          {tag && <span className="tag-tiny">{tag}</span>}
          {pill}
        </CardTitle>
        {action}
      </CardHead>
      <CardBody>{body}</CardBody>
    </Card>
  );
}

const CHART_H = 150;
// Headroom inside the plot for the value label above the tallest bar, so the
// label never rides up into the card's padding.
const LABEL_H = 18;

interface ChartBar {
  label: string;
  amount: number;
  partial: boolean;
  target: number | null;
}

/**
 * Weeks from the 1st for a month; calendar months for a quarter or year. The
 * partial "so far" bar only exists in a period that's still running. A week's
 * target is its month's, prorated by days.
 */
function chartBars(r: FinancialDashboardRevenue, byWeek: boolean, targets: MonthAmounts | undefined): ChartBar[] {
  if (byWeek) {
    const monthAmount = targets?.[Number(r.asOf.slice(5, 7)) - 1] ?? null;
    return revenueWeeks(r.billedByDay, r.asOf).map((w, i) => ({
      ...w,
      partial: w.partial && r.isCurrent,
      target: weekTarget(i, r.asOf, monthAmount),
    }));
  }
  return revenueMonths(r.billedByDay, r.asOf, r.isCurrent).map((m) => ({
    label: m.label,
    amount: m.amount,
    partial: m.partial,
    target: targets?.[m.month - 1] ?? null,
  }));
}

function RevenueChartCard({
  query,
  period,
  targets,
  reportHref,
}: {
  query: UseQueryResult<FinancialDashboardRevenue>;
  period: Period;
  /** Undefined while loading or when the read failed: no target line. */
  targets: MonthAmounts | undefined;
  /** The Revenue report for this period and scope. */
  reportHref: string;
}) {
  const { t } = useTranslation();
  const canManage = useHasCapability('MANAGE_REVENUE_TARGETS');
  const byWeek = period.kind === 'month';
  const bars = query.data ? chartBars(query.data, byWeek, targets) : [];
  const hasTarget = bars.some((b) => b.target != null);
  const score = hitCount(bars);

  let action: ReactNode = null;
  if (hasTarget)
    action = (
      <span className="home-chart-legend">
        <span>
          <span className="home-chart-key bar" />
          {t('dashboard.revenue.chart.invoiced')}
        </span>
        <span>
          <span className="home-chart-key rule" />
          {t('dashboard.revenue.chart.target')}
        </span>
      </span>
    );
  else if (canManage && targets && query.data)
    action = (
      <Button plain size="xxs" href={`/settings/revenue-targets?year=${period.year}`}>
        {t('dashboard.revenue.chart.setTargets')}
      </Button>
    );

  return (
    <QueryCard
      title={t(byWeek ? 'dashboard.revenue.byWeek.title' : 'dashboard.revenue.byMonth.title')}
      pill={
        score.of > 0 && (
          <Pill tone="neutral">
            {t(byWeek ? 'dashboard.revenue.chart.weeksHit' : 'dashboard.revenue.chart.monthsHit', {
              hit: score.hit,
              count: score.of,
            })}
          </Pill>
        )
      }
      action={
        <span className="home-chart-actions">
          {action}
          <Button plain size="xxs" href={reportHref}>
            {t('dashboard.revenue.chart.report')}
          </Button>
        </span>
      }
      query={query}
    >
      {() => {
        const max = Math.max(0, ...bars.map((w) => Math.max(w.amount, w.target ?? 0)));
        if (max === 0)
          return (
            <EmptyState
              compact
              title={t('dashboard.revenue.byWeek.empty', { period: periodName(period) })}
            />
          );
        const px = (n: number) => Math.round((n / max) * (CHART_H - LABEL_H));
        return (
          <div className={`home-chart${bars.length > 6 ? ' dense' : ''}`} style={{ height: CHART_H + 26 }}>
            {bars.map((w) => {
              const h = px(w.amount);
              const th = w.target != null ? px(w.target) : null;
              const hit = w.target != null && w.amount >= w.target;
              // Once any bar has a target, green means "hit": the rest take the
              // tint, including bars whose month has no target.
              const tone = hasTarget ? (hit ? ' hit' : ' missed') : '';
              return (
                <div key={w.label} className="home-chart-col" data-testid="revenue-week">
                  <div className="home-chart-plot" style={{ height: CHART_H }}>
                    <span className={`home-chart-val${hit ? ' hit' : ''}`} style={{ bottom: Math.max(h, th ?? 0) + 4 }}>
                      {money(w.amount, { compact: true })}
                    </span>
                    {th != null && <span className="home-chart-target" style={{ bottom: th }} data-testid="revenue-target-rule" />}
                    <span className={`home-chart-bar${w.partial ? ' partial' : tone}`} style={{ height: h }} />
                  </div>
                  <span className="home-chart-label">
                    {w.label}
                    {w.partial && <span className="home-chart-sofar"> · {t('dashboard.revenue.byWeek.soFar')}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }}
    </QueryCard>
  );
}

function ReceivablesCard({
  query,
  tag,
  reportHref,
}: {
  query: UseQueryResult<FinancialDashboardReceivables>;
  tag?: string;
  /** The Receivables report as of today, in the same scope: every open invoice by bucket. */
  reportHref: string;
}) {
  const { t } = useTranslation();
  return (
    <QueryCard
      title={t('dashboard.revenue.aging.title')}
      tag={tag}
      query={query}
      action={
        <Button plain size="xxs" href={reportHref}>
          {t('dashboard.revenue.aging.report')}
        </Button>
      }
    >
      {(r) => {
        const buckets = agingBuckets(r);
        const total = buckets.reduce((sum, b) => sum + b.amount, 0);
        return (
          <div className="flex flex-col gap-2.5">
            {buckets.map((b) => {
              const pct = total > 0 ? Math.round((b.amount / total) * 100) : 0;
              return (
                <div key={b.id} className="flex flex-col gap-1" data-testid={`aging-${b.id}`}>
                  <div className="home-split">
                    <span className="home-row-label">{t(`dashboard.revenue.aging.${b.id}`)}</span>
                    <span className="home-row-value">
                      {money(b.amount)} <span className="home-row-muted">· {pct}%</span>
                    </span>
                  </div>
                  <span className="home-prog tall">
                    <span style={{ width: `${pct}%`, background: `var(--${b.tone}-500)` }} />
                  </span>
                </div>
              );
            })}
            <div className="home-split home-foot-rule">
              <span className="home-att-meta">{t('dashboard.revenue.aging.avgDaysToPay')}</span>
              <span className="home-row-value">
                {r.averageDaysToPay != null ? t('dashboard.revenue.aging.days', { count: r.averageDaysToPay }) : DASH}
              </span>
            </div>
          </div>
        );
      }}
    </QueryCard>
  );
}

const FUNNEL = [
  { id: 'sent', color: 'var(--info-500)' },
  { id: 'viewed', color: 'var(--info-500)' },
  { id: 'accepted', color: 'var(--success-500)' },
  { id: 'declined', color: 'var(--border-strong)' },
] as const;

function QuotesCard({ query, tag }: { query: UseQueryResult<FinancialDashboardQuotes>; tag?: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const quotes = getName('quote', true);
  return (
    <QueryCard
      title={t('dashboard.revenue.quotes.title', { entities: quotes })}
      tag={tag}
      query={query}
      action={
        <Button plain size="xxs" href="/quotes">
          {t('dashboard.revenue.quotes.all', { entities: quotes })}
        </Button>
      }
    >
      {(q) => (
        <div className="flex flex-col gap-2">
          {FUNNEL.map((row) => {
            const bucket = q[row.id];
            const pct = q.sent.count > 0 ? Math.round((bucket.count / q.sent.count) * 100) : 0;
            return (
              <div key={row.id} className="home-funnel-row" data-testid={`funnel-${row.id}`}>
                <span className="home-row-label">{t(`dashboard.revenue.quotes.${row.id}`)}</span>
                <span className="home-prog tall">
                  <span style={{ width: `${pct}%`, background: row.color }} />
                </span>
                <span className="home-row-value text-right">{bucket.count}</span>
                <span className="home-row-muted text-right">{money(bucket.amount, { compact: true })}</span>
              </div>
            );
          })}
          {/* Decision times are only recorded from the backend deploy on, so
              this is null until a quote has been decided since then. */}
          {q.averageDaysToDecision != null && (
            <div className="home-split home-foot-rule">
              <span className="home-att-meta">{t('dashboard.revenue.quotes.avgDecision')}</span>
              <span className="home-row-value">
                {t('dashboard.revenue.aging.days', { count: q.averageDaysToDecision })}
              </span>
            </div>
          )}
        </div>
      )}
    </QueryCard>
  );
}

function AgreementsCard({
  query,
  tag,
  regionIds,
}: {
  query: UseQueryResult<AgreementOverviewResponse>;
  tag?: string;
  regionIds: string[] | undefined;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  // The Agreements page under the same rules and scope, so its totals are these.
  const href = (extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ ...extra, ...(regionIds?.length ? { region: regionIds[0] } : {}) }).toString();
    return qs ? `/agreements?${qs}` : '/agreements';
  };
  return (
    <QueryCard
      title={getName('agreement', true)}
      tag={tag}
      query={query}
      action={
        <Button plain size="xxs" href={href()}>
          {t('dashboard.revenue.agreements.all', { entities: getName('agreement', true) })}
        </Button>
      }
    >
      {(a) => {
        const v = a.visitsThisMonth;
        const pct = v.planned > 0 ? Math.round((v.completed / v.planned) * 100) : 0;
        const remaining = Math.max(0, v.planned - v.completed - v.missed);
        return (
          <>
            <div className="home-stat-grid">
              <div>
                <div className="label-tiny">{t('dashboard.revenue.agreements.recurring')}</div>
                <div className="home-stat">{money(a.recurringMonthly)}</div>
              </div>
              <div>
                <div className="label-tiny">{t('dashboard.revenue.agreements.active')}</div>
                <div className="home-stat">{a.activeAgreementCount}</div>
              </div>
              <div>
                <div className="label-tiny">
                  {t('dashboard.revenue.agreements.renewing', { days: a.renewingSoon.withinDays })}
                </div>
                <div className="home-stat">
                  {a.renewingSoon.count > 0 ? (
                    <Link
                      to={href({ renewing: String(a.renewingSoon.withinDays) })}
                      className="hover:underline"
                      data-testid="agreements-renewing"
                    >
                      {a.renewingSoon.count}
                    </Link>
                  ) : (
                    a.renewingSoon.count
                  )}{' '}
                  <span className="home-row-muted">
                    · {t('dashboard.revenue.agreements.perMonthValue', { amount: money(a.renewingSoon.monthlyValue, { compact: true }) })}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex flex-col gap-1.5" data-testid="agreement-visits">
              <div className="home-split">
                <span className="home-row-label">{t('dashboard.revenue.agreements.planned')}</span>
                <span className="home-row-value">
                  {v.completed}{' '}
                  <span className="home-row-muted">{t('dashboard.kpis.of', { count: v.planned })}</span>
                </span>
              </div>
              <span className="home-prog tall">
                <span style={{ width: `${pct}%`, background: 'var(--violet-500)' }} />
              </span>
              <span className="home-att-meta">
                {t('dashboard.revenue.agreements.remaining', { remaining, unscheduled: v.unscheduled })}
              </span>
            </div>
          </>
        );
      }}
    </QueryCard>
  );
}
