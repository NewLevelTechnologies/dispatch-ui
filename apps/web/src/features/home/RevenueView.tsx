import type { ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  agreementApi,
  financialDashboardApi,
  type AgreementOverviewResponse,
  type FinancialDashboardQuotes,
  type FinancialDashboardReceivables,
  type FinancialDashboardRevenue,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { KPI } from '../../components/ui/KPI';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { TechProductivityCard } from './TechProductivityCard';
import { agingBuckets, cumulative, money, percentChange, revenueWeeks } from './revenueSelectors';

const DASH = '—';

/**
 * Month to date. Each card calls the service that owns its numbers and loads
 * on its own. There is no revenue target anywhere in the platform, so no
 * "of target" meta and no target rule.
 */
export function RevenueView() {
  const revenue = useQuery({
    queryKey: ['financial-dashboard', 'revenue'],
    queryFn: () => financialDashboardApi.getRevenue(),
  });
  const receivables = useQuery({
    queryKey: ['financial-dashboard', 'receivables'],
    queryFn: () => financialDashboardApi.getReceivables(),
  });
  const quotes = useQuery({
    queryKey: ['financial-dashboard', 'quotes'],
    queryFn: () => financialDashboardApi.getQuotes(),
  });
  // Same key as the attention row, so switching tabs is a cache hit.
  const agreements = useQuery({
    queryKey: ['agreements', 'overview'],
    queryFn: () => agreementApi.getOverview(),
  });

  return (
    <div className="home-view">
      <RevenueKpis
        revenue={revenue.data}
        receivables={receivables.data}
        quotes={quotes.data}
        agreements={agreements.data}
      />
      <div className="home-2col">
        <RevenueByWeekCard query={revenue} />
        <ReceivablesCard query={receivables} />
      </div>
      <TechProductivityCard revenue={revenue} />
      <div className="home-2col even">
        <QuotesCard query={quotes} />
        <AgreementsCard query={agreements} />
      </div>
    </div>
  );
}

function RevenueKpis({
  revenue,
  receivables,
  quotes,
  agreements,
}: {
  revenue?: FinancialDashboardRevenue;
  receivables?: FinancialDashboardReceivables;
  quotes?: FinancialDashboardQuotes;
  agreements?: AgreementOverviewResponse;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const plural = (code: string, count: number) => (count === 1 ? getName(code) : getName(code, true));

  const change = revenue ? percentChange(revenue.billed, revenue.billedPreviousPeriod) : null;
  const collectedPct = revenue && revenue.billed > 0 ? Math.round((revenue.collected / revenue.billed) * 100) : null;
  const overdue = receivables?.overdue;

  return (
    <div className="home-kpis five">
      <KPI
        label={t('dashboard.revenue.kpis.revenueMtd')}
        value={revenue ? money(revenue.billed) : DASH}
        delta={change != null && change !== 0 ? `${Math.abs(change)}%` : undefined}
        deltaDir={change != null && change < 0 ? 'down' : 'up'}
        meta={revenue ? t('dashboard.revenue.kpis.vsLastMonth') : undefined}
        bar="var(--success-500)"
        spark={revenue ? cumulative(revenue.billedByDay) : undefined}
      />
      <KPI
        label={t('dashboard.revenue.kpis.collectedMtd')}
        value={revenue ? money(revenue.collected) : DASH}
        meta={collectedPct != null ? t('dashboard.revenue.kpis.collectedPct', { pct: collectedPct }) : undefined}
        bar="var(--accent-500)"
      />
      <KPI
        label={t('dashboard.revenue.kpis.outstandingAr')}
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
  action,
  query,
  children,
}: {
  title: string;
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
        <CardTitle>{title}</CardTitle>
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

function RevenueByWeekCard({ query }: { query: UseQueryResult<FinancialDashboardRevenue> }) {
  const { t } = useTranslation();
  return (
    <QueryCard title={t('dashboard.revenue.byWeek.title')} query={query}>
      {(r) => {
        const weeks = revenueWeeks(r.billedByDay, r.asOf);
        const max = Math.max(0, ...weeks.map((w) => w.amount));
        if (max === 0) return <EmptyState compact title={t('dashboard.revenue.byWeek.empty')} />;
        return (
          <div className="home-chart" style={{ height: CHART_H + 26 }}>
            {weeks.map((w) => {
              const h = Math.round((w.amount / max) * (CHART_H - LABEL_H));
              return (
                <div key={w.label} className="home-chart-col" data-testid="revenue-week">
                  <div className="home-chart-plot" style={{ height: CHART_H }}>
                    <span className="home-chart-val" style={{ bottom: h + 4 }}>
                      {money(w.amount, { compact: true })}
                    </span>
                    <span className={`home-chart-bar${w.partial ? ' partial' : ''}`} style={{ height: h }} />
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

function ReceivablesCard({ query }: { query: UseQueryResult<FinancialDashboardReceivables> }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <QueryCard
      title={t('dashboard.revenue.aging.title')}
      query={query}
      action={
        <Button plain size="xxs" href="/invoices">
          {getName('invoice', true)}
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

function QuotesCard({ query }: { query: UseQueryResult<FinancialDashboardQuotes> }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const quotes = getName('quote', true);
  return (
    <QueryCard
      title={t('dashboard.revenue.quotes.title', { entities: quotes })}
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

function AgreementsCard({ query }: { query: UseQueryResult<AgreementOverviewResponse> }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <QueryCard title={getName('agreement', true)} query={query}>
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
                  {a.renewingSoon.count}{' '}
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
