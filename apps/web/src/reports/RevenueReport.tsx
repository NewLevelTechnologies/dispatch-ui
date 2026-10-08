// Reports → Revenue. Billed revenue over any range, compared, scoped and
// grouped, with the same definitions as Home: a whole month or quarter here
// is Home's number for it to the cent. Every figure is the server's; state
// lives in the URL (`range`, `compare`, `region`, `group`; `from=home` when
// Home sent you) so a report can be shared.
import { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/16/solid';
import {
  dispatchRegionApi,
  divisionsApi,
  invoicesApi,
  revenueReportApi,
  workOrderTypesApi,
  type InvoiceListItemRow,
  type RevenueReport as Report,
  type RevenueReportCompare,
  type RevenueReportGroupBy,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { zonedDate } from '../lib/boardTime';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { ChipListboxOption, ChipListboxSection, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { money } from '../features/home/revenueSelectors';
import { parsePeriod, periodGroups, periodName } from '../features/home/period';
import { RevenueChart } from '../features/reports/RevenueChart';
import { downloadCsv } from '../features/reports/csv';
import { RevenueGroupsTable, RevenueInvoiceList } from '../features/reports/RevenueTables';
import {
  COMPARES,
  GROUP_BYS,
  INVOICE_PAGE_PARAM,
  buckets,
  changePct,
  chartUnit,
  customRangeId,
  customRangeProblem,
  defaultRangeId,
  formatPct,
  formatSpan,
  ghostWindow,
  rangeName,
  reportInvoiceParams,
  resolveRange,
  revenueCsv,
  windowName,
} from '../features/reports/revenueModel';

const DEFAULT_COMPARE: RevenueReportCompare = 'sameDatesLastYear';
const DEFAULT_GROUP: RevenueReportGroupBy = 'division';
const CUSTOM = 'custom';
// The list endpoint's page cap.
const EXPORT_PAGE = 200;

export default function RevenueReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();

  const range = resolveRange(searchParams.get('range'), today);
  const compareRaw = searchParams.get('compare') as RevenueReportCompare | null;
  const compare = compareRaw && COMPARES.includes(compareRaw) ? compareRaw : DEFAULT_COMPARE;
  const regionId = searchParams.get('region');
  const scope = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);
  const groupRaw = searchParams.get('group') as RevenueReportGroupBy | null;
  // Grouping one region by region is a single row at 100%.
  const groupOffered = (g: RevenueReportGroupBy) => !(g === 'region' && regionId);
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) && groupOffered(groupRaw) ? groupRaw : DEFAULT_GROUP;
  const fromHome = searchParams.get('from') === 'home';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any new question starts the invoice list over.
    next.delete(INVOICE_PAGE_PARAM);
    setSearchParams(next, { replace: true });
  };

  // Custom dates under edit: held here until they make a range the backend takes.
  const [customDraft, setCustomDraft] = useState<{ from: string; to: string } | null>(null);
  const customProblem =
    customDraft && customDraft.from && customDraft.to ? customRangeProblem(customDraft.from, customDraft.to, today) : null;
  const pickRange = (id: string | null) => {
    if (id === CUSTOM) {
      // Start from the range on screen, ending no later than today.
      const to = range.to > today ? today : range.to;
      setCustomDraft(null);
      update({ range: customRangeId(range.from, to) });
    } else update({ range: id && id !== defaultRangeId(today) ? id : null });
  };
  const setCustom = (v: { from: string; to: string }) => {
    setCustomDraft(v);
    if (v.from && v.to && !customRangeProblem(v.from, v.to, today)) {
      setCustomDraft(null);
      update({ range: customRangeId(v.from, v.to) });
    }
  };

  const reportQuery = useQuery({
    queryKey: ['revenue-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () =>
      revenueReportApi.get({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = reportQuery.data;

  const unit = chartUnit(report?.billedByDay.length ?? 0);
  const ghost = report ? ghostWindow(report, unit) : null;
  // The ghost bars' days: the comparison window, or last year's same weekdays.
  const ghostQuery = useQuery({
    queryKey: ['revenue-report', ghost?.from, ghost?.to, 'none', 'none', scope],
    queryFn: () =>
      revenueReportApi.get({ from: ghost!.from, to: ghost!.to, compare: 'none', groupBy: 'none', regionIds: scope }),
    enabled: !!ghost,
  });

  const { data: activeRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  // Names for groups and the CSV include retired regions, divisions and types.
  const { data: allRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'all'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });
  const { data: divisions = [] } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  const { data: types = [] } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });

  const groupNames: Record<Exclude<RevenueReportGroupBy, 'none'>, Map<string, string>> = {
    division: new Map(divisions.map((d) => [d.id, d.name])),
    workOrderType: new Map(types.map((x) => [x.id, x.name])),
    region: new Map(allRegions.map((r) => [r.id, r.name])),
  };
  const groupWord = (g: RevenueReportGroupBy) =>
    g === 'division'
      ? getName('division')
      : g === 'region'
        ? getName('dispatch_region')
        : g === 'workOrderType'
          ? t('reports.revenue.groupBy.workOrderType')
          : t('reports.revenue.groupBy.none');
  const nameIn = (g: Exclude<RevenueReportGroupBy, 'none'>) => (id: string | null) =>
    id
      ? (groupNames[g].get(id) ?? t('reports.revenue.unknown'))
      : t('reports.revenue.unassigned', { group: groupWord(g).toLowerCase() });

  // "to date" when the server cut the range at today.
  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = report?.comparison
    ? t('reports.revenue.vs', { window: comparisonName })
    : compare === 'none'
      ? t('reports.revenue.noComparisonPicked')
      : t(`reports.revenue.noComparison.${compare}`, { year: Number(range.from.slice(0, 4)) - 1 });

  // Export: every invoice in the report, one row each, built from the list
  // the drill-downs use, so the row count is the report's invoice count.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: InvoiceListItemRow[] = [];
      for (let page = 0; ; page++) {
        const res = await invoicesApi.getAll({ ...reportInvoiceParams(report, scope), page, size: EXPORT_PAGE });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const csv = revenueCsv(rows, {
        headers: [
          t('reports.revenue.csv.number', { entity: getName('invoice') }),
          t('reports.revenue.csv.date'),
          getName('customer'),
          getName('work_order'),
          getName('division'),
          t('reports.revenue.groupBy.workOrderType'),
          getName('dispatch_region'),
          t('reports.revenue.csv.subtotal'),
          t('reports.revenue.csv.tax'),
          t('reports.revenue.csv.total'),
        ],
        division: (id) => (id ? (groupNames.division.get(id) ?? '') : ''),
        type: (id) => (id ? (groupNames.workOrderType.get(id) ?? '') : ''),
        region: (id) => (id ? (groupNames.region.get(id) ?? '') : ''),
      });
      const file = `revenue-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(
        t('reports.revenue.exported', { file, count: rows.length, entities: getName('invoice', true).toLowerCase() }),
      );
    } catch {
      showError(t('reports.revenue.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const sub = report
    ? t(toDate ? 'reports.revenue.subToDate' : 'reports.revenue.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
      })
    : rangeName(range);

  const rangeChipValue = range.kind === 'custom' ? CUSTOM : range.id;
  const filters = (
    <div className="rp-filters">
      <FilterChipListbox
        label={t('reports.revenue.filters.range')}
        ariaLabel={t('reports.revenue.filters.range')}
        value={rangeChipValue}
        displayValue={range.kind === 'custom' ? t('reports.revenue.filters.custom') : periodName(range.period)}
        onChange={pickRange}
      >
        {periodGroups(today).map((group) => (
          <ChipListboxSection key={group.id} label={t(`dashboard.period.groups.${group.id}`)}>
            {group.options.map((option) => (
              <ChipListboxOption key={option.id} value={option.id}>
                {periodName(parsePeriod(option.id)!)}
                {option.hint && <span className="text-fg-muted"> · {t(`dashboard.period.hints.${option.hint}`)}</span>}
              </ChipListboxOption>
            ))}
          </ChipListboxSection>
        ))}
        <ChipListboxSection label={t('reports.revenue.filters.customGroup')}>
          <ChipListboxOption value={CUSTOM}>{t('reports.revenue.filters.customOption')}</ChipListboxOption>
        </ChipListboxSection>
      </FilterChipListbox>
      {range.kind === 'custom' && (
        <DateRangeChip
          label={t('reports.revenue.filters.dates')}
          ariaLabel={t('reports.revenue.filters.dates')}
          value={customDraft ?? { from: range.from, to: range.to }}
          onChange={setCustom}
        />
      )}
      <FilterChipListbox
        label={t('reports.revenue.filters.compare')}
        ariaLabel={t('reports.revenue.filters.compare')}
        value={compare}
        displayValue={t(`reports.revenue.compare.${compare}`)}
        onChange={(v) => update({ compare: v && v !== DEFAULT_COMPARE ? v : null })}
      >
        {COMPARES.map((c) => (
          <ChipListboxOption key={c} value={c}>
            {t(`reports.revenue.compare.${c}`)}
          </ChipListboxOption>
        ))}
      </FilterChipListbox>
      {activeRegions.length > 1 && (
        <FilterChipListbox
          label={regionId ? t('dashboard.scope.label') : t('dashboard.scope.labelAll')}
          ariaLabel={t('dashboard.scope.label')}
          value={regionId}
          displayValue={activeRegions.find((r) => r.id === regionId)?.name ?? null}
          resetLabel={t('dashboard.scope.all')}
          onChange={(id) => update({ region: id })}
          onClear={() => update({ region: null })}
        >
          {activeRegions.map((r) => (
            <ChipListboxOption key={r.id} value={r.id}>
              {r.name}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      )}
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
            {g === 'none'
              ? t('reports.revenue.groupBy.noneOption', { entities: getName('invoice', true).toLowerCase() })
              : groupWord(g)}
          </ChipListboxOption>
        ))}
      </FilterChipListbox>
    </div>
  );

  let body;
  if (reportQuery.isLoading) body = <LoadingState />;
  else if (reportQuery.isError || !report)
    body = (
      <ErrorState
        title={t('reports.revenue.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void reportQuery.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const bars = buckets(report.billedByDay, unit);
    const ghosts = ghost && ghostQuery.data ? buckets(ghostQuery.data.billedByDay, unit) : undefined;
    const ghostLabel = ghost
      ? ghost.sameWeekdays
        ? t('reports.revenue.chart.sameWeekdays', { window: comparisonName })
        : comparisonName
      : null;
    body = (
      <>
        <Summary report={report} cmpLine={cmpLine} />
        {report.invoiceCount === 0 ? (
          <EmptyState
            title={t('reports.revenue.empty.title', { entities: getName('invoice', true).toLowerCase() })}
            description={t('reports.revenue.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <>
            <RevenueChart
              unit={unit}
              bars={bars}
              ghosts={ghosts}
              rangeLabel={range.kind === 'period' ? periodName(range.period) : formatSpan(report.from, report.to)}
              ghostLabel={ghostLabel}
            />
            {groupBy === 'none' ? (
              <RevenueInvoiceList report={report} scope={scope} />
            ) : (
              <RevenueGroupsTable
                report={report}
                scope={scope}
                groupLabel={groupWord(groupBy)}
                nameOf={nameIn(groupBy)}
                comparisonLabel={comparisonName}
              />
            )}
          </>
        )}
      </>
    );
  }

  const homeHref = `/dashboard?${new URLSearchParams({
    view: 'rev',
    ...(range.kind === 'period' ? { period: range.id } : {}),
    ...(regionId ? { region: regionId } : {}),
  }).toString()}`;

  return (
    <div className="rp-page">
      <RouterLink to={fromHome ? homeHref : '/reports'} className="rp-back">
        <ArrowLeftIcon className="size-3.5" />
        {fromHome ? t('reports.revenue.backHome') : t('reports.title')}
      </RouterLink>
      <PageHead
        title={t('reports.revenue.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      {filters}
      {customProblem && (
        <p className="rp-filter-error" role="alert">
          {t(`reports.revenue.filters.problem.${customProblem}`)}
        </p>
      )}
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function Summary({ report, cmpLine }: { report: Report; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  const avg = (billed: number, count: number) => (count > 0 ? billed / count : 0);
  const cells: { label: string; value: string; current: number; previous: number | null }[] = [
    { label: t('reports.revenue.summary.revenue'), value: money(report.billed), current: report.billed, previous: c?.billed ?? null },
    {
      label: getName('invoice', true),
      value: report.invoiceCount.toLocaleString('en-US'),
      current: report.invoiceCount,
      previous: c?.invoiceCount ?? null,
    },
    {
      label: t('reports.revenue.table.avg', { entity: getName('invoice') }),
      value: money(avg(report.billed, report.invoiceCount)),
      current: avg(report.billed, report.invoiceCount),
      previous: c ? avg(c.billed, c.invoiceCount) : null,
    },
    { label: t('reports.revenue.summary.collected'), value: money(report.collected), current: report.collected, previous: c?.collected ?? null },
  ];
  return (
    <div className="rp-strip" data-testid="report-summary">
      {cells.map((cell, i) => {
        const pct = changePct(cell.current, cell.previous);
        return (
          <SummaryCell
            key={cell.label}
            label={cell.label}
            value={cell.value}
            last={i === cells.length - 1}
            sub={
              <>
                {pct != null && <span className={pct >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>}
                {cmpLine}
              </>
            }
          />
        );
      })}
    </div>
  );
}
