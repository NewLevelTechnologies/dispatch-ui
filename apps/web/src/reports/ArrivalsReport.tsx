// Reports → Arrival windows. Home's on-time rule over any range, compared,
// scoped and grouped by tech or region, with every late visit listed. The
// figures are the server's; Home's last-7-days card is this report for those
// days. State lives in the URL (`range`, `compare`, `region`, `group`; `tech`
// and `latePage` for the late list).
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import { titleCaseAddress } from '@dispatch/utils';
import {
  arrivalReportApi,
  dispatchRegionApi,
  userApi,
  type ArrivalReport,
  type ArrivalReportGroupBy,
  type LateArrival,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlPage } from '../hooks/useUrlPage';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ListFooter } from '../components/ui/ListFooter';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { periodName } from '../features/home/period';
import { RevenueChart } from '../features/reports/RevenueChart';
import { downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';
import { changePct, chartUnit, formatPct, formatSpan, ghostWindow, rangeName, windowName } from '../features/reports/revenueModel';
import {
  ARRIVAL_GROUP_BYS,
  LATE_PAGE_PARAM,
  TECH_PARAM,
  clockTime,
  formatMinutes,
  formatPoints,
  formatRate,
  lateCsv,
  pointsChange,
  rateBuckets,
  windowParts,
} from '../features/reports/arrivalsModel';

const DEFAULT_GROUP: ArrivalReportGroupBy = 'technician';
const DASH = '—';
const PAGE_SIZE = 25;
const EXPORT_PAGE = 200;
// Any new question starts the late list over and drops its tech filter.
const RESET = [LATE_PAGE_PARAM, TECH_PARAM];

export default function ArrivalsReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange(RESET);
  const { range, compare, regionId, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as ArrivalReportGroupBy | null;
  const groupOffered = (g: ArrivalReportGroupBy) => !(g === 'region' && regionId);
  const groupBy = groupRaw && ARRIVAL_GROUP_BYS.includes(groupRaw) && groupOffered(groupRaw) ? groupRaw : DEFAULT_GROUP;
  const techId = searchParams.get(TECH_PARAM);

  const query = useQuery({
    queryKey: ['arrival-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () => arrivalReportApi.get({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = query.data;

  const unit = chartUnit(report?.byDay.length ?? 0);
  const ghost = report ? ghostWindow(report, unit) : null;
  const ghostQuery = useQuery({
    queryKey: ['arrival-report', ghost?.from, ghost?.to, 'none', 'none', scope],
    queryFn: () => arrivalReportApi.get({ from: ghost!.from, to: ghost!.to, compare: 'none', groupBy: 'none', regionIds: scope }),
    enabled: !!ghost,
  });

  // Names for the groups, retired regions and departed users included.
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const { data: allRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'all'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });
  const techNames = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));
  const regionNames = new Map(allRegions.map((r) => [r.id, r.name]));
  const words = { tech: getName('technician'), techs: getName('technician', true), region: getName('dispatch_region') };
  const groupWord = (g: ArrivalReportGroupBy) =>
    g === 'technician' ? words.tech : g === 'region' ? words.region : t('reports.arrivals.groupBy.none');
  const nameOf = (g: ArrivalReportGroupBy, id: string | null) =>
    g === 'technician'
      ? id
        ? (techNames.get(id) ?? t('dashboard.revenue.techs.formerUser'))
        : t('reports.arrivals.unassigned', { tech: words.tech.toLowerCase() })
      : id
        ? (regionNames.get(id) ?? t('reports.revenue.unknown'))
        : t('reports.revenue.unassigned', { group: words.region.toLowerCase() });

  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.arrivals.subToDate' : 'reports.arrivals.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
      })
    : rangeName(range);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: LateArrival[] = [];
      for (let page = 0; ; page++) {
        const res = await arrivalReportApi.late({ from: report.from, to: report.to, regionIds: scope, page, size: EXPORT_PAGE });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const csv = lateCsv(rows, {
        headers: [
          t('reports.arrivals.csv.windowStart'),
          t('reports.arrivals.csv.windowEnd'),
          t('reports.arrivals.csv.arrived'),
          t('reports.arrivals.csv.minutesLate'),
          words.tech,
          words.region,
          getName('customer'),
          getName('service_location'),
          getName('work_order'),
        ],
        region: (id) => (id ? (regionNames.get(id) ?? '') : ''),
        timeZone: report.timeZone,
      });
      const file = `late-arrivals-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.arrivals.exported', { file, count: rows.length }));
    } catch {
      showError(t('reports.arrivals.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.arrivals.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const ghosts = ghost && ghostQuery.data ? rateBuckets(ghostQuery.data.byDay, unit) : undefined;
    const ghostLabel = ghost
      ? ghost.sameWeekdays
        ? t('reports.revenue.chart.sameWeekdays', { window: comparisonName })
        : comparisonName
      : null;
    body = (
      <>
        <Summary report={report} cmpLine={cmpLine} />
        {report.visits === 0 ? (
          <EmptyState
            title={t('reports.arrivals.empty.title', { dispatches: getName('dispatch', true).toLowerCase() })}
            description={t('reports.arrivals.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <>
            <RevenueChart
              unit={unit}
              bars={rateBuckets(report.byDay, unit)}
              ghosts={ghosts}
              rangeLabel={range.kind === 'period' ? periodName(range.period) : formatSpan(report.from, report.to)}
              ghostLabel={ghostLabel}
              title={t(`reports.arrivals.chart.${unit}`)}
              format={(n) => formatRate(n)}
              max={1}
            />
            {groupBy !== 'none' && (
              <GroupsTable
                report={report}
                groupLabel={groupWord(groupBy)}
                nameOf={(id) => nameOf(groupBy, id)}
                comparisonLabel={comparisonName}
                activeTech={techId}
                onPick={(id) =>
                  groupBy === 'technician' ? update({ [TECH_PARAM]: id === techId ? null : id }) : update({ region: id })
                }
              />
            )}
            <LateList
              report={report}
              scope={scope}
              techId={techId}
              techName={techId ? nameOf('technician', techId) : null}
              regionName={(id) => (id ? (regionNames.get(id) ?? '') : '')}
              onClearTech={() => update({ [TECH_PARAM]: null })}
            />
          </>
        )}
      </>
    );
  }

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.arrivals.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || report.late === 0}>
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
          {ARRIVAL_GROUP_BYS.filter(groupOffered).map((g) => (
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

function Points({ pts }: { pts: number | null }) {
  if (pts == null) return null;
  return <span className={pts >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPoints(pts)} </span>;
}

function Summary({ report, cmpLine }: { report: ArrivalReport; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  // More late arrivals, or later ones, is the bad direction: say so in colour.
  const latePct = changePct(report.late, c?.late ?? null);
  const minutesPct = changePct(report.averageMinutesLate ?? 0, c?.averageMinutesLate ?? null);
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.arrivals.summary.onTime')}
        value={formatRate(report.onTimeRate)}
        sub={
          <>
            <Points pts={pointsChange(report.onTimeRate, c?.onTimeRate)} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.arrivals.summary.arrived')}
        value={report.arrived.toLocaleString('en-US')}
        sub={t('reports.arrivals.summary.arrivedSub', {
          count: report.visits,
          dispatches: getName('dispatch', true).toLowerCase(),
        })}
      />
      <SummaryCell
        label={t('reports.arrivals.summary.late')}
        value={report.late.toLocaleString('en-US')}
        sub={
          <>
            {latePct != null && <span className={latePct <= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(latePct)} </span>}
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.arrivals.summary.averageLate')}
        value={report.averageMinutesLate != null ? formatMinutes(report.averageMinutesLate) : DASH}
        last
        sub={
          report.averageMinutesLate != null && c?.averageMinutesLate != null ? (
            <>
              {minutesPct != null && (
                <span className={minutesPct <= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(minutesPct)} </span>
              )}
              {cmpLine}
            </>
          ) : (
            t('reports.arrivals.summary.averageLateSub')
          )
        }
      />
    </div>
  );
}

function GroupsTable({
  report,
  groupLabel,
  nameOf,
  comparisonLabel,
  activeTech,
  onPick,
}: {
  report: ArrivalReport;
  groupLabel: string;
  nameOf: (id: string | null) => string;
  comparisonLabel: string | null;
  activeTech: string | null;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const hasCmp = report.comparison != null;
  const byTech = report.groupBy === 'technician';
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.arrivals.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>{t(byTech ? 'reports.arrivals.table.hintTech' : 'reports.arrivals.table.hintRegion')}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{t('reports.arrivals.table.visits')}</th>
                <th className="right">{t('reports.arrivals.table.arrived')}</th>
                <th className="right">{t('reports.arrivals.table.late')}</th>
                <th>{t('reports.arrivals.table.onTime')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const pct = g.onTimeRate != null ? g.onTimeRate * 100 : 0;
                const pickable = g.id != null;
                return (
                  <DenseRow
                    key={g.id ?? 'none'}
                    className={clsx(pickable && 'rp-group', byTech && g.id === activeTech && 'rp-selected')}
                    onClick={pickable ? () => onPick(g.id!) : undefined}
                    aria-pressed={byTech && pickable ? g.id === activeTech : undefined}
                    data-testid="report-group"
                  >
                    <td>
                      <span className={g.id ? 'strong' : 'text-fg-muted'}>{nameOf(g.id)}</span>
                    </td>
                    <td className="right num">{g.visits.toLocaleString('en-US')}</td>
                    <td className="right num">{g.arrived.toLocaleString('en-US')}</td>
                    <td className="right num">{g.late.toLocaleString('en-US')}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        <span className="num">{formatRate(g.onTimeRate)}</span>
                      </span>
                    </td>
                    {hasCmp && <td className="right num muted-cell">{formatRate(g.comparisonOnTimeRate)}</td>}
                    {hasCmp && (
                      <td className="right num">
                        <Points pts={pointsChange(g.onTimeRate, g.comparisonOnTimeRate)} />
                      </td>
                    )}
                  </DenseRow>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.visits.toLocaleString('en-US')}</td>
                <td className="right num">{report.arrived.toLocaleString('en-US')}</td>
                <td className="right num">{report.late.toLocaleString('en-US')}</td>
                <td className="num strong">{formatRate(report.onTimeRate)}</td>
                {hasCmp && <td className="right num muted-cell">{formatRate(report.comparison?.onTimeRate)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Points pts={pointsChange(report.onTimeRate, report.comparison?.onTimeRate)} />
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

function LateList({
  report,
  scope,
  techId,
  techName,
  regionName,
  onClearTech,
}: {
  report: ArrivalReport;
  scope: string[] | undefined;
  techId: string | null;
  techName: string | null;
  regionName: (id: string | null) => string;
  onClearTech: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(LATE_PAGE_PARAM);
  const query = useQuery({
    queryKey: ['arrival-report', 'late', report.from, report.to, scope, techId, page],
    queryFn: () =>
      arrivalReportApi.late({
        from: report.from,
        to: report.to,
        regionIds: scope,
        technicianId: techId ?? undefined,
        page: page - 1,
        size: PAGE_SIZE,
      }),
    enabled: report.late > 0,
  });
  const data = query.data;
  const total = data?.totalElements ?? 0;
  const zone = report.timeZone;

  let content;
  if (report.late === 0) content = <div className="rp-note">{t('reports.arrivals.late.none')}</div>;
  else if (query.isLoading) content = <LoadingState />;
  else if (query.isError || !data)
    content = (
      <ErrorState
        title={t('reports.arrivals.late.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (data.content.length === 0) content = <div className="rp-note">{t('reports.arrivals.late.noneForTech', { name: techName })}</div>;
  else
    content = (
      <>
        <DenseTable className="dense-stack">
          <DenseTHead>
            <tr>
              <th>{t('reports.arrivals.late.window')}</th>
              <th>{t('reports.arrivals.late.arrived')}</th>
              <th className="right">{t('reports.arrivals.late.lateBy')}</th>
              <th>{getName('technician')}</th>
              <th>{getName('customer')}</th>
              <th>{getName('work_order')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {data.content.map((r) => {
              const w = windowParts(r.arrivalWindowStart, r.arrivalWindowEnd, zone);
              const place = [r.serviceLocation.name, titleCaseAddress(r.serviceLocation.streetAddress)]
                .filter(Boolean)
                .join(' · ');
              return (
                <DenseRow key={r.dispatchId} data-testid="late-row">
                  <td>
                    <div className="strong">{w.day}</div>
                    <div className="rp-sub num">{w.time}</div>
                  </td>
                  <td className="num" data-label={t('reports.arrivals.late.arrived')}>
                    {clockTime(r.arrivedAt, zone)}
                  </td>
                  <td className="right num strong" data-label={t('reports.arrivals.late.lateBy')}>
                    {formatMinutes(r.minutesLate)}
                  </td>
                  <td data-label={getName('technician')}>
                    <div>{r.technicianName ?? DASH}</div>
                    {r.regionId && <div className="rp-sub">{regionName(r.regionId)}</div>}
                  </td>
                  <td data-label={getName('customer')}>
                    <div className="strong">{r.customerName}</div>
                    {place && <div className="rp-sub">{place}</div>}
                  </td>
                  <td data-label={getName('work_order')}>
                    <RouterLink to={`/work-orders/${r.workOrderId}`} className="id-mono text-fg-accent hover:underline">
                      {r.workOrderNumber}
                    </RouterLink>
                  </td>
                </DenseRow>
              );
            })}
          </tbody>
        </DenseTable>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('common.pagination.showing', {
            start: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
            end: Math.min(page * PAGE_SIZE, total),
            total: total.toLocaleString(),
          })}
        />
      </>
    );

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.arrivals.late.title')}</CardTitle>
        {techId ? (
          <button type="button" className="rp-tech-filter" onClick={onClearTech}>
            {t('reports.arrivals.late.onlyTech', { name: techName })}
            <XMarkIcon className="size-3" aria-label={t('reports.arrivals.late.clearTech')} />
          </button>
        ) : (
          <CardSub>{t('reports.arrivals.late.hint')}</CardSub>
        )}
      </CardHead>
      <CardBody flush>{content}</CardBody>
    </Card>
  );
}
