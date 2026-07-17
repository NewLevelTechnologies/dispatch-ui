/* eslint-disable i18next/no-literal-string -- dense records list; short procurement column/label strings stay literal (same convention as VendorsPage). */
import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CubeIcon, ReceiptPercentIcon, PlusIcon } from '@heroicons/react/24/outline';
import { purchaseOrderApi, type PurchaseOrderStatus, type PurchaseOrderType } from '../api';
import AppLayout from '../components/AppLayout';
import { extractApiError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { PoTypeBadge } from '../components/ui/PoTypeBadge';
import { PO_STATUS_LABEL, PO_STATUS_TONE, PO_TYPE_LABEL, poStatusHasDot } from '../lib/poStatus';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

// Purchasing — records-level list of POs across every job + vendor (the office
// companion to the WO Purchasing tab). Server-side paged + filtered
// (inventory-service). Status pill + type badge come from the shared PO display
// helpers so every surface reads the same. Rows open the PO detail.
const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED', 'CANCELLED'];
const TYPES: PurchaseOrderType[] = ['FIELD', 'ORDER', 'STOCK'];

// Quick-chip presets (server-side, via the plural status filter).
const AWAITING: PurchaseOrderStatus[] = ['ORDERED', 'PARTIALLY_RECEIVED'];
const TO_BILL: PurchaseOrderStatus[] = ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'];
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

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
  // Status is multi (repeated ?status=…); memoize so the query key is stable per URL.
  const statusSel = useMemo(() => searchParams.getAll('status') as PurchaseOrderStatus[], [searchParams]);
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
  const setStatuses = (values: PurchaseOrderStatus[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    values.forEach((s) => next.append('status', s));
    next.delete('page');
    setSearchParams(next, { replace: false });
  };
  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  // Shared filter args for the list + summary so the header stat stays in sync.
  const filterArgs = {
    q: deferredSearch || undefined,
    status: statusSel.length ? statusSel : undefined,
    type: type || undefined,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-orders', 'list', page, deferredSearch, statusSel, type],
    queryFn: () => purchaseOrderApi.list({ page: page - 1, size: PAGE_SIZE, ...filterArgs }),
  });
  // Header aggregate over the whole filtered set (open count + committed cost).
  const { data: summary } = useQuery({
    queryKey: ['purchase-orders', 'summary', deferredSearch, statusSel, type],
    queryFn: () => purchaseOrderApi.summary(filterArgs),
  });

  // Quick-chip counts — global preset totals (independent of the current
  // selection), via lean size-1 list calls read for totalElements.
  const { data: awaitingCount } = useQuery({
    queryKey: ['purchase-orders', 'chip-count', 'awaiting'],
    queryFn: () => purchaseOrderApi.list({ status: AWAITING, size: 1 }).then((p) => p.totalElements),
  });
  const { data: fieldCount } = useQuery({
    queryKey: ['purchase-orders', 'chip-count', 'field'],
    queryFn: () => purchaseOrderApi.list({ type: 'FIELD', size: 1 }).then((p) => p.totalElements),
  });
  const { data: toBillCount } = useQuery({
    queryKey: ['purchase-orders', 'chip-count', 'tobill'],
    queryFn: () => purchaseOrderApi.list({ status: TO_BILL, size: 1 }).then((p) => p.totalElements),
  });

  const orders = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const awaitingActive = sameSet(statusSel, AWAITING);
  const toBillActive = sameSet(statusSel, TO_BILL);

  const hasFilters = !!deferredSearch || statusSel.length > 0 || !!type;
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  // Header stat — open count + committed cost over the whole filtered set (from
  // the summary aggregate). Only the two values are emphasized; the words stay
  // muted (PageHead renders sub muted).
  const subtitle = summary ? (
    <>
      <span className="font-semibold text-fg-strong">{summary.openCount.toLocaleString()}</span> open ·{' '}
      <span className="font-semibold text-fg-strong">{money(summary.committedCost)}</span> committed cost
    </>
  ) : null;

  return (
    <AppLayout>
      <div className="max-w-[1320px]">
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
              placeholder="Search PO#, vendor, job, site…"
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setParam('search', value);
              }}
            />
          }
        >
          <FilterChipListbox
            multiple
            label="Status"
            ariaLabel="Status"
            value={statusSel}
            displayValue={
              statusSel.length === 0
                ? null
                : statusSel.length === 1
                  ? PO_STATUS_LABEL[statusSel[0]]
                  : `${statusSel.length} selected`
            }
            onChange={(ids) => setStatuses(ids as PurchaseOrderStatus[])}
            onClear={() => setStatuses([])}
          >
            {STATUSES.map((s) => (
              <ChipListboxOption key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
          <FilterChipListbox
            label="Type"
            ariaLabel="Type"
            value={type}
            displayValue={type ? PO_TYPE_LABEL[type] : null}
            resetLabel="Any type"
            onChange={(v) => setParam('type', v)}
            onClear={() => setParam('type', null)}
          >
            {TYPES.map((ty) => (
              <ChipListboxOption key={ty} value={ty}>
                {PO_TYPE_LABEL[ty]}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
          <FilterChipRow>
            <FilterChip
              label="Awaiting receipt"
              count={awaitingCount}
              active={awaitingActive}
              onToggle={() => setStatuses(awaitingActive ? [] : AWAITING)}
            />
            <FilterChip
              label="Field purchases"
              count={fieldCount}
              active={type === 'FIELD'}
              onToggle={() => setParam('type', type === 'FIELD' ? null : 'FIELD')}
            />
            <FilterChip
              label="To bill"
              count={toBillCount}
              active={toBillActive}
              onToggle={() => setStatuses(toBillActive ? [] : TO_BILL)}
            />
          </FilterChipRow>
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
                        <th className="whitespace-nowrap">Status</th>
                        <th className="whitespace-nowrap">Date</th>
                        <th className="right whitespace-nowrap">Cost</th>
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
                                  <span className="flex items-baseline gap-1.5">
                                    <span
                                      className={`font-mono ${cancelled ? 'font-normal text-fg-muted' : 'font-bold text-fg-strong'}`}
                                    >
                                      {po.poNumber}
                                    </span>
                                    <PoTypeBadge type={po.type} />
                                  </span>
                                </CellTop>
                                <CellSub>
                                  {po.itemCount} {po.itemCount === 1 ? 'item' : 'items'}
                                  {po.createdByName ? ` · ${po.createdByName}` : ''}
                                </CellSub>
                              </CellStack>
                            </td>
                            <td data-label="Vendor">
                              <span className="text-fg-strong">{po.vendorName}</span>
                            </td>
                            <td data-label="For">
                              {po.workOrderId ? (
                                <CellStack>
                                  <CellTop>
                                    {po.workOrderNumber ? (
                                      <Link
                                        to={`/work-orders/${po.workOrderId}?from=purchasing`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-mono font-semibold text-fg-accent hover:underline"
                                      >
                                        {po.workOrderNumber}
                                      </Link>
                                    ) : (
                                      <span className="text-fg-dim">—</span>
                                    )}
                                  </CellTop>
                                  {po.serviceLocationName && <CellSub>{po.serviceLocationName}</CellSub>}
                                </CellStack>
                              ) : (
                                <span className="text-fg-muted">Stock</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap" data-label="Status">
                              <Pill tone={PO_STATUS_TONE[po.status]} dot={poStatusHasDot(po.status)}>
                                {PO_STATUS_LABEL[po.status]}
                              </Pill>
                            </td>
                            <td className="muted whitespace-nowrap" data-label="Date">
                              <CellStack>
                                <CellTop>{formatDate(po.createdAt)}</CellTop>
                                {po.eta && <CellSub>ETA {formatDate(po.eta)}</CellSub>}
                              </CellStack>
                            </td>
                            <td className="right num whitespace-nowrap" data-label="Cost">
                              <span className="font-semibold tabular-nums text-fg-strong">{money(po.totalCost)}</span>
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
