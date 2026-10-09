// Reports → Payments received. Received payments over any range, compared and
// scoped, by method, payer or day (the deposit view, each day split by method),
// for bank reconciliation. `received` is the Revenue report's `collected` for
// the same range and scope, split. Every row opens the Payments list on the
// same payments. State lives in the URL (`range`, `compare`, `region`, `group`).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import {
  paymentReportApi,
  paymentsApi,
  type Payment,
  type PaymentMethod,
  type PaymentReport,
  type PaymentReportGroupBy,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { PAYMENT_METHOD_KEY } from '../lib/paymentMethods';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { money } from '../features/home/revenueSelectors';
import { periodName } from '../features/home/period';
import { RevenueChart } from '../features/reports/RevenueChart';
import { csvLines, downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';
import {
  buckets,
  changePct,
  chartUnit,
  formatPct,
  formatSpan,
  ghostWindow,
  rangeName,
  windowName,
} from '../features/reports/revenueModel';

const GROUP_BYS: PaymentReportGroupBy[] = ['method', 'payer', 'day', 'none'];
const DEFAULT_GROUP: PaymentReportGroupBy = 'method';
const DASH = '—';
const EXPORT_PAGE = 200;

/** The Payments list on a slice of the report: received payments, its dates and scope. */
function paymentsHref(from: string, to: string, scope: string[] | undefined, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams({
    from,
    to,
    status: 'RECEIVED',
    ...(scope?.length ? { region: scope[0] } : {}),
    ...extra,
  });
  return `/payments?${qs.toString()}`;
}

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function PaymentsReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange();
  const { range, compare, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as PaymentReportGroupBy | null;
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) ? groupRaw : DEFAULT_GROUP;

  const query = useQuery({
    queryKey: ['payment-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () => paymentReportApi.get({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = query.data;

  const days = report?.receivedByDay.map((d) => ({ date: d.date, amount: d.amount })) ?? [];
  const unit = chartUnit(days.length);
  const ghost = report ? ghostWindow(report, unit) : null;
  const ghostQuery = useQuery({
    queryKey: ['payment-report', ghost?.from, ghost?.to, 'none', 'none', scope],
    queryFn: () => paymentReportApi.get({ from: ghost!.from, to: ghost!.to, compare: 'none', groupBy: 'none', regionIds: scope }),
    enabled: !!ghost,
  });

  const payments = getName('payment', true);
  const methodName = (m: string) => t(`payments.methods.${PAYMENT_METHOD_KEY[m as PaymentMethod] ?? 'other'}`);
  const groupWord = (g: PaymentReportGroupBy) => t(`reports.payments.groupBy.${g}`);
  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.payments.subToDate' : 'reports.payments.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        entities: payments,
      })
    : rangeName(range);

  // Every received payment in the range, from the list the rows open.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: Payment[] = [];
      for (let page = 0; ; page++) {
        const res = await paymentsApi.getAll({
          from: report.from,
          to: report.to,
          status: ['RECEIVED'],
          regionIds: scope,
          sort: 'paymentDate,asc',
          page,
          size: EXPORT_PAGE,
        });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const scoped = !!scope?.length;
      const csv = csvLines([
        [
          t('payments.table.paymentNumber'),
          t('payments.table.paymentDate'),
          t('payments.table.payer'),
          t('payments.table.method'),
          t('payments.table.reference'),
          t('payments.table.appliedTo'),
          t('payments.table.amount'),
          ...(scoped ? [t('reports.payments.csv.inScope')] : []),
          t('payments.table.receivedBy'),
        ],
        ...rows.map((p) => [
          p.paymentNumber,
          p.paymentDate,
          p.payerName,
          methodName(p.paymentMethod),
          p.referenceNumber ?? '',
          p.applications.map((a) => a.invoiceNumber).join(' '),
          p.amount.toFixed(2),
          ...(scoped ? [(p.amountInScope ?? 0).toFixed(2)] : []),
          p.receivedByName ?? '',
        ]),
      ]);
      const file = `payments-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.payments.exported', { file, count: rows.length, entities: payments.toLowerCase() }));
    } catch {
      showError(t('reports.payments.exportFailed', { entities: payments.toLowerCase() }));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.payments.loadFailed', { entities: payments.toLowerCase() })}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const ghosts =
      ghost && ghostQuery.data
        ? buckets(ghostQuery.data.receivedByDay.map((d) => ({ date: d.date, amount: d.amount })), unit)
        : undefined;
    const ghostLabel = ghost
      ? ghost.sameWeekdays
        ? t('reports.revenue.chart.sameWeekdays', { window: comparisonName })
        : comparisonName
      : null;
    body = (
      <>
        <Summary report={report} cmpLine={cmpLine} />
        {report.received.count === 0 && report.voided.count === 0 ? (
          <EmptyState
            title={t('reports.payments.empty.title', { entities: payments.toLowerCase() })}
            description={t('reports.payments.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <>
            <RevenueChart
              unit={unit}
              bars={buckets(days, unit)}
              ghosts={ghosts}
              rangeLabel={range.kind === 'period' ? periodName(range.period) : formatSpan(report.from, report.to)}
              ghostLabel={ghostLabel}
              title={t(`reports.payments.chart.${unit}`)}
            />
            {groupBy === 'day' ? (
              <DaysTable report={report} scope={scope} methodName={methodName} />
            ) : groupBy !== 'none' ? (
              <GroupsTable
                report={report}
                scope={scope}
                groupLabel={groupWord(groupBy)}
                nameOf={(g) => (groupBy === 'method' ? methodName(g.id) : (g.name ?? DASH))}
                filterOf={(id): Record<string, string> => ({ [groupBy === 'method' ? 'method' : 'payer']: id })}
                comparisonLabel={comparisonName}
              />
            ) : null}
          </>
        )}
      </>
    );
  }

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.payments.title', { entities: payments })}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || report.received.count === 0}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} />
        <span className="rp-filters-divider" aria-hidden />
        <FilterChipListbox
          label={t('reports.revenue.filters.groupBy')}
          ariaLabel={t('reports.revenue.filters.groupBy')}
          value={groupBy}
          displayValue={groupWord(groupBy)}
          onChange={(v) => update({ group: v && v !== DEFAULT_GROUP ? v : null })}
        >
          {GROUP_BYS.map((g) => (
            <ChipListboxOption key={g} value={g}>
              {groupWord(g)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      </div>
      <RangeProblem state={state} />
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function Pct({ current, previous }: { current: number; previous: number | null | undefined }) {
  const pct = changePct(current, previous ?? null);
  if (pct == null) return null;
  return <span className={pct >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>;
}

function Summary({ report, cmpLine }: { report: PaymentReport; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  const avg = (b: { amount: number; count: number }) => (b.count > 0 ? b.amount / b.count : 0);
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.payments.summary.received')}
        value={money(report.received.amount)}
        sub={
          <>
            <Pct current={report.received.amount} previous={c?.received.amount} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={getName('payment', true)}
        value={report.received.count.toLocaleString('en-US')}
        sub={
          <>
            <Pct current={report.received.count} previous={c?.received.count} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.payments.summary.average', { entity: getName('payment') })}
        value={money(avg(report.received))}
        sub={
          <>
            <Pct current={avg(report.received)} previous={c ? avg(c.received) : null} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.payments.summary.voided')}
        value={money(report.voided.amount)}
        last
        sub={t('reports.payments.summary.voidedSub', {
          count: report.voided.count,
          entities: getName('payment', report.voided.count !== 1).toLowerCase(),
        })}
      />
    </div>
  );
}

function GroupsTable({
  report,
  scope,
  groupLabel,
  nameOf,
  filterOf,
  comparisonLabel,
}: {
  report: PaymentReport;
  scope: string[] | undefined;
  groupLabel: string;
  nameOf: (g: PaymentReport['groups'][number]) => string;
  filterOf: (id: string) => Record<string, string>;
  comparisonLabel: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const hasCmp = report.comparison != null;
  const total = report.received.amount;
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>{t('reports.payments.table.hint', { entities: getName('payment', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{getName('payment', true)}</th>
                <th className="right">{t('reports.payments.summary.received')}</th>
                <th>{t('reports.revenue.table.share')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const share = total > 0 ? (g.amount / total) * 100 : 0;
                return (
                  <DenseRow
                    key={g.id}
                    className="rp-group"
                    onClick={() => navigate(paymentsHref(report.from, report.to, scope, filterOf(g.id)))}
                    data-testid="report-group"
                  >
                    <td className="strong">{nameOf(g)}</td>
                    <td className="right num">{g.count.toLocaleString('en-US')}</td>
                    <td className="right num strong">{money(g.amount)}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        <span className="num">{Math.round(share)}%</span>
                      </span>
                    </td>
                    {hasCmp && <td className="right num muted-cell">{money(g.comparisonAmount ?? 0)}</td>}
                    {hasCmp && (
                      <td className="right num">
                        <Pct current={g.amount} previous={g.comparisonAmount} />
                      </td>
                    )}
                  </DenseRow>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.received.count.toLocaleString('en-US')}</td>
                <td className="right num strong">{money(total)}</td>
                <td />
                {hasCmp && <td className="right num muted-cell">{money(report.comparison?.received.amount ?? 0)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Pct current={total} previous={report.comparison?.received.amount} />
                  </td>
                )}
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

/** The deposit view: each day with a payment, split by method. */
function DaysTable({
  report,
  scope,
  methodName,
}: {
  report: PaymentReport;
  scope: string[] | undefined;
  methodName: (m: string) => string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.payments.days.title')}</CardTitle>
        <CardSub>{t('reports.payments.days.hint', { entities: getName('payment', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('reports.payments.groupBy.day')}</th>
                <th className="right">{getName('payment', true)}</th>
                <th className="right">{t('reports.payments.summary.received')}</th>
                <th>{t('reports.payments.days.byMethod')}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => (
                <DenseRow
                  key={g.id}
                  className="rp-group"
                  onClick={() => navigate(paymentsHref(g.id, g.id, scope))}
                  data-testid="report-group"
                >
                  <td className="strong">{longDay(g.id)}</td>
                  <td className="right num">{g.count.toLocaleString('en-US')}</td>
                  <td className="right num strong">{money(g.amount)}</td>
                  <td>
                    <span className="rp-methods">
                      {(g.byMethod ?? []).map((m) => (
                        <span key={m.method} className="rp-method">
                          {methodName(m.method)} <span className="num strong">{money(m.amount)}</span>
                          <span className="rp-sub"> ({m.count})</span>
                        </span>
                      ))}
                    </span>
                  </td>
                </DenseRow>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.received.count.toLocaleString('en-US')}</td>
                <td className="right num strong">{money(report.received.amount)}</td>
                <td />
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}
