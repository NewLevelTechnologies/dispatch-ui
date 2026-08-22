import { useEffect, useState, useDeferredValue, useMemo } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import { customerApi, tagApi } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import { formatTimestamp } from '@dispatch/utils';
import { formatTagDisplayValue } from '../lib/tagDisplay';
import { extractApiError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { EntityToggle } from '../components/ui/EntityToggle';
import { Card, CardBody } from '../components/ui/Card';
import { TagPill } from '../components/ui/TagPill';
import { TagList } from '../components/ui/TagList';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { SortHeader, type SortDir, type SortState } from '../components/ui/SortHeader';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { PayerMark } from '../components/customer-detail/shared';

// Payers list — the bookkeeper triage surface for BILLING_ONLY customers
// ("find who owes"). Default sort is outstanding,desc (server-side; we just omit
// `sort`). Mirrors CustomersPage's shell/state pattern, with payer-specific
// financial columns from the PAYERS-LIST-1 denorm. Row → /customers/:id, which
// the shape router resolves to PayerDetail.
//
// Filter chips: open-balance / 91+-aged, server-side (?openBalance / ?agedBalance),
// with badge counts off the response envelope (counts.openBalance / counts.aged) —
// same contract as the main customers list. openJobs is meaningless for
// billing-only payers, so it's not offered.
//
// Payer "subtype" is modeled as tags (PAYERS-LIST-1), not a dedicated enum: tags
// render in the name subline and the Tags filter (?tags=, OR semantics) is the
// "type" filter. Tags come from the tenant-wide tag set, same as the customers
// list — no curated payer-type subset (would need BE tag grouping; deferred).
//
// Still deferred (needs a BE param): the Status picker. Client-side filtering a
// paged list would be wrong, so it waits for the server param.
const PAGE_SIZE = 50;

function readBool(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

// AR figures read as whole dollars on a scan line (no cents); lifetime is a big
// rough number → compact "$Nk".
const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const moneyK = (n: number) =>
  n >= 1000 ? '$' + Math.round(n / 1000).toLocaleString('en-US') + 'k' : '$' + Math.round(n);

// BE-supported sort keys. Default is outstanding,desc (the bookkeeper triage
// order) — represented as "no sort param" so we get the server default.
const DEFAULT_SORT: SortState = { key: 'outstanding', dir: 'desc' };
// Columns that read best most-first (amounts, counts, dates) default to desc on
// first click; text columns (name, terms) default to asc.
const DESC_FIRST = new Set(['outstanding', 'aged91', 'openInvoices', 'lifetimePaid', 'lastPayment', 'createdAt']);

function parseSort(raw: string | null): SortState {
  if (raw) {
    const [key, dir] = raw.split(',');
    if (key) return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
  }
  return DEFAULT_SORT;
}

export default function PayersPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  // Payers are customers — gate the Add button on the customer capability.
  const canAddPayers = useHasCapability('ADD_CUSTOMERS');

  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const openBalanceFilter = readBool(searchParams.get('openBalance'));
  const agedFilter = readBool(searchParams.get('agedBalance'));
  // Tag ("type") filter ids — URL writes repeated `?tag=uuid` params; the API
  // serializes to comma-separated `?tags=` on the wire. getAll() returns a fresh
  // array each call, so memoize to keep the query key stable across renders.
  const tagIds = useMemo(() => searchParams.getAll('tag'), [searchParams]);
  const sortParam = searchParams.get('sort');
  const currentSort = parseSort(sortParam);
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
  };
  // Boolean chip toggle: write/clear the param and reset to page 1.
  const toggleFilter = (param: 'openBalance' | 'agedBalance', value: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(param, 'true');
    else next.delete(param);
    next.delete('page');
    setSearchParams(next, { replace: false });
  };
  // Tag filter: rewrite the repeated `?tag=` params and reset to page 1.
  const updateTags = (ids: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete('tag');
    for (const id of ids) next.append('tag', id);
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

  // Toggle dir when re-clicking the active column, else the column's default
  // dir. Writing the default (outstanding,desc) back into the URL is harmless —
  // it equals the implicit default the BE applies when the param is absent.
  const onSort = (key: string) => {
    const dir: SortDir =
      key === currentSort.key
        ? currentSort.dir === 'asc'
          ? 'desc'
          : 'asc'
        : DESC_FIRST.has(key)
          ? 'desc'
          : 'asc';
    const next = new URLSearchParams(searchParams);
    next.set('sort', `${key},${dir}`);
    next.delete('page');
    setSearchParams(next, { replace: false });
  };

  // Tag list for the "type" filter picker. Tenant-wide tag set (same source as
  // the customers list); tenants typically have <50 tags so no paging needed.
  const { data: tags } = useQuery({
    queryKey: ['tags', 'PAYER'],
    queryFn: () => tagApi.getAll({ scope: 'PAYER' }),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payers', page, deferredSearch, sortParam, openBalanceFilter, agedFilter, tagIds],
    // Omit `sort` → BE default outstanding,desc (the bookkeeper triage order).
    queryFn: () =>
      customerApi.getPayers({
        page,
        size: PAGE_SIZE,
        search: deferredSearch || undefined,
        sort: sortParam || undefined,
        hasOpenBalance: openBalanceFilter || undefined,
        hasAgedBalance: agedFilter || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      }),
  });

  const payers = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const counts = data?.counts;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const headerTotal = counts?.total ?? total;
  const headerActive = counts?.active;
  const payerNoun = headerTotal === 1 ? getName('payer').toLowerCase() : getName('payer', true).toLowerCase();
  const subtitle = (() => {
    if (headerTotal === 0 && !isLoading) return null;
    const parts = [`${headerTotal.toLocaleString()} ${payerNoun}`];
    if (typeof headerActive === 'number') {
      parts.push(`${headerActive.toLocaleString()} ${t('common.active').toLowerCase()}`);
    }
    // Customers reachable via the EntityToggle eyebrow now, not a cross-link.
    return parts.join(' · ');
  })();

  const hasFilters = Boolean(deferredSearch || openBalanceFilter || agedFilter || tagIds.length > 0);
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const termsLabel = (days: number) =>
    days > 0 ? t('payers.table.net', { days }) : t('payers.table.dueOnReceipt');

  return (
    <AppLayout>
      <div>
        <PageHead
          eyebrow={
            <EntityToggle
              ariaLabel={t('customers.entityToggleAria')}
              items={[
                { label: getName('customer', true), to: '/customers' },
                { label: getName('payer', true), to: '/payers' },
              ]}
            />
          }
          title={getName('payer', true)}
          sub={subtitle}
          actions={
            canAddPayers ? (
              <Button color="accent" onClick={() => navigate('/payers/new')}>
                {t('common.actions.add', { entity: getName('payer') })}
              </Button>
            ) : null
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('payers.search.placeholder')}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                updateSearch(value);
              }}
            />
          }
        >
          {(tags?.length ?? 0) > 0 && (
            <FilterChipListbox
              multiple
              label={t('payers.filter.tags')}
              ariaLabel={t('payers.filter.tags')}
              value={tagIds}
              displayValue={formatTagDisplayValue(tagIds, tags ?? [], t)}
              onChange={(ids) => updateTags(ids)}
              onClear={() => updateTags([])}
            >
              {(tags ?? []).map((tag) => (
                <ChipListboxOption key={tag.id} value={tag.id}>
                  <TagPill color={tag.color} name={tag.name} className="w-full" />
                </ChipListboxOption>
              ))}
            </FilterChipListbox>
          )}
          <FilterChipRow>
            <FilterChip
              label={t('payers.filter.openBalance')}
              count={counts?.openBalance}
              active={openBalanceFilter}
              onToggle={() => toggleFilter('openBalance', !openBalanceFilter)}
            />
            <FilterChip
              label={t('payers.filter.aged')}
              count={counts?.aged}
              tone="warning"
              active={agedFilter}
              onToggle={() => toggleFilter('agedBalance', !agedFilter)}
            />
          </FilterChipRow>
        </ListToolbar>

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('common.actions.loading', { entities: getName('payer', true) })} />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: getName('payer', true) })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : payers.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={<BanknotesIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noMatchFilters', { entities: getName('payer', true) })}
                  description={t('common.actions.tryAdjustingFilters')}
                  action={
                    <Button outline onClick={clearFilters}>
                      {t('payers.filter.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<BanknotesIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noEntitiesYet', { entities: getName('payer', true) })}
                />
              )
            ) : (
              <>
                <div className="overflow-x-auto">
                  <DenseTable className="dense-stack">
                    <DenseTHead>
                      <tr>
                        <SortHeader sortKey="name" label={getName('payer')} current={currentSort} onSort={onSort} />
                        <SortHeader sortKey="terms" label={t('payers.table.terms')} current={currentSort} onSort={onSort} />
                        <SortHeader sortKey="outstanding" label={t('payers.table.outstanding')} current={currentSort} onSort={onSort} align="right" />
                        <SortHeader sortKey="openInvoices" label={t('payers.table.openInvoices')} current={currentSort} onSort={onSort} align="right" />
                        <SortHeader sortKey="lifetimePaid" label={t('payers.table.lifetimePaid')} current={currentSort} onSort={onSort} align="right" />
                        <SortHeader sortKey="lastPayment" label={t('payers.table.lastPayment')} current={currentSort} onSort={onSort} />
                        <th>{t('payers.table.tags')}</th>
                      </tr>
                    </DenseTHead>
                    <tbody>
                      {payers.map((p) => {
                        const isInactive = p.status === 'INACTIVE';
                        const aged = (p.aged91Total ?? 0) > 0;
                        return (
                          <DenseRow
                            key={p.id}
                            className={`cursor-pointer ${isInactive ? 'opacity-55' : ''}`}
                            onClick={() => navigate(`/customers/${p.id}`)}
                          >
                            <td>
                              <div className="flex items-center gap-2.5">
                                <PayerMark size={26} />
                                <CellStack>
                                  <CellTop>
                                    <span className="font-semibold text-fg-strong">{p.name}</span>
                                  </CellTop>
                                  <CellSub>
                                    <span className="font-mono">{p.customerNumber || p.id}</span>
                                  </CellSub>
                                </CellStack>
                              </div>
                            </td>
                            <td className="muted" data-label={t('payers.table.terms')}>{termsLabel(p.paymentTermsDays)}</td>
                            <td
                              className={clsx('right', !(p.openBalanceTotal && p.openBalanceTotal > 0) && 'dt-empty')}
                              data-label={t('payers.table.outstanding')}
                            >
                              {p.openBalanceTotal && p.openBalanceTotal > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span
                                    className="font-mono font-bold tabular-nums"
                                    style={{ color: aged ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
                                  >
                                    {money0(p.openBalanceTotal)}
                                  </span>
                                  {aged && (
                                    <span className="text-[11px]" style={{ color: 'var(--warning-fg)' }}>
                                      {t('payers.table.in91', { amount: money0(p.aged91Total!) })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                            <td
                              className={clsx('right num', !(p.openInvoiceCount && p.openInvoiceCount > 0) && 'dt-empty')}
                              data-label={t('payers.table.openInvoices')}
                            >
                              {p.openInvoiceCount && p.openInvoiceCount > 0 ? (
                                p.openInvoiceCount
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                            <td
                              className={clsx('right num muted', p.lifetimePaid == null && 'dt-empty')}
                              data-label={t('payers.table.lifetimePaid')}
                            >
                              {p.lifetimePaid != null ? moneyK(p.lifetimePaid) : <span className="text-fg-dim">—</span>}
                            </td>
                            <td className={clsx('muted', !p.lastPaymentAt && 'dt-empty')}>
                              {p.lastPaymentAt ? (
                                <CellStack>
                                  <CellTop>
                                    <span className="dt-inline-label">{t('payers.table.lastPayment')}: </span>
                                    {formatTimestamp(p.lastPaymentAt)}
                                  </CellTop>
                                  {p.lastPaymentAmount != null && (
                                    <CellSub>
                                      <span className="font-mono">{money0(p.lastPaymentAmount)}</span>
                                    </CellSub>
                                  )}
                                </CellStack>
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                            <td
                              className={clsx(!(p.tags && p.tags.length > 0) && 'dt-empty')}
                              data-label={t('payers.table.tags')}
                            >
                              <TagList tags={p.tags} />
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
