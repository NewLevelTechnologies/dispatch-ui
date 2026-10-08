// Reports → Receivables. What was owed at the end of a given day, aged from
// that day: the month-end close question. The open set is the server's rule
// (issued by then, not voided or cancelled by then, a balance left after the
// payments dated by then), and each bucket opens its invoices. State lives in
// the URL (`asOf`, `region`, `bucket`, `invPage`; `from=home` when Home sent you).
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  dispatchRegionApi,
  invoicesApi,
  receivablesReportApi,
  type InvoiceListItemRow,
  type ListInvoicesParams,
  type ReceivablesReport as Report,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { useUrlPage } from '../hooks/useUrlPage';
import { zonedDate } from '../lib/boardTime';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { Link } from '../components/catalyst/link';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { money } from '../features/home/revenueSelectors';
import { downloadCsv } from '../features/reports/csv';
import {
  AS_OF_PRESETS,
  BUCKETS,
  DEFAULT_AS_OF,
  bucketByFilter,
  daysPastDue,
  longDay,
  openCount,
  receivablesCsv,
  resolveAsOf,
  type BucketKey,
} from '../features/reports/receivablesModel';

const DASH = '—';
const PICK = 'date';
const PAGE_PARAM = 'invPage';
const PAGE_SIZE = 25;
// The list endpoint's page cap.
const EXPORT_PAGE = 200;

const DATE_INPUT =
  'h-8 rounded-md border border-border bg-bg-elev px-2 text-[12.5px] text-fg outline-none ' +
  'hover:border-border-strong focus:border-accent-500/60 ' +
  '[color-scheme:light] [.theme-dark_&]:[color-scheme:dark]';

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function ReceivablesReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();

  const asOf = resolveAsOf(searchParams.get('asOf'), today);
  const regionId = searchParams.get('region');
  const scope = regionId ? [regionId] : undefined;
  const bucket = bucketByFilter(searchParams.get('bucket'));
  const fromHome = searchParams.get('from') === 'home';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    // Any new question starts the list over.
    next.delete(PAGE_PARAM);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };
  // Picking "a date" starts from the date on screen; the input then changes it.
  const pickAsOf = (v: string | null) =>
    update({ asOf: v === PICK ? asOf.date : v && v !== DEFAULT_AS_OF ? v : null });
  const [badDate, setBadDate] = useState(false);
  const setDate = (v: string) => {
    setBadDate(!!v && v > today);
    if (v && v <= today) update({ asOf: v });
  };

  const query = useQuery({
    queryKey: ['receivables-report', asOf.date, scope],
    queryFn: () => receivablesReportApi.get({ asOf: asOf.date, regionIds: scope }),
  });
  const report = query.data;

  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  const { data: allRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'all'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });
  const regionNames = new Map(allRegions.map((r) => [r.id, r.name]));

  const bucketName = (key: BucketKey) => t(`reports.receivables.buckets.${key}`);
  const listParams = (b = bucket): ListInvoicesParams => ({
    openAsOf: asOf.date,
    ...(b ? { agingBucket: b.filter } : {}),
    ...(scope ? { regionIds: scope } : {}),
    sort: 'dueDate,asc',
  });

  // Export: every invoice open on the date, oldest due first, built from the
  // list the buckets open, so the row count is the open count.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: InvoiceListItemRow[] = [];
      for (let page = 0; ; page++) {
        const res = await invoicesApi.getAll({ ...listParams(null), page, size: EXPORT_PAGE });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const csv = receivablesCsv(rows, report.asOf, {
        headers: [
          t('reports.revenue.csv.number', { entity: getName('invoice') }),
          t('reports.receivables.csv.issued'),
          t('reports.receivables.csv.due'),
          t('reports.receivables.csv.daysPastDue', { date: report.asOf }),
          t('reports.receivables.csv.bucket', { date: report.asOf }),
          getName('customer'),
          getName('work_order'),
          getName('dispatch_region'),
          t('reports.revenue.csv.total'),
          t('reports.receivables.table.balanceToday'),
        ],
        bucket: bucketName,
        region: (id) => (id ? (regionNames.get(id) ?? '') : ''),
      });
      const file = `receivables-${report.asOf}.csv`;
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

  const asOfName = asOf.kind === 'date' ? longDay(asOf.date) : t(`reports.receivables.asOf.${asOf.kind}`);
  const sub = t('reports.receivables.sub', {
    date: longDay(asOf.date),
    invoices: getName('invoice', true).toLowerCase(),
    payments: getName('payment', true).toLowerCase(),
  });

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.receivables.loadFailed')}
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
        <Summary report={report} />
        {openCount(report) === 0 ? (
          <EmptyState
            title={t('reports.receivables.empty.title', { invoices: getName('invoice', true).toLowerCase() })}
            description={t('reports.receivables.empty.body', {
              date: longDay(report.asOf),
              invoice: getName('invoice').toLowerCase(),
            })}
          />
        ) : (
          <>
            <BucketsTable
              report={report}
              selected={bucket?.key ?? null}
              onSelect={(key) =>
                update({ bucket: key && key !== bucket?.key ? BUCKETS.find((b) => b.key === key)!.filter : null })
              }
            />
            <OpenInvoices
              params={listParams()}
              asOf={report.asOf}
              title={
                bucket
                  ? t('reports.receivables.list.bucket', {
                      invoices: getName('invoice', true),
                      bucket: bucketName(bucket.key),
                    })
                  : t('reports.receivables.list.all', { invoices: getName('invoice', true) })
              }
            />
          </>
        )}
      </>
    );

  const homeHref = `/dashboard?${new URLSearchParams({ view: 'rev', ...(regionId ? { region: regionId } : {}) }).toString()}`;

  return (
    <div className="rp-page">
      <RouterLink to={fromHome ? homeHref : '/reports'} className="rp-back">
        <ArrowLeftIcon className="size-3.5" />
        {fromHome ? t('reports.range.backHome') : t('reports.title')}
      </RouterLink>
      <PageHead
        title={t('reports.receivables.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <FilterChipListbox
          label={t('reports.receivables.filters.asOf')}
          ariaLabel={t('reports.receivables.filters.asOf')}
          value={asOf.kind}
          displayValue={asOfName}
          onChange={pickAsOf}
        >
          {AS_OF_PRESETS.map((p) => (
            <ChipListboxOption key={p} value={p}>
              {t(`reports.receivables.asOf.${p}`)}
            </ChipListboxOption>
          ))}
          <ChipListboxOption value={PICK}>{t('reports.receivables.asOf.pick')}</ChipListboxOption>
        </FilterChipListbox>
        {asOf.kind === 'date' && (
          <input
            type="date"
            aria-label={t('reports.receivables.filters.date')}
            value={asOf.date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className={DATE_INPUT}
          />
        )}
        {regions.length > 1 && (
          <FilterChipListbox
            label={regionId ? t('dashboard.scope.label') : t('dashboard.scope.labelAll')}
            ariaLabel={t('dashboard.scope.label')}
            value={regionId}
            displayValue={regions.find((r) => r.id === regionId)?.name ?? null}
            resetLabel={t('dashboard.scope.all')}
            onChange={(id) => update({ region: id })}
            onClear={() => update({ region: null })}
          >
            {regions.map((r) => (
              <ChipListboxOption key={r.id} value={r.id}>
                {r.name}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}
      </div>
      {badDate && (
        <p className="rp-filter-error" role="alert">
          {t('reports.receivables.filters.future')}
        </p>
      )}
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function Summary({ report }: { report: Report }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const invoices = (count: number) =>
    t('reports.receivables.summary.count', {
      count,
      invoices: getName('invoice', true).toLowerCase(),
      invoice: getName('invoice').toLowerCase(),
    });
  const pct = (n: number) => (report.outstanding > 0 ? Math.round((n / report.outstanding) * 100) : 0);
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.receivables.summary.outstanding')}
        value={money(report.outstanding)}
        sub={invoices(openCount(report))}
      />
      <SummaryCell
        label={t('reports.receivables.buckets.current')}
        value={money(report.current.amount)}
        sub={t('reports.receivables.summary.share', { pct: pct(report.current.amount), detail: invoices(report.current.count) })}
      />
      <SummaryCell
        label={t('reports.receivables.summary.overdue')}
        value={money(report.overdue.amount)}
        sub={t('reports.receivables.summary.share', { pct: pct(report.overdue.amount), detail: invoices(report.overdue.count) })}
      />
      <SummaryCell
        label={t('reports.receivables.buckets.days91Plus')}
        value={money(report.days91Plus.amount)}
        last
        sub={t('reports.receivables.summary.share', { pct: pct(report.days91Plus.amount), detail: invoices(report.days91Plus.count) })}
      />
    </div>
  );
}

/** The five buckets; a row shows its invoices below, clicking it again shows them all. */
function BucketsTable({
  report,
  selected,
  onSelect,
}: {
  report: Report;
  selected: BucketKey | null;
  onSelect: (key: BucketKey) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.receivables.table.title')}</CardTitle>
        <CardSub>{t('reports.receivables.table.hint', { invoices: getName('invoice', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('reports.receivables.table.age')}</th>
                <th className="right">{getName('invoice', true)}</th>
                <th className="right">{t('reports.receivables.table.amount')}</th>
                <th>{t('reports.revenue.table.share')}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {BUCKETS.map((b) => {
                const row = report[b.key];
                const share = report.outstanding > 0 ? (row.amount / report.outstanding) * 100 : 0;
                return (
                  <DenseRow
                    key={b.key}
                    className={clsx('rp-group', selected === b.key && 'rp-selected')}
                    onClick={() => onSelect(b.key)}
                    aria-pressed={selected === b.key}
                    data-testid="report-bucket"
                  >
                    <td>
                      <span className="rp-group-name">
                        <span className="rp-dot" style={{ background: `var(--${b.tone}-500)` }} />
                        <span className="strong">{t(`reports.receivables.buckets.${b.key}`)}</span>
                      </span>
                    </td>
                    <td className="right num">{row.count.toLocaleString('en-US')}</td>
                    <td className="right num strong">{formatCurrency(row.amount)}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${share}%`, background: `var(--${b.tone}-500)` }} />
                        </span>
                        <span className="num">{Math.round(share)}%</span>
                      </span>
                    </td>
                  </DenseRow>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{openCount(report).toLocaleString('en-US')}</td>
                <td className="right num strong">{formatCurrency(report.outstanding)}</td>
                <td />
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

/** The open invoices (all, or one bucket's), oldest due first, paged in the URL. */
function OpenInvoices({
  params,
  asOf,
  title,
}: {
  params: ListInvoicesParams;
  asOf: string;
  title: string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(PAGE_PARAM);
  const full = { ...params, page: page - 1, size: PAGE_SIZE };
  const query = useQuery({
    queryKey: ['invoices', 'receivables-report', full],
    queryFn: () => invoicesApi.getAll(full),
  });

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !query.data)
    body = (
      <ErrorState
        title={t('reports.revenue.table.listFailed', { entities: getName('invoice', true).toLowerCase() })}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const data = query.data;
    const first = data.totalElements ? data.page * data.size + 1 : 0;
    const last = data.page * data.size + data.content.length;
    body = (
      <>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{getName('invoice')}</th>
                <th>{t('reports.receivables.csv.issued')}</th>
                <th>{t('reports.receivables.csv.due')}</th>
                <th className="right">{t('reports.receivables.table.daysPastDue')}</th>
                <th>{getName('customer')}</th>
                <th>{getName('work_order')}</th>
                <th className="right">{t('reports.revenue.table.total')}</th>
                <th className="right" title={t('reports.receivables.table.balanceTodayHint', {
                  payments: getName('payment', true).toLowerCase(),
                })}>
                  {t('reports.receivables.table.balanceToday')}
                </th>
              </tr>
            </DenseTHead>
            <tbody>
              {data.content.map((inv) => {
                const late = daysPastDue(inv.dueDate, asOf);
                return (
                  <DenseRow key={inv.id} data-testid="report-invoice">
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td className="num muted-cell">{shortDate(inv.invoiceDate)}</td>
                    <td className="num muted-cell">{shortDate(inv.dueDate)}</td>
                    <td className={clsx('right num', late > 0 && 'strong')}>{late > 0 ? late : DASH}</td>
                    <td className="strong">{inv.customerName ?? DASH}</td>
                    <td>
                      {inv.workOrderId && inv.workOrderNumber ? (
                        <Link href={`/work-orders/${inv.workOrderId}`} className="mono text-fg-accent hover:underline">
                          {inv.workOrderNumber}
                        </Link>
                      ) : (
                        <span className="text-fg-muted">{DASH}</span>
                      )}
                    </td>
                    <td className="right num">{formatCurrency(inv.totalAmount)}</td>
                    <td className="right num muted-cell">{formatCurrency(inv.balanceDue)}</td>
                  </DenseRow>
                );
              })}
            </tbody>
          </DenseTable>
        </div>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('reports.revenue.table.range', {
            first,
            last,
            count: data.totalElements,
            entities: getName('invoice', true).toLowerCase(),
          })}
        />
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{title}</CardTitle>
      </CardHead>
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}
