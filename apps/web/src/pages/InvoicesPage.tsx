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
import { ViewTabs } from '../components/ui/Tabs';
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { EMPTY_DATE_RANGE, rangeForPreset, type DatePreset, type DateRange } from '../lib/dateRangePresets';
import { AssignmentChip, UNASSIGNED } from '../components/billing/AssignmentChip';
import { StartDocumentDialog } from '../components/document/StartDocumentDialog';
import { formatDocDate } from '../components/document/documentModel';
import {
  INVOICE_STATUS_FILTERS,
  INVOICE_STATUS_TONE,
  INVOICE_VIEWS,
  INVOICE_VIEW_PARAMS,
  daysSince,
  invoiceListStatus,
  termsLabel,
  type InvoiceView,
} from '../components/billing/billingListModel';
import { dispatchRegionApi, divisionsApi, invoicesApi, workOrderTypesApi } from '../api/setup';
import type { InvoiceListItemRow, ListInvoicesParams } from '../api/setup';

const PAGE_SIZE = 25;

function assignmentParams(
  value: string,
  ids: 'divisionIds' | 'workOrderTypeIds' | 'regionIds',
  none: 'noDivision' | 'noWorkOrderType' | 'noRegion',
): Partial<ListInvoicesParams> {
  if (!value) return {};
  return value === UNASSIGNED ? { [none]: true } : { [ids]: [value] };
}

const VIEW_LABEL: Record<InvoiceView, string> = {
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  draft: 'Drafts',
  paid: 'Paid',
  all: 'All',
  void: 'Void',
};

const day = (v: string | null | undefined) => formatDocDate(v, false) ?? '—';

/**
 * Every invoice, by what needs doing: unpaid first, then overdue, drafts,
 * paid, all, and void (kept apart so the rest add up). Counts and the
 * outstanding totals come from the server, over the same filters as the
 * list. A row opens the invoice.
 */
export default function InvoicesPage() {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const entities = getName('invoice', true);
  const entity = getName('invoice');
  const [creating, setCreating] = useState(false);

  // Tab, filters and page live in the URL, so links and the footer's page links keep them.
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  // An exact status from an older link (the revenue report's `billed`) shows as a chip on All.
  const legacyStatusId = searchParams.get('status') ?? '';
  const legacyStatus = INVOICE_STATUS_FILTERS[legacyStatusId] ?? null;
  const viewParam = searchParams.get('view') as InvoiceView | null;
  const view: InvoiceView = legacyStatus ? 'all' : viewParam && INVOICE_VIEWS.includes(viewParam) ? viewParam : 'unpaid';
  const customFrom = searchParams.get('from') ?? '';
  const customTo = searchParams.get('to') ?? '';
  const legacyPreset = (searchParams.get('date') as DatePreset | null) ?? '';
  const dateRange: DateRange =
    customFrom || customTo
      ? { from: customFrom, to: customTo }
      : legacyPreset && legacyPreset !== 'custom'
        ? rangeForPreset(legacyPreset)
        : EMPTY_DATE_RANGE;
  const divisionId = searchParams.get('division') ?? '';
  const typeId = searchParams.get('type') ?? '';
  const regionId = searchParams.get('region') ?? '';

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

  const { data: divisions = [] } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  const { data: types = [] } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });
  const { data: regions = [] } = useQuery({ queryKey: ['dispatch-regions', 'active'], queryFn: () => dispatchRegionApi.getAll(false) });

  const scope = {
    from: dateRange.from || undefined,
    to: dateRange.to || undefined, // inclusive on the backend
    ...(regionId && regionId !== UNASSIGNED ? { regionIds: [regionId] } : {}),
  };
  const { data: views } = useQuery({
    queryKey: ['invoices', 'views', scope],
    queryFn: () => invoicesApi.getViews(scope),
  });
  const { data: invoicePage, isLoading } = useQuery({
    queryKey: ['invoices', view, legacyStatusId, page, deferredSearch, dateRange.from, dateRange.to, divisionId, typeId, regionId],
    queryFn: () =>
      invoicesApi.getAll({
        q: deferredSearch || undefined,
        ...(legacyStatus ? legacyStatus.params : INVOICE_VIEW_PARAMS[view]),
        ...assignmentParams(divisionId, 'divisionIds', 'noDivision'),
        ...assignmentParams(typeId, 'workOrderTypeIds', 'noWorkOrderType'),
        ...assignmentParams(regionId, 'regionIds', 'noRegion'),
        from: scope.from,
        to: scope.to,
        page: page - 1,
        size: PAGE_SIZE,
        sort: 'invoiceDate,desc',
      }),
    placeholderData: keepPreviousData,
  });
  const invoices = invoicePage?.content ?? [];
  const total = invoicePage?.totalElements ?? 0;
  const narrowed = !!(deferredSearch || dateRange.from || dateRange.to || divisionId || typeId || regionId || legacyStatus);

  const summary = views && (
    <>
      <Strong>{views.counts.unpaid}</Strong> unpaid · <Strong>{formatCurrency(views.outstanding)}</Strong> outstanding ·{' '}
      <span className={clsx('font-semibold tabular-nums', views.overdueAmount > 0 ? 'text-danger-500' : 'text-fg-strong')}>
        {formatCurrency(views.overdueAmount)}
      </span>{' '}
      overdue
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
        value={legacyStatus ? '' : view}
        onChange={(id) => setParams({ view: id === 'unpaid' ? null : id, status: null })}
        tabs={INVOICE_VIEWS.map((v) => ({
          id: v,
          label: VIEW_LABEL[v],
          count: views?.counts[v],
          ...(v === 'overdue' ? { tone: 'danger' as const } : {}),
        }))}
      />

      <ListToolbar
        search={
          <ListSearch
            placeholder={`${entity} #, ${getName('customer').toLowerCase()}, PO #, address, ${getName('work_order').toLowerCase()}…`}
            value={searchQuery}
            onChange={onSearchChange}
          />
        }
      >
        {legacyStatus && (
          <FilterChipListbox
            label="Status"
            ariaLabel="Status"
            value={legacyStatusId}
            displayValue={legacyStatus.label}
            onChange={(id) => setParams({ status: id })}
            onClear={() => setParams({ status: null })}
            resetLabel="Any status"
          >
            {Object.entries(INVOICE_STATUS_FILTERS).map(([id, f]) => (
              <ChipListboxOption key={id} value={id}>
                {f.label}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}
        <DateRangeChip
          label="Issued"
          ariaLabel="Issued"
          value={dateRange}
          onChange={(r) => setParams({ from: r.from || null, to: r.to || null, date: null })}
        />
        {(divisions.length > 1 || divisionId) && (
          <AssignmentChip
            label={getName('division')}
            value={divisionId}
            options={divisions}
            unassignedLabel={`No ${getName('division').toLowerCase()}`}
            anyLabel="Any"
            onChange={(v) => setParams({ division: v })}
          />
        )}
        {(types.length > 1 || typeId) && (
          <AssignmentChip
            label={`${getName('work_order')} type`}
            value={typeId}
            options={types}
            unassignedLabel="No type"
            anyLabel="Any"
            onChange={(v) => setParams({ type: v })}
          />
        )}
        {(regions.length > 1 || regionId) && (
          <AssignmentChip
            label={getName('dispatch_region')}
            value={regionId}
            options={regions}
            unassignedLabel={`No ${getName('dispatch_region').toLowerCase()}`}
            anyLabel="Any"
            onChange={(v) => setParams({ region: v })}
          />
        )}
      </ListToolbar>

      <Card>
        <CardBody flush>
          {isLoading ? (
            <LoadingState label={`Loading ${entities.toLowerCase()}…`} />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={<DocumentTextIcon className="size-10 text-fg-dim" />}
              title={deferredSearch ? `No ${entities.toLowerCase()} match “${deferredSearch}”` : narrowed ? `No ${entities.toLowerCase()} match these filters` : 'Nothing here'}
              description={
                deferredSearch
                  ? `Try ${entity.toLowerCase()} #, ${getName('customer').toLowerCase()}, PO # or address.`
                  : `${entities} in this view show up here.`
              }
            />
          ) : (
            <>
              <DenseTable className="min-w-[1180px]">
                <DenseTHead>
                  <tr>
                    <th style={{ minWidth: 150 }}>{entity}</th>
                    <th>Bill to</th>
                    <th>{getName('service_location')}</th>
                    <th>{`${getName('customer')} PO`}</th>
                    <th>Issued</th>
                    <th>Status</th>
                    <th className="right">Total</th>
                    <th className="right">Balance</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {invoices.map((i) => (
                    <InvoiceRow key={i.id} invoice={i} onOpen={() => navigate(`/invoices/${i.id}`)} />
                  ))}
                </tbody>
              </DenseTable>
              <ListFooter
                page={page}
                totalPages={invoicePage?.totalPages ?? 0}
                pageHref={pageHref}
                left={
                  <>
                    Showing <Strong>{invoices.length}</Strong> of {total.toLocaleString()}
                    {view !== 'void' && !legacyStatus && ` · void ${entities.toLowerCase()} are on the Void tab`}
                  </>
                }
              />
            </>
          )}
        </CardBody>
      </Card>

      <StartDocumentDialog kind={creating ? 'invoice' : null} onClose={() => setCreating(false)} />
    </AppLayout>
  );
}

const Strong = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold tabular-nums text-fg-strong">{children}</span>
);

function InvoiceRow({ invoice: i, onOpen }: { invoice: InvoiceListItemRow; onOpen: () => void }) {
  const { getName } = useGlossary();
  const status = invoiceListStatus(i);
  const withdrawn = status === 'Void' || status === 'Cancelled';
  const overdue = status === 'Overdue';
  const terms = termsLabel(i.paymentTermsDays);
  const lateDays = overdue && i.dueDate ? daysSince(i.dueDate) : 0;

  return (
    <DenseRow onClick={onOpen} className={withdrawn ? 'opacity-70' : undefined}>
      <td>
        <div className="flex flex-col">
          <Link
            to={`/invoices/${i.id}`}
            onClick={(e) => e.stopPropagation()}
            className={clsx('id-mono font-semibold text-fg-strong hover:underline', withdrawn && 'line-through')}
          >
            {i.invoiceNumber}
          </Link>
          <span className="text-[11px] text-fg-muted">
            {i.reissuedAsInvoiceNumber ? (
              <>
                Reissued as <span className="font-mono">{i.reissuedAsInvoiceNumber}</span>
              </>
            ) : i.reissuedFromInvoiceNumber ? (
              <>
                Reissue of <span className="font-mono">{i.reissuedFromInvoiceNumber}</span>
              </>
            ) : i.quoteNumber ? (
              <>
                from <span className="font-mono">{i.quoteNumber}</span>
              </>
            ) : i.agreementId ? (
              'Installment'
            ) : (
              'Direct'
            )}
          </span>
        </div>
      </td>
      <td data-label="Bill to">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 font-medium text-fg-strong">
            {i.customerName ?? '—'}
            {i.billToIsPayer && <Tag word>{getName('payer')}</Tag>}
          </span>
          {terms && <span className="text-[11px] text-fg-muted">{terms}</span>}
        </div>
      </td>
      <td data-label={getName('service_location')}>
        <div className="flex flex-col">
          <span className="text-[12px] text-fg">{i.serviceLocationName ?? i.serviceLocationAddress ?? '—'}</span>
          {i.workOrderNumber && <span className="font-mono text-[11px] text-fg-muted">{i.workOrderNumber}</span>}
        </div>
      </td>
      <td data-label={`${getName('customer')} PO`} className={clsx('font-mono text-[11.5px]', i.customerPoNumber ? 'text-fg' : 'text-fg-muted')}>
        {i.customerPoNumber || '—'}
      </td>
      <td data-label="Issued">
        <div className="flex flex-col">
          <span className="text-[12px] text-fg">{status === 'Draft' ? 'Not sent' : day(i.invoiceDate)}</span>
          <span className={clsx('text-[11px]', overdue ? 'font-semibold text-danger-500' : 'text-fg-muted')}>
            {withdrawn
              ? i.voidedAt
                ? `Voided ${day(i.voidedAt)}`
                : status
              : status === 'Paid'
                ? i.paidAt
                  ? `Paid ${day(i.paidAt)}`
                  : 'Paid'
                : overdue
                  ? `Due ${day(i.dueDate)}${lateDays > 0 ? ` · ${lateDays}d late` : ''}`
                  : status === 'Draft'
                    ? '—'
                    : `Due ${day(i.dueDate)}`}
          </span>
        </div>
      </td>
      <td>
        <Pill tone={INVOICE_STATUS_TONE[status]} dot>
          {status}
        </Pill>
      </td>
      <td className={clsx('right num', withdrawn ? 'text-fg-muted line-through' : 'text-fg')} data-label="Total">
        {formatCurrency(i.totalAmount)}
      </td>
      <td className="right num" data-label="Balance">
        {withdrawn || status === 'Draft' ? (
          <span className="text-fg-muted">—</span>
        ) : i.balanceDue > 0 ? (
          <span className={clsx('font-bold', overdue ? 'text-danger-500' : 'text-fg-strong')}>{formatCurrency(i.balanceDue)}</span>
        ) : (
          <span className="text-fg-muted">Paid</span>
        )}
      </td>
    </DenseRow>
  );
}

