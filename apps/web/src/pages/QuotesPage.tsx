/* eslint-disable i18next/no-literal-string -- dense billing list; short operational labels stay literal (same convention as the document pages). Entity names route through getName(). */
import { useDeferredValue, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DocumentTextIcon, PlusIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { Pill, Tag } from '../components/ui/Pill';
import { Avatar } from '../components/ui/Avatar';
import { ViewTabs } from '../components/ui/Tabs';
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { FilterChip } from '../components/ui/FilterChipRow';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { SortHeader, type SortState } from '../components/ui/SortHeader';
import { useUrlSort } from '../hooks/useUrlSort';
import { StartDocumentDialog } from '../components/document/StartDocumentDialog';
import { BillQuoteDialog } from '../components/document/BillQuoteDialog';
import { formatDocDate } from '../components/document/documentModel';
import {
  QUOTE_STATUS_TONE,
  QUOTE_VIEWS,
  QUOTE_VIEW_PARAMS,
  daysUntil,
  quoteListStatus,
  type QuoteView,
} from '../components/billing/billingListModel';
import { QuoteStatus, dispatchRegionApi, quotesApi, type QuoteListItem } from '../api/setup';

const PAGE_SIZE = 25;
const STATUSES: QuoteStatus[] = [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.ACCEPTED, QuoteStatus.DECLINED, QuoteStatus.EXPIRED];
const STATUS_LABEL: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Draft',
  [QuoteStatus.SENT]: 'Sent',
  [QuoteStatus.ACCEPTED]: 'Accepted',
  [QuoteStatus.DECLINED]: 'Declined',
  [QuoteStatus.EXPIRED]: 'Expired',
};
const VIEW_LABEL: Record<QuoteView, string> = {
  open: 'Open',
  ready: 'Ready to invoice',
  accepted: 'Accepted',
  closed: 'Declined & expired',
  all: 'All',
};

// BE sort whitelist (QuoteController): quoteDate, firstSentAt, lastSentAt,
// decidedAt, expirationDate, totalAmount, quoteNumber, customerName. The date
// column is Sent (lastSentAt) or, on the decided views, Accepted (decidedAt);
// unsent/undecided quotes sort last either way. Default quoteDate,desc has no
// column; it's the "no sort param" state.
const DEFAULT_SORT: SortState = { key: 'quoteDate', dir: 'desc' };
const SORT_KEYS = ['quoteDate', 'quoteNumber', 'customerName', 'lastSentAt', 'decidedAt', 'expirationDate', 'totalAmount'] as const;

const day = (v: string | null | undefined) => formatDocDate(v, false) ?? '—';
const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Every quote, by what needs doing: open ones waiting on the customer,
 * accepted ones with work still to invoice, then accepted, closed and all.
 * Counts and the summary come from the server over the same filters. A row
 * opens the quote; on Ready to invoice, a row's action bills it.
 */
export default function QuotesPage() {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const entities = getName('quote', true);
  const entity = getName('quote');
  const invoiceLower = getName('invoice').toLowerCase();
  const [creating, setCreating] = useState(false);
  const [billing, setBilling] = useState<QuoteListItem | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const sentFrom = searchParams.get('sentFrom') ?? '';
  const sentTo = searchParams.get('sentTo') ?? '';
  // An exact status from the Quotes report's funnel shows as a chip on All.
  const statusParam = searchParams.get('status') as QuoteStatus | null;
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : null;
  const viewParam = searchParams.get('view') as QuoteView | null;
  const view: QuoteView = status ? 'all' : viewParam && QUOTE_VIEWS.includes(viewParam) ? viewParam : 'open';
  // A sender's quotes, from the Quotes report.
  const sender = searchParams.get('sender');
  const regionId = searchParams.get('region');
  const { current: currentSort, sortParam, onSort } = useUrlSort({
    defaultSort: DEFAULT_SORT,
    descFirst: ['lastSentAt', 'decidedAt', 'totalAmount'],
    allowed: SORT_KEYS,
  });

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    setParams({ search: value || null });
  };
  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  const scope = {
    firstSentFrom: sentFrom || undefined,
    firstSentTo: sentTo || undefined,
    sentByUserId: sender ?? undefined,
    regionIds: regionId ? [regionId] : undefined,
  };
  const { data: views } = useQuery({ queryKey: ['quotes', 'views', scope], queryFn: () => quotesApi.getViews(scope) });
  const { data: quotePage, isLoading } = useQuery({
    queryKey: ['quotes', view, status, page, deferredSearch, sentFrom, sentTo, sender, regionId, sortParam],
    queryFn: () =>
      quotesApi.getAll({
        ...scope,
        ...(status ? { status: [status] } : QUOTE_VIEW_PARAMS[view]),
        q: deferredSearch || undefined,
        page: page - 1,
        size: PAGE_SIZE,
        sort: sortParam,
      }),
    placeholderData: keepPreviousData,
  });
  const quotes = quotePage?.content ?? [];
  const total = quotePage?.totalElements ?? 0;
  const narrowed = Boolean(deferredSearch || sentFrom || sentTo || status || sender || regionId);
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'all'],
    queryFn: () => dispatchRegionApi.getAll(true),
    enabled: !!regionId,
  });
  const regionName = regions.find((r) => r.id === regionId)?.name;
  const senderName = sender ? (quotes.find((q) => q.firstSentByUserId === sender)?.firstSentByName ?? null) : null;
  const decided = view === 'ready' || view === 'accepted';

  const summary = views && (
    <>
      <Strong>{views.counts.open}</Strong> open · <Strong>{usd0(views.awaitingCustomer)}</Strong> awaiting{' '}
      {getName('customer').toLowerCase()} · <Strong>{views.expiringThisWeek}</Strong> expiring this week ·{' '}
      <Strong>{usd0(views.readyToInvoiceAmount)}</Strong> ready to invoice
    </>
  );

  return (
    <AppLayout>
      <PageHead
        title={entities}
        sub={summary}
        actions={
          <Button color="accent" size="xs" onClick={() => setCreating(true)}>
            <PlusIcon />
            {`New ${entity.toLowerCase()}`}
          </Button>
        }
      />

      <ViewTabs
        className="mb-3"
        value={status ? '' : view}
        onChange={(id) => setParams({ view: id === 'open' ? null : id, status: null })}
        tabs={QUOTE_VIEWS.map((v) => ({
          id: v,
          label: VIEW_LABEL[v],
          count: views?.counts[v === 'ready' ? 'readyToInvoice' : v],
          ...(v === 'ready' ? { tone: 'accent' as const } : {}),
        }))}
      />

      <ListToolbar
        search={
          <ListSearch
            placeholder={`${entity} #, ${getName('customer').toLowerCase()}, title…`}
            value={searchQuery}
            onChange={onSearchChange}
          />
        }
      >
        <DateRangeChip
          label="Sent"
          ariaLabel="Sent"
          value={{ from: sentFrom, to: sentTo }}
          onChange={(r) => setParams({ sentFrom: r.from || null, sentTo: r.to || null })}
        />
        {status && (
          <FilterChipListbox
            label="Status"
            ariaLabel="Status"
            value={status}
            displayValue={STATUS_LABEL[status]}
            onChange={(v) => setParams({ status: v })}
            onClear={() => setParams({ status: null })}
            resetLabel="Any status"
          >
            {STATUSES.map((st) => (
              <ChipListboxOption key={st} value={st}>
                {STATUS_LABEL[st]}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}
        {regionId && (
          <FilterChip label={regionName ?? getName('dispatch_region')} active onToggle={() => setParams({ region: null })} />
        )}
        {sender && (
          <FilterChip label={senderName ? `Sent by ${senderName}` : 'Sent by one person'} active onToggle={() => setParams({ sender: null })} />
        )}
      </ListToolbar>

      <Card>
        <CardBody flush>
          {isLoading ? (
            <LoadingState label={`Loading ${entities.toLowerCase()}…`} />
          ) : quotes.length === 0 ? (
            <EmptyState
              icon={<DocumentTextIcon className="size-10 text-fg-dim" />}
              title={deferredSearch ? `No ${entities.toLowerCase()} match “${deferredSearch}”` : narrowed ? `No ${entities.toLowerCase()} match these filters` : 'Nothing here'}
              description={
                deferredSearch
                  ? `Try ${entity.toLowerCase()} #, ${getName('customer').toLowerCase()} or title.`
                  : `${entities} in this view show up here.`
              }
            />
          ) : (
            <>
              <DenseTable className="min-w-[1240px]">
                <DenseTHead>
                  <tr>
                    <SortHeader sortKey="quoteNumber" label={entity} current={currentSort} onSort={onSort} style={{ minWidth: 130 }} />
                    <SortHeader sortKey="customerName" label="Bill to" current={currentSort} onSort={onSort} />
                    <th>Description</th>
                    <th>Advisor</th>
                    <SortHeader
                      sortKey={decided ? 'decidedAt' : 'lastSentAt'}
                      label={decided ? 'Accepted' : 'Sent'}
                      current={currentSort}
                      onSort={onSort}
                    />
                    <SortHeader sortKey="expirationDate" label="Expires" current={currentSort} onSort={onSort} />
                    <th>Status</th>
                    <SortHeader sortKey="totalAmount" label="Total" align="right" current={currentSort} onSort={onSort} />
                    {view === 'ready' && <th style={{ width: 132 }} />}
                  </tr>
                </DenseTHead>
                <tbody>
                  {quotes.map((q) => (
                    <QuoteRow
                      key={q.id}
                      quote={q}
                      noJob={`No ${getName('work_order').toLowerCase()} yet`}
                      action={
                        view === 'ready' ? (
                          <Button outline size="xs" onClick={() => setBilling(q)}>
                            {`Create ${invoiceLower}`}
                          </Button>
                        ) : undefined
                      }
                      onOpen={() => navigate(`/quotes/${q.id}`)}
                    />
                  ))}
                </tbody>
              </DenseTable>
              <ListFooter
                page={page}
                totalPages={quotePage?.totalPages ?? 0}
                pageHref={pageHref}
                left={
                  <>
                    Showing <Strong>{quotes.length}</Strong> of {total.toLocaleString()}
                  </>
                }
              />
            </>
          )}
        </CardBody>
      </Card>

      <StartDocumentDialog kind={creating ? 'quote' : null} onClose={() => setCreating(false)} />
      {billing && <BillQuoteDialog quote={billing} open onClose={() => setBilling(null)} />}
    </AppLayout>
  );
}

const Strong = ({ children }: { children: ReactNode }) => <span className="font-semibold tabular-nums text-fg-strong">{children}</span>;

function QuoteRow({
  quote: q,
  noJob,
  action,
  onOpen,
}: {
  quote: QuoteListItem;
  noJob: string;
  action?: ReactNode;
  onOpen: () => void;
}) {
  const { getName } = useGlossary();
  const status = quoteListStatus(q);
  const open = q.status === QuoteStatus.DRAFT || q.status === QuoteStatus.SENT;
  // Null on a draft not yet sent: it's given an expiry when it goes out.
  const days = q.expirationDate ? daysUntil(q.expirationDate) : null;
  const urgent = open && days != null && days >= 0 && days <= 3;
  const advisor = q.createdByName ?? q.firstSentByName ?? null;
  const accepted = q.status === QuoteStatus.ACCEPTED;
  const pct = q.invoicedPercent ?? null;

  return (
    <DenseRow onClick={onOpen}>
      <td>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <Link to={`/quotes/${q.id}`} onClick={(e) => e.stopPropagation()} className="id-mono font-semibold text-fg-strong hover:underline">
              {q.quoteNumber}
            </Link>
            {(q.revision ?? 1) > 1 && <Tag word>{`Rev ${q.revision}`}</Tag>}
          </span>
          <span className="font-mono text-[11px] text-fg-muted">{q.workOrderNumber ?? noJob}</span>
        </div>
      </td>
      <td data-label="Bill to">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 font-medium text-fg-strong">
            {q.customerName ?? '—'}
            {q.billToIsPayer && <Tag word>{getName('payer')}</Tag>}
          </span>
          {(q.serviceLocationName ?? q.serviceLocationAddress) && (
            <span className="text-[11px] text-fg-muted">{q.serviceLocationName ?? q.serviceLocationAddress}</span>
          )}
        </div>
      </td>
      <td data-label="Description">
        <div className="flex flex-col">
          <span className={clsx('text-[12.5px] font-medium', q.title ? 'text-fg' : 'text-fg-muted')}>{q.title || 'No title'}</span>
          {q.lineCount != null && <span className="text-[11px] text-fg-muted">{q.lineCount === 1 ? '1 line' : `${q.lineCount} lines`}</span>}
        </div>
      </td>
      <td data-label="Advisor">
        {advisor ? (
          <span className="flex items-center gap-1.5">
            <Avatar name={advisor} size="sm" />
            <span className="whitespace-nowrap text-[11.5px]">{advisor}</span>
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td data-label="Sent">
        <div className="flex flex-col">
          <span className="text-[12px] text-fg">
            {accepted || q.status === QuoteStatus.DECLINED
              ? day(q.decidedAt)
              : q.firstSentAt
                ? day(q.lastSentAt ?? q.firstSentAt)
                : 'Not sent'}
          </span>
          <span className="text-[11px] text-fg-muted">
            {accepted
              ? 'accepted'
              : q.status === QuoteStatus.DECLINED
                ? 'declined'
                : q.firstSentAt
                  ? q.firstViewedAt
                    ? `viewed ${day(q.firstViewedAt)}`
                    : 'not viewed'
                  : `Created ${day(q.createdAt)}`}
          </span>
        </div>
      </td>
      <td data-label="Expires">
        {days == null ? (
          <span className="text-[12px] text-fg-muted">When sent</span>
        ) : open || q.status === QuoteStatus.EXPIRED ? (
          <div className="flex flex-col">
            <span className={clsx('whitespace-nowrap text-[12px]', urgent || days < 0 ? 'font-semibold text-danger-500' : 'text-fg')}>
              {day(q.expirationDate)}
            </span>
            <span className="text-[11px] text-fg-muted">{days < 0 ? 'expired' : days === 0 ? 'today' : `in ${days}d`}</span>
          </div>
        ) : (
          <span className="text-[12px] text-fg-muted">—</span>
        )}
      </td>
      <td>
        <Pill tone={QUOTE_STATUS_TONE[status]} dot>
          {status}
        </Pill>
        {status === 'Being updated' && (
          <div className="mt-0.5 whitespace-nowrap text-[10.5px] text-fg-muted">{`Rev ${q.revision ?? 1} draft · link paused`}</div>
        )}
      </td>
      <td className="right" data-label="Total">
        <div className="whitespace-nowrap font-bold tabular-nums text-fg-strong">{formatCurrency(q.totalAmount)}</div>
        {accepted && pct != null && (
          <div className={clsx('whitespace-nowrap text-[10.5px] tabular-nums', pct < 100 ? 'font-semibold text-warning-fg' : 'text-fg-muted')}>
            {pct >= 100
              ? 'Fully invoiced'
              : pct > 0
                ? `${pct}% invoiced · ${usd0(q.remainingToInvoice ?? 0)} left`
                : 'Not invoiced'}
          </div>
        )}
      </td>
      {action && (
        <td className="right" onClick={(e) => e.stopPropagation()}>
          {action}
        </td>
      )}
    </DenseRow>
  );
}
