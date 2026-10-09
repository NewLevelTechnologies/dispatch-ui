// Reports → Quotes. Home's funnel over any range: quotes first sent in the
// range, by where they stand now, compared and scoped, by who sent them. The
// figures are the server's, from the same rule as Home's card. Every count
// opens the Quotes list on the same quotes. State lives in the URL (`range`,
// `compare`, `region`, `group`; `from=home` when Home sent you).
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  quoteReportApi,
  quotesApi,
  userApi,
  type ArAgingBucket,
  type Quote,
  type QuoteReport,
  type QuoteReportGroupBy,
  type QuoteStatus,
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
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { money } from '../features/home/revenueSelectors';
import { csvLines, downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';
import { changePct, formatPct, formatSpan, rangeName, windowName } from '../features/reports/revenueModel';
import { formatPoints, formatRate, pointsChange } from '../features/reports/arrivalsModel';

const GROUP_BYS: QuoteReportGroupBy[] = ['sender', 'none'];
const DEFAULT_GROUP: QuoteReportGroupBy = 'sender';
const DASH = '—';
const EXPORT_PAGE = 200;

// The funnel's rows, and the Quotes list status each opens (viewed has none).
const FUNNEL: { id: 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'open'; status?: QuoteStatus }[] = [
  { id: 'sent' },
  { id: 'viewed' },
  { id: 'accepted', status: 'ACCEPTED' },
  { id: 'declined', status: 'DECLINED' },
  { id: 'expired', status: 'EXPIRED' },
  { id: 'open', status: 'SENT' },
];

const formatDays = (d: number | null | undefined) => (d == null ? DASH : `${d.toFixed(1)} d`);

/** The Quotes list on a slice of the report: its dates, scope and filter. */
function quotesHref(report: QuoteReport, scope: string[] | undefined, extra: Record<string, string>): string {
  const qs = new URLSearchParams({
    sentFrom: report.from,
    sentTo: report.to,
    ...(scope?.length ? { region: scope[0] } : {}),
    ...extra,
  });
  return `/quotes?${qs.toString()}`;
}

export default function QuotesReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const zone = useTenantTimeZone();
  const state = useReportRange();
  const { range, compare, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as QuoteReportGroupBy | null;
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) ? groupRaw : DEFAULT_GROUP;

  const query = useQuery({
    queryKey: ['quote-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () => quoteReportApi.get({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = query.data;

  // Sender names, departed users included.
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));
  const senderName = (id: string | null) =>
    id ? (names.get(id) ?? t('dashboard.revenue.techs.formerUser')) : t('reports.quotes.noSender');

  const quotes = getName('quote', true);
  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.quotes.subToDate' : 'reports.quotes.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        entities: quotes,
      })
    : rangeName(range);

  // Every quote in the cohort, from the list the counts open, so the rows are the report's.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: Quote[] = [];
      for (let page = 0; ; page++) {
        const res = await quotesApi.getAll({
          firstSentFrom: report.from,
          firstSentTo: report.to,
          regionIds: scope,
          sort: 'firstSentAt,asc',
          page,
          size: EXPORT_PAGE,
        });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const day = (iso: string | null | undefined) => (iso ? (zonedDate(iso, zone) ?? '') : '');
      const csv = csvLines([
        [
          t('reports.quotes.csv.number', { entity: getName('quote') }),
          t('reports.quotes.csv.firstSent'),
          t('quotes.table.sentBy'),
          t('quotes.table.status'),
          t('reports.quotes.csv.viewed'),
          t('reports.quotes.csv.decided'),
          t('reports.quotes.csv.total'),
        ],
        ...rows.map((q) => [
          q.quoteNumber,
          day(q.firstSentAt),
          q.firstSentByName ?? '',
          t(`quotes.status.${q.status.toLowerCase()}`),
          day(q.firstViewedAt),
          day(q.decidedAt),
          q.totalAmount.toFixed(2),
        ]),
      ]);
      const file = `quotes-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.quotes.exported', { file, count: rows.length, entities: quotes.toLowerCase() }));
    } catch {
      showError(t('reports.quotes.exportFailed', { entities: quotes.toLowerCase() }));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.quotes.loadFailed', { entities: quotes.toLowerCase() })}
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
        <Summary report={report} cmpLine={cmpLine} />
        {report.sent.count === 0 ? (
          <EmptyState
            title={t('reports.quotes.empty.title', { entities: quotes.toLowerCase() })}
            description={t('reports.quotes.empty.body', { range: rangeName(range) })}
          />
        ) : (
          <>
            <Funnel report={report} scope={scope} comparisonLabel={comparisonName} />
            {groupBy === 'sender' && (
              <SendersTable report={report} scope={scope} nameOf={senderName} comparisonLabel={comparisonName} />
            )}
          </>
        )}
      </>
    );

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={quotes}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || report.sent.count === 0}>
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
          displayValue={t(`reports.quotes.groupBy.${groupBy}`)}
          onChange={(v) => update({ group: v && v !== DEFAULT_GROUP ? v : null })}
        >
          {GROUP_BYS.map((g) => (
            <ChipListboxOption key={g} value={g}>
              {t(`reports.quotes.groupBy.${g}`)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      </div>
      <RangeProblem state={state} />
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function Pct({ pct, lowerIsBetter = false }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct == null) return null;
  const good = lowerIsBetter ? pct <= 0 : pct >= 0;
  return <span className={good ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>;
}

function Points({ pts }: { pts: number | null }) {
  if (pts == null) return null;
  return <span className={pts >= 0 ? 'rp-change up' : 'rp-change down'}>{formatPoints(pts)} </span>;
}

function Summary({ report, cmpLine }: { report: QuoteReport; cmpLine: string }) {
  const { t } = useTranslation();
  const c = report.comparison;
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.quotes.summary.sent')}
        value={report.sent.count.toLocaleString('en-US')}
        sub={
          <>
            <Pct pct={changePct(report.sent.count, c?.sent.count ?? null)} />
            {t('reports.quotes.summary.sentSub', { amount: money(report.sent.amount), vs: cmpLine })}
          </>
        }
      />
      <SummaryCell
        label={t('reports.quotes.summary.winRate')}
        value={formatRate(report.winRate)}
        sub={
          <>
            <Points pts={pointsChange(report.winRate, c?.winRate)} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.quotes.summary.decision')}
        value={formatDays(report.averageDaysToDecision)}
        sub={
          report.averageDaysToDecision != null ? (
            <>
              <Pct pct={changePct(report.averageDaysToDecision, c?.averageDaysToDecision ?? null)} lowerIsBetter />
              {cmpLine}
            </>
          ) : (
            t('reports.quotes.summary.decisionNone')
          )
        }
      />
      <SummaryCell
        label={t('reports.quotes.summary.open')}
        value={money(report.open.amount)}
        last
        sub={t('reports.quotes.summary.openSub', { count: report.open.count })}
      />
    </div>
  );
}

function Funnel({
  report,
  scope,
  comparisonLabel,
}: {
  report: QuoteReport;
  scope: string[] | undefined;
  comparisonLabel: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.quotes.funnel.title')}</CardTitle>
        <CardSub>{t('reports.quotes.funnel.hint', { entities: getName('quote', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('reports.quotes.funnel.stage')}</th>
                <th className="right">{getName('quote', true)}</th>
                <th className="right">{t('reports.quotes.funnel.amount')}</th>
                <th>{t('reports.quotes.funnel.share')}</th>
                {c && <th className="right">{comparisonLabel}</th>}
                {c && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {FUNNEL.map((row) => {
                const b: ArAgingBucket = report[row.id];
                const share = report.sent.count > 0 ? (b.count / report.sent.count) * 100 : 0;
                const href = row.id === 'viewed' ? null : quotesHref(report, scope, row.status ? { status: row.status } : {});
                return (
                  <DenseRow key={row.id} data-testid={`funnel-${row.id}`}>
                    <td className="strong">{t(`reports.quotes.funnel.${row.id}`)}</td>
                    <td className="right num">
                      {href && b.count > 0 ? (
                        <RouterLink to={href} className="text-fg-accent hover:underline">
                          {b.count.toLocaleString('en-US')}
                        </RouterLink>
                      ) : (
                        b.count.toLocaleString('en-US')
                      )}
                    </td>
                    <td className="right num">{money(b.amount)}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${share}%` }} />
                        </span>
                        <span className="num">{Math.round(share)}%</span>
                      </span>
                    </td>
                    {c && <td className="right num muted-cell">{c[row.id].count.toLocaleString('en-US')}</td>}
                    {c && (
                      <td className="right num">
                        <Pct pct={changePct(b.count, c[row.id].count)} lowerIsBetter={row.id === 'declined' || row.id === 'expired'} />
                      </td>
                    )}
                  </DenseRow>
                );
              })}
            </tbody>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

function SendersTable({
  report,
  scope,
  nameOf,
  comparisonLabel,
}: {
  report: QuoteReport;
  scope: string[] | undefined;
  nameOf: (id: string | null) => string;
  comparisonLabel: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const hasCmp = report.comparison != null;
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.quotes.senders.title')}</CardTitle>
        <CardSub>{t('reports.quotes.senders.hint', { entities: getName('quote', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('quotes.table.sentBy')}</th>
                <th className="right">{t('reports.quotes.funnel.sent')}</th>
                <th className="right">{t('reports.quotes.funnel.amount')}</th>
                <th className="right">{t('reports.quotes.funnel.viewed')}</th>
                <th className="right">{t('reports.quotes.funnel.accepted')}</th>
                <th className="right">{t('reports.quotes.funnel.declined')}</th>
                <th className="right">{t('reports.quotes.summary.winRate')}</th>
                <th className="right rp-opt">{t('reports.quotes.senders.decision')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => (
                <DenseRow
                  key={g.id ?? 'none'}
                  className={clsx(g.id && 'rp-group')}
                  onClick={g.id ? () => navigate(quotesHref(report, scope, { sender: g.id! })) : undefined}
                  data-testid="report-group"
                >
                  <td>
                    <span className={g.id ? 'strong' : 'text-fg-muted'}>{nameOf(g.id)}</span>
                  </td>
                  <td className="right num">{g.sent.count.toLocaleString('en-US')}</td>
                  <td className="right num">{money(g.sent.amount)}</td>
                  <td className="right num">{g.viewed.count.toLocaleString('en-US')}</td>
                  <td className="right num">{g.accepted.count.toLocaleString('en-US')}</td>
                  <td className="right num">{g.declined.count.toLocaleString('en-US')}</td>
                  <td className="right num strong">{formatRate(g.winRate)}</td>
                  <td className="right num rp-opt">{formatDays(g.averageDaysToDecision)}</td>
                  {hasCmp && <td className="right num muted-cell">{formatRate(g.comparisonWinRate)}</td>}
                  {hasCmp && (
                    <td className="right num">
                      <Points pts={pointsChange(g.winRate, g.comparisonWinRate)} />
                    </td>
                  )}
                </DenseRow>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.sent.count.toLocaleString('en-US')}</td>
                <td className="right num">{money(report.sent.amount)}</td>
                <td className="right num">{report.viewed.count.toLocaleString('en-US')}</td>
                <td className="right num">{report.accepted.count.toLocaleString('en-US')}</td>
                <td className="right num">{report.declined.count.toLocaleString('en-US')}</td>
                <td className="right num strong">{formatRate(report.winRate)}</td>
                <td className="right num rp-opt">{formatDays(report.averageDaysToDecision)}</td>
                {hasCmp && <td className="right num muted-cell">{formatRate(report.comparison?.winRate)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Points pts={pointsChange(report.winRate, report.comparison?.winRate)} />
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
