// Reports → Unbilled work. Accepted quote lines and placed job purchases that
// aren't fully on an issued invoice yet, as of today (no range). Quote amounts
// are exact; PO parts are estimates priced as the line editor would (≈). An
// item on a draft invoice stays here, since a draft bills nothing. Every
// number is the server's. Rows expand to their oldest items, "View all" lists
// a group's items below the table, and an item can be dismissed as never
// billable (with a reason) from either. State lives in the URL (`source`,
// `region`, `group`, `key`).
import { Fragment, useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ArrowDownTrayIcon, ArrowLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  purchaseBillingApi,
  quoteLineBillingApi,
  unbilledReportApi,
  type UnbilledItem,
  type UnbilledReport as Report,
  type UnbilledReportGroup,
  type UnbilledReportGroupBy,
  type UnbilledReportSource,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlPage } from '../hooks/useUrlPage';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { Link } from '../components/catalyst/link';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { PageHead } from '../components/ui/PageHead';
import { Tag } from '../components/ui/Pill';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { ListFooter } from '../components/ui/ListFooter';
import { downloadBlob } from '../features/reports/csv';
import { ScopeChip } from '../features/reports/RangeChips';

const SOURCES: UnbilledReportSource[] = ['all', 'quote', 'po'];
const GROUP_BYS: UnbilledReportGroupBy[] = ['job', 'source', 'age'];
const DEFAULT_GROUP: UnbilledReportGroupBy = 'job';
const KEY_PARAM = 'key';
const PAGE_PARAM = 'itemPage';
const PAGE_SIZE = 25;
const DASH = '—';
const QUOTE_PREFIX = 'QUOTE:';
const ESTIMATE = '≈';
/** Columns: group, items, unbilled, share, oldest, action. */
const COLS = 6;

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Amount({ item }: { item: UnbilledItem }) {
  const { t } = useTranslation();
  return (
    <span title={item.estimateBasis ? t(`reports.unbilled.basis.${item.estimateBasis}`) : undefined}>
      {item.estimate && `${ESTIMATE} `}
      {formatCurrency(item.amount)}
    </span>
  );
}

/** Where a job group opens: the WO's Quotes & invoices tab, or the quote itself. */
function jobHref(g: UnbilledReportGroup): string | null {
  if (g.job?.workOrderId) return `/work-orders/${g.job.workOrderId}?tab=estimate`;
  if (g.key.startsWith(QUOTE_PREFIX)) return `/quotes/${g.key.slice(QUOTE_PREFIX.length)}`;
  return null;
}

export default function UnbilledReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceRaw = searchParams.get('source') as UnbilledReportSource | null;
  const source = sourceRaw && SOURCES.includes(sourceRaw) ? sourceRaw : 'all';
  const groupRaw = searchParams.get('group') as UnbilledReportGroupBy | null;
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) ? groupRaw : DEFAULT_GROUP;
  const regionId = searchParams.get('region');
  const scope = regionId ? [regionId] : undefined;
  const openKey = searchParams.get(KEY_PARAM);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    // Any new question closes the drill-in; a change can then reopen it.
    next.delete(KEY_PARAM);
    next.delete(PAGE_PARAM);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const params = { source, groupBy, regionIds: scope };
  const query = useQuery({
    queryKey: ['unbilled-report', params],
    queryFn: () => unbilledReportApi.get(params),
  });
  const report = query.data;
  const [dismissing, setDismissing] = useState<UnbilledItem | null>(null);

  const sourceWord = (s: UnbilledReportSource) => t(`reports.unbilled.source.${s}`);
  const groupWord = (g: UnbilledReportGroupBy) =>
    g === 'job' ? getName('work_order') : t(`reports.unbilled.groupBy.${g}`);
  const sub = t('reports.unbilled.sub', {
    date: report ? longDay(report.asOf) : t('reports.unbilled.today'),
    invoice: getName('invoice').toLowerCase(),
  });
  const empty = !!report && report.summary.itemCount === 0;

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await unbilledReportApi.exportCsv({ source, regionIds: scope });
      const file = 'unbilled-work.csv';
      downloadBlob(blob, file);
      showSuccess(t('reports.unbilled.exported', { file }));
    } catch {
      showError(t('reports.unbilled.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.unbilled.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (empty)
    body = (
      <>
        <Summary report={report} />
        <EmptyState title={t('reports.unbilled.empty.title')} description={t('reports.unbilled.empty.body')} />
      </>
    );
  else {
    const open = openKey ? report.groups.find((g) => g.key === openKey) : undefined;
    body = (
      <>
        <Summary report={report} />
        <GroupsTable
          report={report}
          groupLabel={groupWord(groupBy)}
          onViewAll={(key) => update({ [KEY_PARAM]: key })}
          onDismiss={setDismissing}
        />
        {open && (
          <AllItems
            params={params}
            group={open}
            title={t('reports.unbilled.list.title', { group: groupName(t, groupBy, open) })}
            onClose={() => update({ [KEY_PARAM]: null })}
            onDismiss={setDismissing}
          />
        )}
      </>
    );
  }

  return (
    <div className="rp-page rp-cq">
      <RouterLink to="/reports" className="rp-back">
        <ArrowLeftIcon className="size-3.5" />
        {t('reports.title')}
      </RouterLink>
      <PageHead
        title={t('reports.unbilled.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || empty}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <FilterChipListbox
          label={t('reports.unbilled.filters.source')}
          ariaLabel={t('reports.unbilled.filters.source')}
          value={source}
          displayValue={sourceWord(source)}
          onChange={(v) => update({ source: v && v !== 'all' ? v : null })}
        >
          {SOURCES.map((s) => (
            <ChipListboxOption key={s} value={s}>
              {sourceWord(s)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
        <ScopeChip regionId={regionId} onChange={(id) => update({ region: id })} />
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
      <div className="rp-stack">{body}</div>
      <Dialog open={!!dismissing} onClose={() => setDismissing(null)} size="md">
        {dismissing && <DismissForm item={dismissing} onDone={() => setDismissing(null)} />}
      </Dialog>
    </div>
  );
}

type T = (key: string, options?: Record<string, unknown>) => string;

function groupName(t: T, groupBy: UnbilledReportGroupBy, g: UnbilledReportGroup): string {
  if (groupBy === 'source') return t(`reports.unbilled.itemSource.${g.key}`);
  if (groupBy === 'age') return t(`reports.unbilled.age.${g.key}`);
  return g.label ?? g.job?.workOrderNumber ?? DASH;
}

function Summary({ report }: { report: Report }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const s = report.summary;
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.unbilled.summary.total')}
        value={formatCurrency(s.total)}
        sub={t('reports.unbilled.summary.totalSub', {
          items: t('reports.unbilled.summary.items', { count: s.itemCount }),
          count: s.jobCount,
          jobs: getName('work_order', s.jobCount !== 1).toLowerCase(),
        })}
      />
      <SummaryCell label={t('reports.unbilled.summary.quoted')} value={formatCurrency(s.quoted)} />
      <SummaryCell
        label={t('reports.unbilled.summary.estimated')}
        value={`${ESTIMATE} ${formatCurrency(s.estimated)}`}
        sub={t('reports.unbilled.summary.estimatedSub')}
      />
      <SummaryCell
        label={t('reports.unbilled.summary.over30')}
        value={<span className={clsx(s.overThirtyDays > 0 && 'text-warning-fg')}>{formatCurrency(s.overThirtyDays)}</span>}
        sub={t('reports.unbilled.summary.items', { count: s.overThirtyDaysCount })}
        last
      />
    </div>
  );
}

function GroupsTable({
  report,
  groupLabel,
  onViewAll,
  onDismiss,
}: {
  report: Report;
  groupLabel: string;
  onViewAll: (key: string) => void;
  onDismiss: (item: UnbilledItem) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const byJob = report.groupBy === 'job';

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>{t('reports.unbilled.table.hint')}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{t('reports.unbilled.table.items')}</th>
                <th className="right">{t('reports.unbilled.table.unbilled')}</th>
                <th className="rp-hide-sm">{t('reports.revenue.table.share')}</th>
                <th className="right">{t('reports.unbilled.table.oldest')}</th>
                <th aria-label={t('reports.unbilled.table.actions')} />
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const isOpen = open.has(g.key);
                const href = byJob ? jobHref(g) : null;
                return (
                  <Fragment key={g.key}>
                    <DenseRow
                      className="rp-group"
                      onClick={() => toggle(g.key)}
                      aria-expanded={isOpen}
                      data-testid="report-group"
                    >
                      <td>
                        <span className="rp-group-name">
                          <ChevronRightIcon className={clsx('rp-caret size-3', isOpen && 'open')} />
                          <span className={clsx('strong', byJob && 'mono')}>{groupName(t, report.groupBy, g)}</span>
                          {byJob && g.job?.billToName && (
                            <span className="rp-trunc text-fg-muted" title={g.job.billToName}>
                              {g.job.billToName}
                            </span>
                          )}
                          {byJob && g.job?.billToIsPayer && <Tag word>{getName('payer')}</Tag>}
                        </span>
                      </td>
                      <td className="right num">{g.count.toLocaleString('en-US')}</td>
                      <td className="right num strong">{formatCurrency(g.amount)}</td>
                      <td className="rp-hide-sm">
                        <span className="rp-share">
                          <span className="rp-prog rp-hide-md">
                            <span style={{ width: `${g.share * 100}%` }} />
                          </span>
                          <span className="num">{Math.round(g.share * 100)}%</span>
                        </span>
                      </td>
                      <td className={clsx('right num', g.oldestAgeDays > 30 && 'text-warning-fg')}>
                        {t('reports.unbilled.days', { count: g.oldestAgeDays })}
                      </td>
                      <td className="right">
                        {href && (
                          <RouterLink to={href} className="card-action" onClick={(e) => e.stopPropagation()}>
                            {t('reports.unbilled.table.open')}
                          </RouterLink>
                        )}
                      </td>
                    </DenseRow>
                    {isOpen && (
                      <>
                        {g.sample.map((item) => (
                          <tr key={`${item.source}-${item.itemId}`} className="rp-detail" data-testid="report-group-item">
                            <ItemCells item={item} showWorkOrder={!byJob} onDismiss={onDismiss} />
                          </tr>
                        ))}
                        <tr className="rp-detail">
                          <td colSpan={COLS}>
                            <span className="rp-detail-note">
                              {t('reports.revenue.table.showing', {
                                shown: g.sample.length,
                                count: g.count.toLocaleString('en-US'),
                              })}
                              {g.count > g.sample.length && (
                                <>
                                  {' · '}
                                  <button type="button" className="card-action" onClick={() => onViewAll(g.key)}>
                                    {t('reports.unbilled.table.viewAll')}
                                  </button>
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td className="right num">{report.total.count.toLocaleString('en-US')}</td>
                <td className="right num strong">{formatCurrency(report.total.amount)}</td>
                <td className="rp-hide-sm" />
                <td />
                <td />
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

/** Where an item came from: the quote or the PO, by number. */
function SourceRef({ item }: { item: UnbilledItem }) {
  const { getName } = useGlossary();
  if (item.source === 'QUOTE')
    return (
      <>
        {getName('quote')}{' '}
        {item.quoteId && item.quoteNumber ? (
          <Link href={`/quotes/${item.quoteId}`} className="mono text-fg-accent hover:underline">
            {item.quoteNumber}
          </Link>
        ) : (
          DASH
        )}
      </>
    );
  return (
    <>
      PO{' '}
      {item.purchaseOrderId && item.poNumber ? (
        <Link href={`/purchase-orders/${item.purchaseOrderId}`} className="mono text-fg-accent hover:underline">
          {item.poNumber}
        </Link>
      ) : (
        DASH
      )}
    </>
  );
}

function DraftNote({ item }: { item: UnbilledItem }) {
  const { t } = useTranslation();
  if (!item.onDraftInvoice) return null;
  return (
    <span className="text-fg-muted">
      {t('reports.unbilled.onDraft')}{' '}
      <Link href={`/invoices/${item.onDraftInvoice.invoiceId}`} className="mono text-fg-accent hover:underline">
        {item.onDraftInvoice.invoiceNumber}
      </Link>
    </span>
  );
}

/** An expanded row: the header's six columns, cell for cell. */
function ItemCells({
  item,
  showWorkOrder,
  onDismiss,
}: {
  item: UnbilledItem;
  showWorkOrder: boolean;
  onDismiss: (item: UnbilledItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <td>
        <span className="rp-detail-lead">
          {showWorkOrder && item.workOrderId && item.workOrderNumber && (
            <Link href={`/work-orders/${item.workOrderId}`} className="mono text-fg-accent hover:underline">
              {item.workOrderNumber}
            </Link>
          )}
          <span className="rp-trunc" title={item.description}>
            {item.description}
          </span>
          <DraftNote item={item} />
        </span>
      </td>
      <td className="right muted-cell">
        <SourceRef item={item} />
      </td>
      <td className="right num">
        <Amount item={item} />
      </td>
      <td className="rp-hide-sm" />
      <td className={clsx('right num', item.ageDays > 30 ? 'text-warning-fg' : 'muted-cell')}>
        {t('reports.unbilled.days', { count: item.ageDays })}
      </td>
      <td className="right">
        <button type="button" className="card-action" onClick={() => onDismiss(item)}>
          {t('reports.unbilled.dismiss.action')}
        </button>
      </td>
    </>
  );
}

/** One group's items, oldest first, paged in the URL. */
function AllItems({
  params,
  group,
  title,
  onClose,
  onDismiss,
}: {
  params: { source: UnbilledReportSource; groupBy: UnbilledReportGroupBy; regionIds?: string[] };
  group: UnbilledReportGroup;
  title: string;
  onClose: () => void;
  onDismiss: (item: UnbilledItem) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(PAGE_PARAM);
  const full = { ...params, groupKey: group.key, page: page - 1, size: PAGE_SIZE };
  const query = useQuery({
    queryKey: ['unbilled-report', 'rows', full],
    queryFn: () => unbilledReportApi.rows(full),
  });

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !query.data)
    body = (
      <ErrorState
        title={t('reports.unbilled.list.failed')}
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
                <th>{getName('work_order')}</th>
                <th>{t('reports.unbilled.list.description')}</th>
                <th className="rp-hide-sm">{t('reports.unbilled.list.billTo')}</th>
                <th>{t('reports.unbilled.list.source')}</th>
                <th className="rp-hide-md">{t('reports.unbilled.list.since')}</th>
                <th className="right">{t('reports.unbilled.list.age')}</th>
                <th className="right">{t('reports.unbilled.table.unbilled')}</th>
                <th aria-label={t('reports.unbilled.table.actions')} />
              </tr>
            </DenseTHead>
            <tbody>
              {data.content.map((item) => (
                <DenseRow key={`${item.source}-${item.itemId}`} data-testid="report-item">
                  <td>
                    {item.workOrderId && item.workOrderNumber ? (
                      <Link href={`/work-orders/${item.workOrderId}`} className="mono text-fg-accent hover:underline">
                        {item.workOrderNumber}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">{DASH}</span>
                    )}
                  </td>
                  <td>
                    <span className="rp-trunc" title={item.description}>
                      {item.description}
                    </span>{' '}
                    <DraftNote item={item} />
                  </td>
                  <td className="rp-hide-sm">
                    <span className="rp-trunc" title={item.billToName ?? undefined}>
                      {item.billToName ?? DASH}
                    </span>
                  </td>
                  <td className="muted-cell">
                    <SourceRef item={item} />
                  </td>
                  <td className="num muted-cell rp-hide-md">{shortDate(item.since)}</td>
                  <td className={clsx('right num', item.ageDays > 30 && 'text-warning-fg')}>
                    {t('reports.unbilled.days', { count: item.ageDays })}
                  </td>
                  <td className="right num">
                    <Amount item={item} />
                  </td>
                  <td className="right">
                    <button type="button" className="card-action" onClick={() => onDismiss(item)}>
                      {t('reports.unbilled.dismiss.action')}
                    </button>
                  </td>
                </DenseRow>
              ))}
            </tbody>
          </DenseTable>
        </div>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('reports.unbilled.list.range', { first, last, count: data.totalElements })}
        />
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{title}</CardTitle>
        <button type="button" className="card-action" onClick={onClose}>
          {t('common.close')}
        </button>
      </CardHead>
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}

/** Mark an item as never billable, with a reason. It drops off the report; the WO card can undo a part. */
function DismissForm({ item, onDone }: { item: UnbilledItem; onDone: () => void }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const dismiss = useMutation({
    mutationFn: async (why: string) => {
      if (item.source === 'QUOTE') await quoteLineBillingApi.setBilling(item.itemId, { notBillable: true, reason: why });
      else await purchaseBillingApi.setBilling(item.itemId, { notBillable: true, reason: why });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unbilled-report'] });
      queryClient.invalidateQueries({ queryKey: ['unbilledPurchases'] });
      showSuccess(t('reports.unbilled.dismiss.done', { name: item.description }));
      onDone();
    },
    onError: (err) => showError(t('reports.unbilled.dismiss.failed'), extractApiError(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim() && !dismiss.isPending) dismiss.mutate(reason.trim());
  };
  return (
    <form onSubmit={submit}>
      <DialogTitle>{t('reports.unbilled.dismiss.title', { name: item.description })}</DialogTitle>
      <DialogDescription>
        {t('reports.unbilled.dismiss.body', { invoice: getName('invoice').toLowerCase() })}
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>{t('reports.unbilled.dismiss.reason')}</Label>
          <Input
            autoFocus
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reports.unbilled.dismiss.placeholder')}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!reason.trim() || dismiss.isPending}>
          {t('reports.unbilled.dismiss.confirm')}
        </Button>
      </DialogActions>
    </form>
  );
}
