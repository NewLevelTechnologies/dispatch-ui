// Reports → Agreements. Recurring revenue's movement over any range: where it
// started, every line that moved it (new, renewals that changed price,
// repricing, suspensions, cancellations, expiries…) and where it ended, which
// for a range ending today is Home's recurring figure. Lines are signed, so
// start + lines = end to the cent. History begins when events were first
// recorded; before that the start is unknown, and the page says so. Visit
// completion rides along. State lives in the URL (`range`, `compare`,
// `region`; `line` and `evPage` for the events list).
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  workOrderReportsApi,
  type AgreementBridge,
  type AgreementEventKind,
  type AgreementEventRow,
  type AgreementsReport as Report,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlPage } from '../hooks/useUrlPage';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Callout } from '../components/ui/Callout';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ListFooter } from '../components/ui/ListFooter';
import { longDate } from '../features/home/revenueSelectors';
import { csvLines, downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';
import { changePct, formatPct, formatSpan, rangeName, windowName } from '../features/reports/revenueModel';

type LineKey = 'new' | 'renewed' | 'repriced' | 'resumed' | 'suspended' | 'cancelled' | 'expired' | 'returnedToDraft';

// The bridge's lines in reading order (gains first), and the event kind behind each.
const LINES: { key: LineKey; kind: AgreementEventKind }[] = [
  { key: 'new', kind: 'ACTIVATED' },
  { key: 'renewed', kind: 'RENEWED' },
  { key: 'repriced', kind: 'REPRICED' },
  { key: 'resumed', kind: 'RESUMED' },
  { key: 'suspended', kind: 'SUSPENDED' },
  { key: 'cancelled', kind: 'CANCELLED' },
  { key: 'expired', kind: 'EXPIRED' },
  { key: 'returnedToDraft', kind: 'RETURNED_TO_DRAFT' },
];
const LINE_PARAM = 'line';
const PAGE_PARAM = 'evPage';
const PAGE_SIZE = 25;
const EXPORT_PAGE = 200;
const DASH = '—';
const RESET = [LINE_PARAM, PAGE_PARAM];

const cents = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
/** "+$420.00" / "−$260.00" / "$0.00". */
const signed = (n: number) => (n > 0 ? `+${cents(n)}` : n < 0 ? `−${cents(-n)}` : cents(0));
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function AgreementsReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange(RESET);
  const { range, compare, scope, searchParams, update, today } = state;
  const lineRaw = searchParams.get(LINE_PARAM) as LineKey | null;
  const line = LINES.find((l) => l.key === lineRaw) ?? null;

  const query = useQuery({
    queryKey: ['agreements-report', range.from, range.to, compare, scope],
    queryFn: () => workOrderReportsApi.agreements({ from: range.from, to: range.to, compare, regionIds: scope }),
  });
  const report = query.data;

  const agreements = getName('agreement', true);
  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.agreements.subToDate' : 'reports.agreements.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
      })
    : rangeName(range);
  const kindLabel = (r: Pick<AgreementEventRow, 'kind' | 'autoRenewed'>) =>
    r.kind === 'RENEWED' && r.autoRenewed != null
      ? t(r.autoRenewed ? 'reports.agreements.kind.RENEWED_AUTO' : 'reports.agreements.kind.RENEWED_MANUAL')
      : t(`reports.agreements.kind.${r.kind}`);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: AgreementEventRow[] = [];
      for (let page = 0; ; page++) {
        const res = await workOrderReportsApi.agreementEvents({ from: report.from, to: report.to, regionIds: scope, page, size: EXPORT_PAGE });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const csv = csvLines([
        [
          t('reports.agreements.events.date'),
          t('reports.agreements.csv.number', { entity: getName('agreement') }),
          getName('customer'),
          t('reports.agreements.events.event'),
          t('reports.agreements.events.by'),
          t('reports.agreements.csv.before'),
          t('reports.agreements.csv.after'),
          t('reports.agreements.csv.change'),
        ],
        ...rows.map((r) => [
          r.occurredOn,
          r.agreementNumber,
          r.customerName,
          kindLabel(r),
          r.userName ?? '',
          r.monthlyValueBefore.toFixed(2),
          r.monthlyValueAfter.toFixed(2),
          (r.monthlyValueAfter - r.monthlyValueBefore).toFixed(2),
        ]),
      ]);
      const file = `agreements-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.agreements.exported', { file, count: rows.length }));
    } catch {
      showError(t('reports.agreements.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.agreements.loadFailed', { entities: agreements.toLowerCase() })}
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
        {(report.recurringMonthlyAtStart == null || report.recurringMonthlyAtEnd == null) && (
          <Callout kind="info">{t('reports.agreements.untracked', { date: longDate(report.eventsTrackedSince) })}</Callout>
        )}
        <Summary report={report} cmpLine={cmpLine} />
        <Bridge
          report={report}
          comparisonLabel={comparisonName}
          picked={line?.key ?? null}
          onPick={(key) => update({ [LINE_PARAM]: key === line?.key ? null : key })}
        />
        <EventsList
          report={report}
          scope={scope}
          kind={line?.kind ?? null}
          lineName={line ? t(`reports.agreements.line.${line.key}`) : null}
          onClearLine={() => update({ [LINE_PARAM]: null })}
          kindLabel={kindLabel}
        />
      </>
    );

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={agreements}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} />
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

function Summary({ report, cmpLine }: { report: Report; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  const start = report.recurringMonthlyAtStart;
  const end = report.recurringMonthlyAtEnd;
  const net = start != null && end != null ? end - start : null;
  const v = report.visits;
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.agreements.summary.recurring')}
        value={end != null ? `${cents(end)}` : DASH}
        sub={
          <>
            <Pct current={end} previous={c?.recurringMonthlyAtEnd} />
            {t('reports.agreements.summary.recurringSub', { vs: cmpLine })}
          </>
        }
      />
      <SummaryCell
        label={t('reports.agreements.summary.net')}
        value={net != null ? signed(net) : DASH}
        sub={
          start != null
            ? t('reports.agreements.summary.netSub', { amount: cents(start) })
            : t('reports.agreements.summary.netUnknown', { date: longDate(report.eventsTrackedSince) })
        }
      />
      <SummaryCell
        label={t('reports.agreements.line.new')}
        value={signed(report.new.monthly)}
        sub={t('reports.agreements.summary.count', {
          count: report.new.count,
          entities: getName('agreement', report.new.count !== 1).toLowerCase(),
        })}
      />
      <SummaryCell
        label={t('reports.agreements.summary.visits')}
        value={v.planned > 0 ? `${Math.round((v.completed / v.planned) * 100)}%` : DASH}
        last
        sub={t('reports.agreements.summary.visitsSub', { completed: v.completed, planned: v.planned, missed: v.missed })}
      />
    </div>
  );
}

function Bridge({
  report,
  comparisonLabel,
  picked,
  onPick,
}: {
  report: Report;
  comparisonLabel: string | null;
  picked: LineKey | null;
  onPick: (key: LineKey) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c: AgreementBridge | null = report.comparison;
  const max = Math.max(1, ...LINES.map((l) => Math.abs(report[l.key].monthly)));
  const endpoint = (label: string, value: number | null, cmp: number | null | undefined, testId: string) => (
    <DenseRow className="rp-bridge-end" data-testid={testId}>
      <td className="strong">{label}</td>
      <td />
      <td className="right num strong">{value != null ? cents(value) : DASH}</td>
      <td />
      {c && <td className="right num muted-cell">{cmp != null ? cents(cmp) : DASH}</td>}
    </DenseRow>
  );
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.agreements.bridge.title')}</CardTitle>
        <CardSub>{t('reports.agreements.bridge.hint')}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('reports.agreements.bridge.line')}</th>
                <th className="right">{getName('agreement', true)}</th>
                <th className="right">{t('reports.agreements.bridge.monthly')}</th>
                <th />
                {c && <th className="right">{comparisonLabel}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {endpoint(
                t('reports.agreements.bridge.start', { date: shortDay(report.from) }),
                report.recurringMonthlyAtStart,
                c?.recurringMonthlyAtStart,
                'bridge-start',
              )}
              {LINES.map((l) => {
                const b = report[l.key];
                const width = (Math.abs(b.monthly) / max) * 100;
                return (
                  <DenseRow
                    key={l.key}
                    className={clsx(b.count > 0 && 'rp-group', l.key === picked && 'rp-selected', b.count === 0 && 'rp-quiet')}
                    onClick={b.count > 0 ? () => onPick(l.key) : undefined}
                    aria-pressed={b.count > 0 ? l.key === picked : undefined}
                    data-testid={`bridge-${l.key}`}
                  >
                    <td>
                      <div>{t(`reports.agreements.line.${l.key}`)}</div>
                      {l.key === 'renewed' && b.count > 0 && (
                        <div className="rp-sub">
                          {t('reports.agreements.bridge.renewedSub', { auto: report.renewed.auto, manual: report.renewed.manual })}
                        </div>
                      )}
                    </td>
                    <td className="right num">{b.count.toLocaleString('en-US')}</td>
                    <td className={clsx('right num strong', b.monthly > 0 && 'rp-gain', b.monthly < 0 && 'rp-loss')}>
                      {signed(b.monthly)}
                    </td>
                    <td className="rp-bridge-cell">
                      {b.monthly !== 0 && (
                        <span className={clsx('rp-bridge-bar', b.monthly > 0 ? 'gain' : 'loss')} style={{ width: `${width}%` }} />
                      )}
                    </td>
                    {c && <td className="right num muted-cell">{signed(c[l.key].monthly)}</td>}
                  </DenseRow>
                );
              })}
              {endpoint(
                t('reports.agreements.bridge.end', { date: shortDay(report.to) }),
                report.recurringMonthlyAtEnd,
                c?.recurringMonthlyAtEnd,
                'bridge-end',
              )}
            </tbody>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

function EventsList({
  report,
  scope,
  kind,
  lineName,
  onClearLine,
  kindLabel,
}: {
  report: Report;
  scope: string[] | undefined;
  kind: AgreementEventKind | null;
  lineName: string | null;
  onClearLine: () => void;
  kindLabel: (r: Pick<AgreementEventRow, 'kind' | 'autoRenewed'>) => string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(PAGE_PARAM);
  const query = useQuery({
    queryKey: ['agreements-report', 'events', report.from, report.to, scope, kind, page],
    queryFn: () =>
      workOrderReportsApi.agreementEvents({
        from: report.from,
        to: report.to,
        regionIds: scope,
        kind: kind ? [kind] : undefined,
        page: page - 1,
        size: PAGE_SIZE,
      }),
  });
  const data = query.data;
  const total = data?.totalElements ?? 0;

  let content;
  if (query.isLoading) content = <LoadingState />;
  else if (query.isError || !data)
    content = (
      <ErrorState
        title={t('reports.agreements.events.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (data.content.length === 0) content = <div className="rp-note">{t('reports.agreements.events.none')}</div>;
  else
    content = (
      <>
        <DenseTable className="dense-stack">
          <DenseTHead>
            <tr>
              <th>{t('reports.agreements.events.date')}</th>
              <th>{getName('agreement')}</th>
              <th>{t('reports.agreements.events.event')}</th>
              <th>{t('reports.agreements.events.by')}</th>
              <th className="right">{t('reports.agreements.bridge.monthly')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {data.content.map((r) => {
              const delta = r.monthlyValueAfter - r.monthlyValueBefore;
              return (
                <DenseRow key={r.id} data-testid="agreement-event">
                  <td className="num">{shortDay(r.occurredOn)}</td>
                  <td data-label={getName('agreement')}>
                    <RouterLink to={`/agreements/${r.agreementId}`} className="id-mono text-fg-accent hover:underline">
                      {r.agreementNumber}
                    </RouterLink>
                    <div className="rp-sub">{r.customerName}</div>
                  </td>
                  <td data-label={t('reports.agreements.events.event')}>{kindLabel(r)}</td>
                  <td data-label={t('reports.agreements.events.by')}>{r.userName ?? DASH}</td>
                  <td className="right num" data-label={t('reports.agreements.bridge.monthly')}>
                    <div className={clsx('strong', delta > 0 && 'rp-gain', delta < 0 && 'rp-loss')}>{signed(delta)}</div>
                    {delta !== 0 && (
                      <div className="rp-sub">
                        {cents(r.monthlyValueBefore)} → {cents(r.monthlyValueAfter)}
                      </div>
                    )}
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
        <CardTitle>{t('reports.agreements.events.title')}</CardTitle>
        {lineName ? (
          <button type="button" className="rp-tech-filter" onClick={onClearLine}>
            {t('reports.arrivals.late.onlyTech', { name: lineName })}
            <XMarkIcon className="size-3" aria-label={t('reports.agreements.events.showAll')} />
          </button>
        ) : (
          <CardSub>{t('reports.agreements.events.hint')}</CardSub>
        )}
      </CardHead>
      <CardBody flush>{content}</CardBody>
    </Card>
  );
}
