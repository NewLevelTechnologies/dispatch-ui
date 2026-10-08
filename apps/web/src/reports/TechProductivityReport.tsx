// Reports → Tech productivity. Home's scorecard over any range, compared and
// scoped, with a weekly trend per tech. The credit rules are Home's, so the
// total is the Revenue report's billed figure for the same dates and scope.
// State lives in the URL (`range`, `compare`, `region`; `tech` and `techPage`
// for the drill-in; `from=home` when Home sent you).
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import { technicianProductivityApi, type TechnicianProductivityResponse } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { callbacksCoverage, longDate, money, unattributedAmount } from '../features/home/revenueSelectors';
import { TechCreditDrawer, TECH_PAGE_PARAM, TECH_PARAM } from '../features/home/TechCreditDrawer';
import { downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { TechTable } from '../features/reports/TechTable';
import { changePct, formatPct, formatSpan, rangeName, windowName } from '../features/reports/revenueModel';
import { creditedRevenue, techCsv } from '../features/reports/techModel';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';

// A new question closes the drill-in.
const RESET = [TECH_PARAM, TECH_PAGE_PARAM];

export default function TechProductivityReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange(RESET);
  const { range, compare, scope, searchParams, update } = state;

  const query = useQuery({
    queryKey: ['technician-productivity', 'report', range.from, range.to, compare, scope],
    queryFn: () => technicianProductivityApi.get({ from: range.from, to: range.to, compare, regionIds: scope }),
  });
  const data = query.data;

  const words = { tech: getName('technician'), techs: getName('technician', true) };
  const nameOf = (name: string | null) => name ?? t('dashboard.revenue.techs.formerUser');
  const comparisonName = data?.comparison ? windowName(data.comparison.from, data.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  // "to date" when the server cut the range at today.
  const toDate = data ? data.asOf < range.to : range.to > state.today;
  const sub = data
    ? t(toDate ? 'reports.techs.subToDate' : 'reports.techs.sub', {
        range: rangeName(range),
        dates: formatSpan(data.periodStart, data.asOf),
        invoice: getName('invoice'),
        ...words,
      })
    : rangeName(range);

  const openId = searchParams.get(TECH_PARAM);
  const openRow = openId ? data?.technicians.find((r) => r.userId === openId) : undefined;

  const exportCsv = () => {
    if (!data) return;
    try {
      const csv = techCsv(data, {
        headers: [
          getName('technician'),
          t('dashboard.revenue.techs.jobs'),
          t('dashboard.revenue.techs.revenue'),
          t('dashboard.revenue.techs.avgTicket'),
          t('reports.techs.csv.onSiteHours'),
          t('reports.techs.csv.invoicedHours'),
          t('dashboard.revenue.techs.perHour'),
          t('reports.techs.csv.firstVisitEligible'),
          t('reports.techs.csv.firstVisitCompleted'),
          t('dashboard.revenue.techs.callbacks'),
          t('reports.techs.csv.billedLater'),
          t('reports.techs.csv.billedEarlier'),
          t('reports.techs.csv.notBilled'),
          t('reports.techs.csv.agreement', { agreement: getName('agreement') }),
        ],
        comparisonHeaders: ['jobs', 'revenue', 'onSiteHours', 'callbacks'].map((k) =>
          t(`reports.techs.csv.comparison.${k}`, { window: comparisonName }),
        ),
        name: nameOf,
        unattributed: {
          noWorkOrder: t('reports.techs.csv.noWorkOrder', { workOrder: getName('work_order') }),
          noTechArrived: t('reports.techs.csv.noTechArrived', { tech: getName('technician') }),
        },
        total: t('dashboard.revenue.techs.total'),
      });
      const file = `tech-productivity-${range.kind === 'period' ? range.id : `${data.periodStart}-to-${data.asOf}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.techs.exported', { file }));
    } catch {
      showError(t('reports.techs.exportFailed'));
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !data)
    body = (
      <ErrorState
        title={t('reports.techs.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else
    body = (
      <>
        <Summary data={data} cmpLine={cmpLine} />
        {data.totalRevenue === 0 && data.technicians.length === 0 ? (
          <EmptyState
            title={t('reports.techs.empty.title', { invoices: getName('invoice', true).toLowerCase() })}
            description={t('reports.techs.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <TechTable
            data={data}
            comparisonLabel={comparisonName}
            nameOf={nameOf}
            onOpen={(userId) => update({ [TECH_PARAM]: userId })}
          />
        )}
      </>
    );

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.techs.title', words)}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={exportCsv} disabled={!data}>
            <ArrowDownTrayIcon data-slot="icon" />
            {t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} />
      </div>
      <RangeProblem state={state} />
      <div className="rp-stack">{body}</div>
      <TechCreditDrawer
        row={openRow}
        name={openRow ? nameOf(openRow.name) : ''}
        period={undefined}
        range={data ? { from: data.periodStart, to: data.asOf } : undefined}
        regionIds={scope}
        periodLabel={data ? formatSpan(data.periodStart, data.asOf) : ''}
        onClose={() => update({ [TECH_PARAM]: null })}
      />
    </div>
  );
}

function Summary({ data, cmpLine }: { data: TechnicianProductivityResponse; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const words = {
    tech: getName('technician'),
    techs: getName('technician', true),
    workOrder: getName('work_order'),
  };
  const pct = changePct(data.totalRevenue, data.comparison?.totalRevenue ?? null);
  const credited = creditedRevenue(data);
  const share = data.totalRevenue > 0 ? Math.round((credited / data.totalRevenue) * 100) : 0;
  const coverage = callbacksCoverage(data.periodStart, data.asOf, data.callbacksTrackedSince);
  const callbacks = data.technicians.reduce((sum, r) => sum + r.callbacks, 0);
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.revenue.summary.revenue')}
        value={money(data.totalRevenue)}
        sub={
          <>
            {pct != null && <span className={pct >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>}
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.techs.summary.credited', words)}
        value={money(credited)}
        sub={t('reports.techs.summary.creditedSub', { pct: share, count: data.technicians.length, ...words })}
      />
      <SummaryCell
        label={t('dashboard.revenue.techs.unattributed')}
        value={money(unattributedAmount(data))}
        sub={t('reports.techs.summary.unattributedSub', words)}
      />
      <SummaryCell
        label={t('dashboard.revenue.techs.callbacks')}
        value={coverage === 'none' ? '—' : callbacks.toLocaleString('en-US')}
        last
        sub={
          coverage === 'none' && data.callbacksTrackedSince
            ? t('reports.techs.summary.callbacksNone', { date: longDate(data.callbacksTrackedSince) })
            : coverage === 'partial' && data.callbacksTrackedSince
              ? t('reports.techs.summary.callbacksSince', { date: longDate(data.callbacksTrackedSince) })
              : t('reports.techs.summary.callbacksSub', words)
        }
      />
    </div>
  );
}
