/* eslint-disable i18next/no-literal-string -- dense records list; short procurement column/label strings stay literal (same convention as VendorsPage). */
import { useEffect, useState, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CubeIcon, ReceiptPercentIcon, PlusIcon } from '@heroicons/react/24/outline';
import { purchaseOrderApi, type PurchaseOrderStatus, type PurchaseOrderType } from '../api';
import AppLayout from '../components/AppLayout';
import { extractApiError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill, Tag } from '../components/ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

// Purchasing — records-level list of POs across every job + vendor (the office
// companion to the WO Purchasing tab). Server-side paged + filtered
// (inventory-service). Backend supports single status/type + a PO-number `q`;
// the mock's multi-status/compound chips, broad search, "open · committed cost"
// header stat, and WO#/site columns need backend work — see
// FE_ASK_purchasing_list_enrichment.md. Rows open the PO detail.
type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED', 'CANCELLED'];
const STATUS_TONE: Record<PurchaseOrderStatus, PillTone> = {
  DRAFT: 'neutral',
  ORDERED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'violet',
  CANCELLED: 'neutral',
};
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  BILLED: 'Billed',
  CANCELLED: 'Cancelled',
};
const TYPES: PurchaseOrderType[] = ['FIELD', 'ORDER', 'STOCK'];
const TYPE_LABEL: Record<PurchaseOrderType, string> = {
  FIELD: 'Field purchase',
  ORDER: 'Special order',
  STOCK: 'Stock',
};

const PAGE_SIZE = 50;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n?: number | null) => currency.format(n ?? 0);
const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

export default function PurchasingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const status = (searchParams.get('status') as PurchaseOrderStatus | null) || null;
  const type = (searchParams.get('type') as PurchaseOrderType | null) || null;

  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: key === 'search' });
  };
  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-orders', 'list', page, deferredSearch, status, type],
    queryFn: () =>
      purchaseOrderApi.list({
        page: page - 1,
        size: PAGE_SIZE,
        q: deferredSearch || undefined,
        status: status || undefined,
        type: type || undefined,
      }),
  });

  const orders = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const hasFilters = !!deferredSearch || !!status || !!type;
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  // Header stat: "committed cost" (sum of open POs) needs a backend aggregate we
  // don't have — degrade to the total count until FE_ASK_purchasing_list_enrichment lands.
  const subtitle =
    total === 0 && !isLoading ? null : `${total.toLocaleString()} purchase order${total === 1 ? '' : 's'}`;

  return (
    <AppLayout>
      <div>
        <PageHead
          title="Purchasing"
          sub={subtitle}
          actions={
            <div className="flex items-center gap-2">
              <Button outline href="/purchase-orders/new?type=field&from=purchasing">
                <ReceiptPercentIcon data-slot="icon" />
                Record field purchase
              </Button>
              <Button color="accent" href="/purchase-orders/new?type=order&from=purchasing">
                <PlusIcon data-slot="icon" />
                New PO
              </Button>
            </div>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder="Search PO number…"
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setParam('search', value);
              }}
            />
          }
        >
          <FilterChipListbox
            label="Status"
            ariaLabel="Status"
            value={status}
            displayValue={status ? STATUS_LABEL[status] : null}
            resetLabel="Any status"
            onChange={(v) => setParam('status', v)}
            onClear={() => setParam('status', null)}
          >
            {STATUSES.map((s) => (
              <ChipListboxOption key={s} value={s}>
                {STATUS_LABEL[s]}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
          <FilterChipListbox
            label="Type"
            ariaLabel="Type"
            value={type}
            displayValue={type ? TYPE_LABEL[type] : null}
            resetLabel="Any type"
            onChange={(v) => setParam('type', v)}
            onClear={() => setParam('type', null)}
          >
            {TYPES.map((ty) => (
              <ChipListboxOption key={ty} value={ty}>
                {TYPE_LABEL[ty]}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        </ListToolbar>

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label="Loading purchase orders…" />
            ) : error ? (
              <ErrorState
                title="Couldn't load purchase orders"
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<CubeIcon className="size-10 text-fg-dim" />}
                title={hasFilters ? 'No purchase orders match your filters' : 'No purchase orders yet'}
                action={
                  hasFilters ? (
                    <Button outline onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <DenseTable className="dense-stack">
                    <DenseTHead>
                      <tr>
                        <th>Purchase order</th>
                        <th>Vendor</th>
                        <th>For</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th className="right">Cost</th>
                      </tr>
                    </DenseTHead>
                    <tbody>
                      {orders.map((po) => {
                        const cancelled = po.status === 'CANCELLED';
                        return (
                          <DenseRow
                            key={po.id}
                            className={`cursor-pointer ${cancelled ? 'opacity-55' : ''}`}
                            onClick={() => navigate(`/purchase-orders/${po.id}?from=purchasing`)}
                          >
                            <td>
                              <CellStack>
                                <CellTop>
                                  <span className="font-mono font-bold text-fg-strong">{po.poNumber}</span>
                                  <Tag word>{TYPE_LABEL[po.type]}</Tag>
                                </CellTop>
                                <CellSub>
                                  {po.itemCount} {po.itemCount === 1 ? 'item' : 'items'}
                                </CellSub>
                              </CellStack>
                            </td>
                            <td data-label="Vendor">
                              <span className="text-fg-strong">{po.vendorName}</span>
                            </td>
                            <td className="muted" data-label="For">
                              {po.workOrderId ? 'Work order' : 'Stock'}
                            </td>
                            <td data-label="Status">
                              <Pill tone={STATUS_TONE[po.status]} dot={!cancelled}>
                                {STATUS_LABEL[po.status]}
                              </Pill>
                            </td>
                            <td className="muted" data-label="Date">
                              <CellStack>
                                <CellTop>{formatDate(po.createdAt)}</CellTop>
                                {po.eta && <CellSub>ETA {formatDate(po.eta)}</CellSub>}
                              </CellStack>
                            </td>
                            <td className="right num" data-label="Cost">
                              <span className="font-mono font-semibold text-fg-strong">{money(po.totalCost)}</span>
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
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
