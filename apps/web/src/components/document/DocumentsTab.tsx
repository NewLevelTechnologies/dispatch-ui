/* eslint-disable i18next/no-literal-string -- dense billing list; short operational labels stay literal (same convention as the document pages). Entity names route through getName(). */
import { useDeferredValue, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardDocumentListIcon, DocumentTextIcon, PlusIcon, XMarkIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import {
  InvoiceStatus,
  QuoteStatus,
  documentsApi,
  type DocumentRow,
  type DocumentScope,
  type DocumentView,
  type InvoiceAgingBucket,
  type InvoiceListItemRow,
  type QuoteListItem,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Button } from '../catalyst/button';
import { Card, CardBody, CardHead } from '../ui/Card';
import { DenseTable, DenseTHead, DenseRow } from '../ui/DenseTable';
import { ListFooter } from '../ui/ListFooter';
import { ListSearch } from '../ui/ListToolbar';
import { LoadingState } from '../ui/LoadingState';
import { Pill, Tag } from '../ui/Pill';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { INVOICE_STATUS_TONE, QUOTE_STATUS_TONE, daysSince, invoiceListStatus, quoteListStatus } from '../billing/billingListModel';
import { INVOICE_AGING_FILTERS, INVOICE_AGING_PARAM, readAgingId } from '../customer-detail/invoiceAgingNav';
import { formatDocDate } from './documentModel';
import { StartDocumentDialog, type StartAt, type StartKind } from './StartDocumentDialog';

const PAGE_SIZE = 25;
const VIEWS: DocumentView[] = ['open', 'all', 'quote', 'invoice'];

const day = (v: string | null | undefined) => formatDocDate(v, false);
const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Query-key root for the documents list and its counts; document and payment changes refresh it by prefix. */
export const DOCUMENTS_KEY = 'documents';

/**
 * A location's (or customer's) quotes and invoices in one list: open ones
 * first by default, then all, or one kind. Read and drill through, plus
 * starting a new quote or invoice; payments and statements stay on the
 * bill-to account. Rows, order, counts and totals all come from the server.
 */
export function DocumentsTab({
  scope,
  start,
  canStart = !!start,
  aging = false,
  showLocation = false,
  jobLabel,
  footer,
}: {
  scope: DocumentScope;
  /** Opens New quote / New invoice with this location chosen. */
  start?: StartAt;
  /** Shows New quote / New invoice; without `start` they open on the location picker. */
  canStart?: boolean;
  /**
   * Reads an AR aging bucket from the URL (`invoicesAging`, set by the customer
   * overview's Billing & AR boxes): shows that bucket's open invoices, billed to
   * the customer, as a removable chip. Customer scope only.
   */
  aging?: boolean;
  /** Adds a Location column (the customer page, where documents span sites). */
  showLocation?: boolean;
  /** A short description of a job, for invoices (which carry no title of their own). */
  jobLabel?: (workOrderId: string) => string | undefined;
  footer?: ReactNode;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const [view, setView] = useState<DocumentView>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<StartKind | null>(null);
  const { page, pageHref, resetPage } = useUrlPage('documentsPage');
  const q = useDeferredValue(search.trim());
  const [searchParams, setSearchParams] = useSearchParams();
  const agingId = aging ? readAgingId(searchParams) : 'all';
  const agingBucket = agingId !== 'all' ? (agingId as InvoiceAgingBucket) : undefined;
  // A bucket is open invoices only, so it shows on the Invoices view.
  const shownView: DocumentView = agingBucket ? 'invoice' : view;
  const clearAging = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(INVOICE_AGING_PARAM);
        next.delete('documentsPage');
        return next;
      },
      { replace: true },
    );

  const quotes = getName('quote', true);
  const invoices = getName('invoice', true);
  const viewLabel: Record<DocumentView, string> = { open: 'Open', all: 'All', quote: quotes, invoice: invoices };

  const { data: views } = useQuery({
    queryKey: [DOCUMENTS_KEY, scope, 'views'],
    queryFn: () => documentsApi.getViews(scope),
  });
  const { data, isLoading } = useQuery({
    queryKey: [DOCUMENTS_KEY, scope, { view: shownView, agingBucket, q, page }],
    queryFn: () =>
      documentsApi.list({ ...scope, view: shownView, agingBucket, q: q || undefined, page: page - 1, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;

  const changeView = (v: DocumentView) => {
    setView(v);
    if (agingBucket) clearAging();
    else resetPage();
  };

  const lastHeader = shownView === 'quote' ? 'Invoiced' : shownView === 'invoice' ? 'Balance' : 'Balance · invoiced';

  return (
    <Card>
      <CardHead className="flex-wrap gap-y-2">
        <ToggleGroup value={shownView} onChange={changeView} size="sm" aria-label="Show">
          {VIEWS.map((v) => (
            <ToggleGroupOption key={v} value={v}>
              {/* One inline run: the sm option is a grid, so loose children would stack. */}
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                {viewLabel[v]}
                {views && <span className="text-[11px] font-medium tabular-nums text-fg-muted">{views.counts[v]}</span>}
              </span>
            </ToggleGroupOption>
          ))}
        </ToggleGroup>
        {views && (
          <span className="ml-1.5 text-[12px] tabular-nums text-fg-muted">
            <b className="font-semibold text-fg-strong">{views.openQuotes.count}</b>
            {` open ${getName('quote', views.openQuotes.count !== 1).toLowerCase()} · ${usd0(views.openQuotes.amount)}  ·  `}
            <b className="font-semibold text-fg-strong">{usd0(views.due)}</b>
            {' due'}
            {views.overdue > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-danger-500">{`${usd0(views.overdue)} overdue`}</span>
              </>
            )}
          </span>
        )}
        {agingBucket && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-0.5 text-[11.5px] font-medium text-fg-strong">
            {`Aged ${INVOICE_AGING_FILTERS.find((f) => f.id === agingBucket)?.label ?? ''}`}
            <button type="button" onClick={clearAging} aria-label="Clear aging filter" className="text-fg-muted hover:text-fg-strong">
              <XMarkIcon className="size-3.5" />
            </button>
          </span>
        )}
        <span className="grow" />
        <ListSearch
          compact
          value={search}
          onChange={(v) => {
            setSearch(v);
            resetPage();
          }}
          placeholder="Number or job…"
          ariaLabel={`Search ${quotes.toLowerCase()} and ${invoices.toLowerCase()}`}
        />
        {canStart && (
          <div className="flex gap-1.5">
            <Button outline size="xs" onClick={() => setCreating('quote')}>
              <PlusIcon />
              {`New ${getName('quote').toLowerCase()}`}
            </Button>
            <Button outline size="xs" onClick={() => setCreating('invoice')}>
              <PlusIcon />
              {`New ${getName('invoice').toLowerCase()}`}
            </Button>
          </div>
        )}
      </CardHead>
      <CardBody flush>
        {isLoading ? (
          <LoadingState label={`Loading ${quotes.toLowerCase()} and ${invoices.toLowerCase()}…`} />
        ) : rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <div className="text-[13.5px] font-semibold text-fg-strong">
              {q
                ? 'No matches'
                : agingBucket
                  ? `No ${invoices.toLowerCase()} in this age range`
                  : shownView === 'open'
                  ? 'Nothing open'
                  : shownView === 'all'
                    ? `No ${quotes.toLowerCase()} or ${invoices.toLowerCase()} yet`
                    : `No ${viewLabel[shownView].toLowerCase()} yet`}
            </div>
            <div className="mt-1 text-[12.5px] text-fg-muted">
              {q
                ? 'Try a different number or job.'
                : agingBucket
                  ? `Open ${invoices.toLowerCase()} billed to this account land here as they age.`
                  : shownView === 'open'
                  ? `No open ${quotes.toLowerCase()} or unpaid ${invoices.toLowerCase()}.`
                  : `${quotes} and ${invoices.toLowerCase()} for work here will show up here.`}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DenseTable className="dense-stack">
              <DenseTHead>
                <tr>
                  <th>Document</th>
                  {showLocation && <th>{getName('service_location')}</th>}
                  <th>For work</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="right">Total</th>
                  <th className="right">{lastHeader}</th>
                </tr>
              </DenseTHead>
              <tbody>
                {rows.map((r) => (
                  <DocumentTableRow
                    key={`${r.kind}-${r.id}`}
                    row={r}
                    showLocation={showLocation}
                    jobLabel={jobLabel}
                    onOpen={() => navigate(r.kind === 'QUOTE' ? `/quotes/${r.id}` : `/invoices/${r.id}`)}
                  />
                ))}
              </tbody>
            </DenseTable>
          </div>
        )}
      </CardBody>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft px-3.5 py-2 text-[11.5px] text-fg-muted">
        <span className="grow">{footer}</span>
        {(shownView === 'all' || shownView === 'invoice') && <span>{`Void ${invoices.toLowerCase()} hidden`}</span>}
      </div>
      <ListFooter
        page={page}
        totalPages={data?.totalPages ?? 0}
        pageHref={pageHref}
        left={total > PAGE_SIZE ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()}` : undefined}
      />
      <StartDocumentDialog kind={creating} start={start} onClose={() => setCreating(null)} />
    </Card>
  );
}

function DocumentTableRow({
  row,
  showLocation,
  jobLabel,
  onOpen,
}: {
  row: DocumentRow;
  showLocation: boolean;
  jobLabel?: (workOrderId: string) => string | undefined;
  onOpen: () => void;
}) {
  const { getName } = useGlossary();
  const d = row.kind === 'QUOTE' ? row.quote : row.invoice;
  const site = d.serviceLocationName ?? d.serviceLocationAddress;
  const title = row.kind === 'QUOTE' ? row.quote.title : null;
  const desc = title || (d.workOrderId ? jobLabel?.(d.workOrderId) : undefined);

  return (
    <DenseRow onClick={onOpen}>
      <td>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <span className="text-fg-muted" aria-hidden>
              {row.kind === 'QUOTE' ? <ClipboardDocumentListIcon className="size-3.5" /> : <DocumentTextIcon className="size-3.5" />}
            </span>
            <span className="id-mono whitespace-nowrap font-bold text-fg-strong">
              {row.kind === 'QUOTE' ? row.quote.quoteNumber : row.invoice.invoiceNumber}
            </span>
            {row.kind === 'QUOTE' && (row.quote.revision ?? 1) > 1 && <Tag word>{`Rev ${row.quote.revision}`}</Tag>}
          </span>
          <span className="whitespace-nowrap text-[11px] text-fg-muted">
            {row.kind === 'QUOTE' ? (
              getName('quote')
            ) : row.invoice.quoteNumber ? (
              <>
                {`${getName('invoice')} · from `}
                <span className="font-mono">{row.invoice.quoteNumber}</span>
              </>
            ) : (
              getName('invoice')
            )}
          </span>
        </div>
      </td>
      {showLocation && (
        <td className={clsx('text-[12px]', !site && 'dt-empty')} data-label={getName('service_location')}>
          {site ?? '—'}
        </td>
      )}
      <td className={clsx(!desc && !d.workOrderNumber && 'dt-empty')} data-label="For work">
        <div className="flex flex-col">
          {desc && (
            <span className="max-w-[340px] truncate text-[12.5px] font-medium text-fg" title={desc}>
              {desc}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
            {d.workOrderId && d.workOrderNumber ? (
              // The row opens the document; the job number opens the job.
              <Link to={`/work-orders/${d.workOrderId}`} onClick={(e) => e.stopPropagation()} className="font-mono text-fg-accent hover:underline">
                {d.workOrderNumber}
              </Link>
            ) : (
              !desc && <span>—</span>
            )}
            {d.billToIsPayer && (
              <>
                <span>{`· billed to ${d.customerName ?? '—'}`}</span>
                <Tag word>{getName('payer')}</Tag>
              </>
            )}
          </span>
        </div>
      </td>
      {row.kind === 'QUOTE' ? <QuoteCells quote={row.quote} /> : <InvoiceCells invoice={row.invoice} />}
    </DenseRow>
  );
}

function DateCell({ top, sub, alert }: { top: string | null; sub: string; alert?: boolean }) {
  return (
    <td data-label="Date">
      <div className="flex flex-col">
        <span className="whitespace-nowrap text-[12px] text-fg">{top ?? '—'}</span>
        <span className={clsx('whitespace-nowrap text-[11px]', alert ? 'font-semibold text-danger-500' : 'text-fg-muted')}>{sub}</span>
      </div>
    </td>
  );
}

function QuoteCells({ quote: q }: { quote: QuoteListItem }) {
  const status = quoteListStatus(q);
  const expires = day(q.expirationDate);
  const sub =
    status === 'Draft'
      ? 'Not sent'
      : status === 'Being updated'
        ? 'link paused'
        : status === 'Sent' || status === 'Viewed'
          ? [status === 'Viewed' ? 'viewed' : 'not viewed', expires && `expires ${expires}`].filter(Boolean).join(' · ')
          : status === 'Expired'
            ? `expired ${expires ?? ''}`.trim()
            : `${status.toLowerCase()} ${day(q.decidedAt) ?? ''}`.trim();
  const pct = q.invoicedPercent ?? null;
  return (
    <>
      <td>
        <Pill tone={QUOTE_STATUS_TONE[status]} dot>
          {status}
        </Pill>
      </td>
      <DateCell top={day(q.quoteDate)} sub={sub} />
      <td className="right" data-label="Total">
        <span className="whitespace-nowrap font-semibold tabular-nums text-fg-strong">{formatCurrency(q.totalAmount)}</span>
      </td>
      <td className={clsx('right', !(q.status === QuoteStatus.ACCEPTED && pct != null) && 'dt-empty')} data-label="Invoiced">
        {q.status === QuoteStatus.ACCEPTED && pct != null ? (
          <span className={clsx('whitespace-nowrap text-[12px] tabular-nums', pct < 100 ? 'font-semibold text-warning-fg' : 'text-fg-muted')}>
            {pct >= 100 ? 'Fully invoiced' : `${pct}% invoiced`}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
    </>
  );
}

function InvoiceCells({ invoice: i }: { invoice: InvoiceListItemRow }) {
  const status = invoiceListStatus(i);
  const overdue = status === 'Overdue';
  const due = day(i.dueDate);
  const late = overdue && i.dueDate ? daysSince(i.dueDate) : 0;
  const sub =
    status === 'Draft'
      ? 'Not sent'
      : status === 'Paid'
        ? `paid ${day(i.paidAt) ?? ''}`.trim()
        : i.reissuedAsInvoiceNumber
          ? `reissued as ${i.reissuedAsInvoiceNumber}`
          : [due && `due ${due}`, late > 0 && `${late}d late`].filter(Boolean).join(' · ') || '—';
  const owed = i.status !== InvoiceStatus.DRAFT && i.status !== InvoiceStatus.VOID && i.status !== InvoiceStatus.CANCELLED;
  return (
    <>
      <td>
        <Pill tone={INVOICE_STATUS_TONE[status]} dot>
          {status}
        </Pill>
      </td>
      <DateCell top={day(i.invoiceDate)} sub={sub} alert={overdue} />
      <td className="right" data-label="Total">
        <span className="whitespace-nowrap font-semibold tabular-nums text-fg-strong">{formatCurrency(i.totalAmount)}</span>
      </td>
      <td className={clsx('right', !owed && 'dt-empty')} data-label="Balance">
        {!owed ? (
          <span className="text-fg-muted">—</span>
        ) : i.balanceDue > 0 ? (
          <span className={clsx('whitespace-nowrap font-bold tabular-nums', overdue ? 'text-danger-500' : 'text-fg-strong')}>{formatCurrency(i.balanceDue)}</span>
        ) : (
          <span className="text-[12px] text-fg-muted">Paid</span>
        )}
      </td>
    </>
  );
}
