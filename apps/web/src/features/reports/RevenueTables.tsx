// The report's table: billed split by a grouping, each row expanding to its
// newest invoices, or (grouped by nothing) the invoices themselves, paged.
// Every list read uses the drill-down rule (the report's dates and scope,
// `billed=true`, the group's filter), so its count is the group's count.
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import { invoicesApi, type InvoiceListItemRow, type RevenueReport } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Link } from '../../components/catalyst/link';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/catalyst/button';
import { money } from '../home/revenueSelectors';
import { INVOICE_PAGE_PARAM, changePct, formatPct, groupFilter, invoicesHref, reportInvoiceParams } from './revenueModel';

const DASH = '—';
const PREVIEW = 4;
const PAGE_SIZE = 25;

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Change({ current, previous }: { current: number; previous: number | null }) {
  const pct = changePct(current, previous);
  if (pct == null) return <span className="text-fg-muted">{DASH}</span>;
  return <span className={clsx('rp-change', pct >= 0 ? 'up' : 'down')}>{formatPct(pct)}</span>;
}

export function RevenueGroupsTable({
  report,
  scope,
  groupLabel,
  nameOf,
  comparisonLabel,
}: {
  report: RevenueReport;
  scope: string[] | undefined;
  /** "Division", "Job type", "Region". */
  groupLabel: string;
  /** A group's name; `null` is the unassigned group. */
  nameOf: (id: string | null) => string;
  /** "Sep 2025"; null with no comparison. */
  comparisonLabel: string | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hasCmp = report.comparison != null;
  const keyOf = (id: string | null) => id ?? 'none';
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const cols = hasCmp ? 7 : 5;

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>{t('reports.revenue.table.hint', { entities: getName('invoice', true).toLowerCase() })}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{getName('invoice', true)}</th>
                <th className="right">{t('reports.revenue.table.revenue')}</th>
                <th>{t('reports.revenue.table.share')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
                <th className="right rp-opt">{t('reports.revenue.table.avg', { entity: getName('invoice') })}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const key = keyOf(g.id);
                const isOpen = open.has(key);
                const share = report.billed > 0 ? (g.billed / report.billed) * 100 : 0;
                return (
                  <Fragment key={key}>
                    <DenseRow
                      className="rp-group"
                      onClick={() => toggle(key)}
                      aria-expanded={isOpen}
                      data-testid="report-group"
                    >
                      <td>
                        <span className="rp-group-name">
                          <ChevronRightIcon className={clsx('rp-caret size-3', isOpen && 'open')} />
                          <span className={g.id ? 'strong' : 'text-fg-muted'}>{nameOf(g.id)}</span>
                        </span>
                      </td>
                      <td className="right num">{g.invoiceCount.toLocaleString('en-US')}</td>
                      <td className="right num strong">{money(g.billed)}</td>
                      <td>
                        <span className="rp-share">
                          <span className="rp-prog">
                            <span style={{ width: `${share}%` }} />
                          </span>
                          <span className="num">{Math.round(share)}%</span>
                        </span>
                      </td>
                      {hasCmp && <td className="right num muted-cell">{money(g.comparisonBilled ?? 0)}</td>}
                      {hasCmp && (
                        <td className="right num">
                          <Change current={g.billed} previous={g.comparisonBilled} />
                        </td>
                      )}
                      <td className="right num rp-opt">{g.invoiceCount ? money(g.billed / g.invoiceCount) : DASH}</td>
                    </DenseRow>
                    {isOpen && (
                      <GroupPreview
                        report={report}
                        scope={scope}
                        id={g.id}
                        count={g.invoiceCount}
                        cols={cols}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.invoiceCount.toLocaleString('en-US')}</td>
                <td className="right num strong">{money(report.billed)}</td>
                <td />
                {hasCmp && <td className="right num muted-cell">{money(report.comparison!.billed)}</td>}
                {hasCmp && (
                  <td className="right num">
                    <Change current={report.billed} previous={report.comparison!.billed} />
                  </td>
                )}
                <td className="right num rp-opt">
                  {report.invoiceCount ? money(report.billed / report.invoiceCount) : DASH}
                </td>
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

/** A group's newest invoices under its row, and the way to all of them. */
function GroupPreview({
  report,
  scope,
  id,
  count,
  cols,
}: {
  report: RevenueReport;
  scope: string[] | undefined;
  id: string | null;
  count: number;
  cols: number;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const params = { ...reportInvoiceParams(report, scope), ...groupFilter(report.groupBy, id), page: 0, size: PREVIEW };
  const query = useQuery({
    queryKey: ['invoices', 'revenue-report', params],
    queryFn: () => invoicesApi.getAll(params),
    enabled: count > 0,
  });

  if (count > 0 && query.isLoading)
    return (
      <tr className="rp-detail">
        <td colSpan={cols}>
          <span className="rp-detail-note">{t('reports.loading')}</span>
        </td>
      </tr>
    );

  const rows = query.data?.content ?? [];
  return (
    <>
      {rows.map((inv) => (
        <tr key={inv.id} className="rp-detail" data-testid="report-group-invoice">
          <td>
            <span className="rp-detail-lead">
              <span className="mono">{inv.invoiceNumber}</span>
              <span>{inv.customerName ?? DASH}</span>
            </span>
          </td>
          <td className="right num muted-cell">{shortDate(inv.invoiceDate)}</td>
          <td className="right num">{money(inv.totalAmount)}</td>
          <td colSpan={cols - 3}>
            <WorkOrderLink row={inv} />
          </td>
        </tr>
      ))}
      <tr className="rp-detail">
        <td colSpan={cols}>
          <span className="rp-detail-note">
            {query.isError
              ? t('reports.revenue.table.previewFailed')
              : t('reports.revenue.table.showing', {
                  shown: rows.length,
                  count: count.toLocaleString('en-US'),
                })}
            {' · '}
            <Link href={invoicesHref(report, scope, { groupBy: report.groupBy, id })} className="text-fg-accent hover:underline">
              {t('reports.revenue.table.viewAll', { entities: getName('invoice', true) })}
            </Link>
          </span>
        </td>
      </tr>
    </>
  );
}

function WorkOrderLink({ row }: { row: InvoiceListItemRow }) {
  if (!row.workOrderId || !row.workOrderNumber) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <Link href={`/work-orders/${row.workOrderId}`} className="mono text-fg-accent hover:underline">
      {row.workOrderNumber}
    </Link>
  );
}

/** Grouped by nothing: the report's invoices, newest first, paged in the URL. */
export function RevenueInvoiceList({ report, scope }: { report: RevenueReport; scope: string[] | undefined }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(INVOICE_PAGE_PARAM);
  const params = { ...reportInvoiceParams(report, scope), page: page - 1, size: PAGE_SIZE };
  const query = useQuery({
    queryKey: ['invoices', 'revenue-report', params],
    queryFn: () => invoicesApi.getAll(params),
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
                <th>{t('reports.revenue.table.issued')}</th>
                <th>{getName('customer')}</th>
                <th>{getName('work_order')}</th>
                <th className="right">{t('reports.revenue.table.total')}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {data.content.map((inv) => (
                <DenseRow key={inv.id} data-testid="report-invoice">
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td className="num muted-cell">{shortDate(inv.invoiceDate)}</td>
                  <td className="strong">{inv.customerName ?? DASH}</td>
                  <td>
                    <WorkOrderLink row={inv} />
                  </td>
                  <td className="right num">{money(inv.totalAmount)}</td>
                </DenseRow>
              ))}
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
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}
