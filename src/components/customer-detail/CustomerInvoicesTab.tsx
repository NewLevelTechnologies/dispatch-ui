/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/short labels stay literal to match the sibling tabs. */
// Customer Invoices tab (INV-1) — the customer's full AR list across all
// locations, read-only. Same toolbar shape (search · single-select Status) +
// server-side filtering + pagination as the sibling Jobs tab, scoped to the
// customer via `invoicesApi.getAll({ customerId })` (preferred over getByCustomer
// so the status/overdue/q filters compose). There's no per-invoice detail route
// yet, so rows don't navigate — this is a glanceable AR surface, not an editor
// (status changes / send live on the global Invoices page).
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  invoicesApi,
  InvoiceStatus,
  type InvoiceAgingBucket,
  type InvoiceListItemRow,
  type ListInvoicesParams,
} from '../../api';
import { INVOICE_AGING_FILTERS, INVOICE_AGING_PARAM, readAgingId } from './invoiceAgingNav';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow } from '../ui/DenseTable';
import { SortHeader, type SortState } from '../ui/SortHeader';
import { FilterChipListbox, ChipListboxOption } from '../ui/FilterChipListbox';
import { ListFooter } from '../ui/ListFooter';
import { LoadingState } from '../ui/LoadingState';
import { useUrlPage } from '../../hooks/useUrlPage';
import { formatDateShort, formatMoney } from './format';

// Single-select status filter — the backend has no multi-status param.
// "Overdue" is its own server filter (open + strictly past due), so a SENT
// invoice past due matches even before its stored status flips. Mirrors the
// global Invoices page + the location detail Invoices tab.
const INVOICE_STATUS_FILTERS: {
  id: string;
  labelKey: string;
  params: Pick<ListInvoicesParams, 'status' | 'overdue'>;
}[] = [
  { id: 'all', labelKey: 'invoices.status.all', params: {} },
  { id: 'overdue', labelKey: 'invoices.status.overdue', params: { overdue: true } },
  { id: 'draft', labelKey: 'invoices.status.draft', params: { status: InvoiceStatus.DRAFT } },
  { id: 'sent', labelKey: 'invoices.status.sent', params: { status: InvoiceStatus.SENT } },
  { id: 'paid', labelKey: 'invoices.status.paid', params: { status: InvoiceStatus.PAID } },
  { id: 'cancelled', labelKey: 'invoices.status.cancelled', params: { status: InvoiceStatus.CANCELLED } },
  { id: 'void', labelKey: 'invoices.status.void', params: { status: InvoiceStatus.VOID } },
];

const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.SENT]: 'info',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.VOID]: 'neutral',
};

const INVOICES_PAGE_SIZE = 25;

function StatusPill({ row }: { row: InvoiceListItemRow }) {
  const { t } = useTranslation();
  // `overdue` is the server-derived flag (open + past due); prefer it so the
  // pill agrees with the Overdue filter even before the stored status flips.
  if (row.overdue && row.status !== InvoiceStatus.PAID) {
    return (
      <Pill tone="danger" dot>
        {t('invoices.status.overdue')}
      </Pill>
    );
  }
  return (
    <Pill tone={INVOICE_STATUS_TONE[row.status]} dot>
      {t(`invoices.status.${row.status.toLowerCase()}`)}
    </Pill>
  );
}

export default function CustomerInvoicesTab({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const [statusId, setStatusId] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'invoiceDate', dir: 'desc' });
  const { page, pageHref, resetPage } = useUrlPage('invoicesPage');
  const deferredSearch = useDeferredValue(search.trim());

  // Aging filter is URL-driven (not local) so the overview Billing & AR boxes can
  // deep-link straight to a bucket, and a refreshed/shared URL restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const agingId = readAgingId(searchParams);
  const setAging = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'all') next.delete(INVOICE_AGING_PARAM);
        else next.set(INVOICE_AGING_PARAM, id);
        next.delete('invoicesPage'); // filter change → back to page 1
        return next;
      },
      { replace: true },
    );
  };

  // Date/amount columns open desc (most-recent / biggest first); status asc.
  const onSort = (key: string) => {
    setSort((s) =>
      key === s.key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'status' ? 'asc' : 'desc' },
    );
    resetPage();
  };

  const statusParams = INVOICE_STATUS_FILTERS.find((s) => s.id === statusId)?.params ?? {};

  const params: ListInvoicesParams = {
    customerId,
    ...statusParams,
    agingBucket: agingId !== 'all' ? (agingId as InvoiceAgingBucket) : undefined,
    q: deferredSearch || undefined,
    page: page - 1, // local state 1-based; backend Page 0-based
    size: INVOICES_PAGE_SIZE,
    sort: `${sort.key},${sort.dir}` as ListInvoicesParams['sort'],
  };

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'customer', params],
    queryFn: () => invoicesApi.getAll(params),
  });
  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const filtersActive = statusId !== 'all' || agingId !== 'all' || !!deferredSearch;
  const showingStart = total === 0 ? 0 : (page - 1) * INVOICES_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * INVOICES_PAGE_SIZE, total);

  const clearFilters = () => {
    setStatusId('all');
    setSearch('');
    setAging('all'); // also clears invoicesPage
    resetPage();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search invoice #…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                resetPage();
              }}
              className="px-1 text-[11px] text-fg-dim hover:text-fg-strong"
            >
              ×
            </button>
          )}
        </div>

        <FilterChipListbox
          label={t('common.form.status')}
          ariaLabel={t('common.form.status')}
          value={statusId}
          displayValue={t(INVOICE_STATUS_FILTERS.find((s) => s.id === statusId)?.labelKey ?? '')}
          onChange={(id) => {
            setStatusId(id as string);
            resetPage();
          }}
        >
          {INVOICE_STATUS_FILTERS.map((s) => (
            <ChipListboxOption key={s.id} value={s.id}>
              {t(s.labelKey)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        <FilterChipListbox
          label="Aging"
          ariaLabel="Aging"
          value={agingId}
          displayValue={INVOICE_AGING_FILTERS.find((a) => a.id === agingId)?.label ?? ''}
          onChange={(id) => setAging(id as string)}
        >
          {INVOICE_AGING_FILTERS.map((a) => (
            <ChipListboxOption key={a.id} value={a.id}>
              {a.label}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        {filtersActive && (
          <Button plain size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading ? (
          <LoadingState label={t('common.actions.loading', { entities: getName('invoice', true) })} />
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive
                ? `No matching ${getName('invoice', true).toLowerCase()}`
                : t('common.actions.noEntitiesYet', { entities: getName('invoice', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust your search or clear filters.'
                : `${getName('invoice', true)} for this customer will appear here.`}
            </div>
            {filtersActive && (
              <Button plain size="xs" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DenseTable className="dense-stack">
                <DenseTHead>
                  <tr>
                    <th>{t('invoices.table.invoiceNumber')}</th>
                    <SortHeader sortKey="status" label={t('invoices.table.status')} current={sort} onSort={onSort} />
                    <SortHeader sortKey="invoiceDate" label={t('invoices.table.invoiceDate')} current={sort} onSort={onSort} />
                    <SortHeader sortKey="dueDate" label={t('invoices.table.dueDate')} current={sort} onSort={onSort} />
                    <SortHeader sortKey="totalAmount" label={t('invoices.table.totalAmount')} current={sort} onSort={onSort} align="right" />
                    <th className="right">{t('invoices.table.balanceDue')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((inv) => {
                    // Void/cancelled rows are de-emphasized like InvoicesPage /
                    // the agreement AR tab: muted number, struck total, dashed
                    // balance (not $0.00, which reads as "paid off").
                    const voided =
                      inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.CANCELLED;
                    return (
                    <DenseRow key={inv.id}>
                      <td>
                        <span className={voided ? 'font-mono text-fg-muted' : 'font-mono font-bold text-fg-strong'}>
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td>
                        <StatusPill row={inv} />
                      </td>
                      <td className="muted" data-label={t('invoices.table.invoiceDate')}>{formatDateShort(inv.invoiceDate)}</td>
                      <td className="muted" data-label={t('invoices.table.dueDate')}>{formatDateShort(inv.dueDate)}</td>
                      <td
                        className={voided ? 'right num text-fg-muted line-through' : 'right num strong'}
                        data-label={t('invoices.table.totalAmount')}
                      >
                        {formatMoney(inv.totalAmount)}
                      </td>
                      <td className={`right num${voided ? ' dt-empty' : ''}`} data-label={t('invoices.table.balanceDue')}>
                        {voided ? (
                          <span className="text-fg-dim">—</span>
                        ) : inv.balanceDue > 0 ? (
                          <span className="font-semibold text-fg-strong">{formatMoney(inv.balanceDue)}</span>
                        ) : (
                          <span className="text-fg-dim">{formatMoney(0)}</span>
                        )}
                      </td>
                    </DenseRow>
                    );
                  })}
                </tbody>
              </DenseTable>
            </div>
            <ListFooter
              page={page}
              totalPages={totalPages}
              pageHref={pageHref}
              left={t('common.pagination.showing', {
                start: showingStart,
                end: showingEnd,
                total: total.toLocaleString(),
              })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
