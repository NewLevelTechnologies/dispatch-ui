// Reports → Jobs completed. Work orders completed in any range, compared and
// scoped, by type, division or region, with what they billed and the average
// ticket. Dated by completion, so `billed` is those jobs' invoices whatever
// their invoice date, not the Revenue report's. Per tech is Tech productivity.
// Money shows only with the invoice capability. State lives in the URL.
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  dispatchRegionApi,
  divisionsApi,
  workOrderReportsApi,
  workOrderTypesApi,
  type JobsReport,
  type JobsReportGroupBy,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
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
import { buckets, changePct, chartUnit, formatPct, formatSpan, ghostWindow, rangeName, windowName } from '../features/reports/revenueModel';

const GROUP_BYS: JobsReportGroupBy[] = ['workOrderType', 'division', 'region', 'none'];
const DEFAULT_GROUP: JobsReportGroupBy = 'workOrderType';
const DASH = '—';
// The Work orders list's param for each grouping.
const LIST_PARAM: Record<Exclude<JobsReportGroupBy, 'none'>, string> = {
  workOrderType: 'type',
  division: 'division',
  region: 'region',
};

/** The Work orders list on the report's completed jobs, plus a filter. */
function jobsHref(report: JobsReport, scope: string[] | undefined, extra: [string, string][] = []): string {
  const qs = new URLSearchParams([
    ['status', 'COMPLETED'],
    ['completedFrom', report.from],
    ['completedTo', report.to],
    ...(scope ?? []).map((r): [string, string] => ['region', r]),
    ...extra,
  ]);
  return `/work-orders?${qs.toString()}`;
}

const count = (n: number) => n.toLocaleString('en-US');

/** Tech productivity on the same range, comparison and scope. */
function techProductivityHref(params: URLSearchParams, regionId: string | null): string {
  const qs = new URLSearchParams();
  for (const key of ['range', 'compare']) {
    const v = params.get(key);
    if (v) qs.set(key, v);
  }
  if (regionId) qs.set('region', regionId);
  const s = qs.toString();
  return s ? `/reports/tech-productivity?${s}` : '/reports/tech-productivity';
}

export default function JobsCompletedReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const showMoney = useHasCapability('VIEW_ALL_INVOICES');
  const state = useReportRange();
  const { range, compare, regionId, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as JobsReportGroupBy | null;
  const groupOffered = (g: JobsReportGroupBy) => !(g === 'region' && regionId);
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) && groupOffered(groupRaw) ? groupRaw : DEFAULT_GROUP;

  const query = useQuery({
    queryKey: ['jobs-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () => workOrderReportsApi.jobsCompleted({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = query.data;

  const days = report?.jobsByDay.map((d) => ({ date: d.date, amount: d.jobs })) ?? [];
  const unit = chartUnit(days.length);
  const ghost = report ? ghostWindow(report, unit) : null;
  const ghostQuery = useQuery({
    queryKey: ['jobs-report', ghost?.from, ghost?.to, 'none', 'none', scope],
    queryFn: () =>
      workOrderReportsApi.jobsCompleted({ from: ghost!.from, to: ghost!.to, compare: 'none', groupBy: 'none', regionIds: scope }),
    enabled: !!ghost,
  });

  // Names for groups, retired ones included.
  const { data: allRegions = [] } = useQuery({ queryKey: ['dispatch-regions', 'all'], queryFn: () => dispatchRegionApi.getAll(true) });
  const { data: divisions = [] } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  const { data: types = [] } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });
  const names: Record<Exclude<JobsReportGroupBy, 'none'>, Map<string, string>> = {
    workOrderType: new Map(types.map((x) => [x.id, x.name])),
    division: new Map(divisions.map((d) => [d.id, d.name])),
    region: new Map(allRegions.map((r) => [r.id, r.name])),
  };
  const jobs = getName('work_order', true);
  const groupWord = (g: JobsReportGroupBy) =>
    g === 'division'
      ? getName('division')
      : g === 'region'
        ? getName('dispatch_region')
        : g === 'workOrderType'
          ? t('reports.revenue.groupBy.workOrderType', { workOrder: getName('work_order') })
          : t('reports.jobs.groupBy.none');
  const nameIn = (g: Exclude<JobsReportGroupBy, 'none'>) => (id: string | null) =>
    id ? (names[g].get(id) ?? t('reports.revenue.unknown')) : t('reports.revenue.unassigned', { group: groupWord(g).toLowerCase() });

  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.jobs.subToDate' : 'reports.jobs.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        entities: jobs,
      })
    : rangeName(range);

  // The table as shown: a row per group and the total.
  const exportCsv = () => {
    if (!report) return;
    try {
      const g = groupBy === 'none' ? null : groupBy;
      const head = [
        ...(g ? [groupWord(g)] : []),
        jobs,
        ...(showMoney ? [t('reports.jobs.table.billed'), t('reports.jobs.table.averageTicket')] : []),
        t('reports.jobs.table.notBilled'),
      ];
      const line = (label: string[], r: { jobs: number; billed: number; averageTicket: number | null; notBilled: number }) => [
        ...label,
        r.jobs,
        ...(showMoney ? [r.billed.toFixed(2), r.averageTicket != null ? r.averageTicket.toFixed(2) : ''] : []),
        r.notBilled,
      ];
      const csv = csvLines([
        head,
        ...(g ? report.groups.map((x) => line([nameIn(g)(x.id)], x)) : []),
        line(g ? [t('reports.revenue.table.total')] : [], report),
      ]);
      const file = `jobs-completed-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.jobs.exported', { file }));
    } catch {
      showError(t('reports.jobs.exportFailed'));
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.jobs.loadFailed', { entities: jobs.toLowerCase() })}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const ghosts =
      ghost && ghostQuery.data ? buckets(ghostQuery.data.jobsByDay.map((d) => ({ date: d.date, amount: d.jobs })), unit) : undefined;
    const ghostLabel = ghost
      ? ghost.sameWeekdays
        ? t('reports.revenue.chart.sameWeekdays', { window: comparisonName })
        : comparisonName
      : null;
    body = (
      <>
        <Summary report={report} cmpLine={cmpLine} showMoney={showMoney} />
        {report.jobs === 0 ? (
          <EmptyState
            title={t('reports.jobs.empty.title', { entities: jobs.toLowerCase() })}
            description={t('reports.jobs.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <>
            <RevenueChart
              unit={unit}
              bars={buckets(days, unit)}
              ghosts={ghosts}
              rangeLabel={range.kind === 'period' ? periodName(range.period) : formatSpan(report.from, report.to)}
              ghostLabel={ghostLabel}
              title={t(`reports.jobs.chart.${unit}`)}
              format={count}
            />
            {groupBy !== 'none' && (
              <GroupsTable
                report={report}
                scope={scope}
                groupBy={groupBy}
                groupLabel={groupWord(groupBy)}
                nameOf={nameIn(groupBy)}
                comparisonLabel={comparisonName}
                showMoney={showMoney}
                techHref={showMoney ? techProductivityHref(searchParams, regionId) : null}
              />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.jobs.title', { entities: jobs })}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={exportCsv} disabled={!report || report.jobs === 0}>
            <ArrowDownTrayIcon data-slot="icon" />
            {t('reports.revenue.export')}
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
          {GROUP_BYS.filter(groupOffered).map((g) => (
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

function Pct({ current, previous }: { current: number | null; previous: number | null | undefined }) {
  const pct = current == null ? null : changePct(current, previous ?? null);
  if (pct == null) return null;
  return <span className={pct >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>;
}

function Summary({ report, cmpLine, showMoney }: { report: JobsReport; cmpLine: string; showMoney: boolean }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  const words = { entities: getName('work_order', true).toLowerCase(), invoice: getName('invoice').toLowerCase() };
  const cells = [
    <SummaryCell
      key="jobs"
      label={t('reports.jobs.summary.jobs')}
      value={count(report.jobs)}
      sub={
        <>
          <Pct current={report.jobs} previous={c?.jobs} />
          {cmpLine}
        </>
      }
    />,
    ...(showMoney
      ? [
          <SummaryCell
            key="billed"
            label={t('reports.jobs.table.billed')}
            value={money(report.billed)}
            sub={
              <>
                <Pct current={report.billed} previous={c?.billed} />
                {t('reports.jobs.summary.billedSub', { invoices: getName('invoice', true).toLowerCase() })}
              </>
            }
          />,
          <SummaryCell
            key="ticket"
            label={t('reports.jobs.table.averageTicket')}
            value={report.averageTicket != null ? money(report.averageTicket) : DASH}
            sub={
              <>
                <Pct current={report.averageTicket} previous={c?.averageTicket} />
                {cmpLine}
              </>
            }
          />,
        ]
      : []),
    <SummaryCell
      key="notBilled"
      label={t('reports.jobs.table.notBilled')}
      // Not linked: the list's "not invoiced" filter leaves out agreement
      // visits, which this count may include, so the two wouldn't agree.
      value={count(report.notBilled)}
      last
      sub={t('reports.jobs.summary.notBilledSub', words)}
    />,
  ];
  return (
    <div className="rp-strip" data-testid="report-summary">
      {cells}
    </div>
  );
}

function GroupsTable({
  report,
  scope,
  groupBy,
  groupLabel,
  nameOf,
  comparisonLabel,
  showMoney,
  techHref,
}: {
  report: JobsReport;
  scope: string[] | undefined;
  groupBy: Exclude<JobsReportGroupBy, 'none'>;
  groupLabel: string;
  nameOf: (id: string | null) => string;
  comparisonLabel: string | null;
  showMoney: boolean;
  techHref: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const hasCmp = report.comparison != null;
  const jobs = getName('work_order', true);
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>
          {t('reports.jobs.table.hint', { entities: jobs.toLowerCase() })}
          {techHref && (
            <>
              {' · '}
              <RouterLink to={techHref} className="text-fg-accent hover:underline">
                {t('reports.jobs.table.perTech', { tech: getName('technician').toLowerCase() })}
              </RouterLink>
            </>
          )}
        </CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{jobs}</th>
                <th>{t('reports.revenue.table.share')}</th>
                {showMoney && <th className="right">{t('reports.jobs.table.billed')}</th>}
                {showMoney && <th className="right">{t('reports.jobs.table.averageTicket')}</th>}
                <th className="right rp-opt">{t('reports.jobs.table.notBilled')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const share = report.jobs > 0 ? (g.jobs / report.jobs) * 100 : 0;
                // The list has no "none set" filter, so the unassigned row stays put.
                const href = g.id ? jobsHref(report, groupBy === 'region' ? undefined : scope, [[LIST_PARAM[groupBy], g.id]]) : null;
                return (
                  <DenseRow
                    key={g.id ?? 'none'}
                    className={clsx(href && 'rp-group')}
                    onClick={href ? () => navigate(href) : undefined}
                    data-testid="report-group"
                  >
                    <td>
                      <span className={g.id ? 'strong' : 'text-fg-muted'}>{nameOf(g.id)}</span>
                    </td>
                    <td className="right num strong">{count(g.jobs)}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        <span className="num">{Math.round(share)}%</span>
                      </span>
                    </td>
                    {showMoney && <td className="right num">{money(g.billed)}</td>}
                    {showMoney && <td className="right num">{g.averageTicket != null ? money(g.averageTicket) : DASH}</td>}
                    <td className="right num rp-opt">{count(g.notBilled)}</td>
                    {hasCmp && <td className="right num muted-cell">{count(g.comparisonJobs ?? 0)}</td>}
                    {hasCmp && (
                      <td className="right num">
                        <Pct current={g.jobs} previous={g.comparisonJobs} />
                      </td>
                    )}
                  </DenseRow>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num strong">{count(report.jobs)}</td>
                <td />
                {showMoney && <td className="right num">{money(report.billed)}</td>}
                {showMoney && <td className="right num">{report.averageTicket != null ? money(report.averageTicket) : DASH}</td>}
                <td className="right num rp-opt">{count(report.notBilled)}</td>
                {hasCmp && <td className="right num muted-cell">{count(report.comparison?.jobs ?? 0)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Pct current={report.jobs} previous={report.comparison?.jobs} />
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
