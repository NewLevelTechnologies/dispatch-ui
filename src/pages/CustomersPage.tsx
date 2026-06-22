import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { customerApi, tagApi, type Customer, type TagSummary } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { formatPhone } from '../utils/formatPhone';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { extractApiError, showError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { TagPill } from '../components/ui/TagPill';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { StatusPickerChip } from '../components/ui/StatusPickerChip';
import {
  DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub,
} from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

// Desktop-dense CSR layout — see CLAUDE.md. 50 per page keeps two pages
// visible on a 1080p monitor without scrolling.
const PAGE_SIZE = 50;

type CustomerStatusKey = 'active' | 'inactive';
const STATUS_KEYS: readonly CustomerStatusKey[] = ['active', 'inactive'] as const;
const DEFAULT_STATUSES: CustomerStatusKey[] = ['active'];

// Parse status multi-param. Default ['active'] when the URL has no status —
// explicit default visible in the chip, not silent backend filtering. Any
// unrecognized values are dropped; empty-after-filter falls back to default.
function readStatuses(params: URLSearchParams): CustomerStatusKey[] {
  const raw = params.getAll('status');
  if (raw.length === 0) return DEFAULT_STATUSES;
  const parsed = raw.filter((v): v is CustomerStatusKey =>
    (STATUS_KEYS as readonly string[]).includes(v)
  );
  return parsed.length > 0 ? parsed : DEFAULT_STATUSES;
}

function readBool(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

// Tag chip display: name for 1, "name1, name2" for 2, "N selected" for 3+.
// Same pattern as WorkOrdersPage's multi-select filter chips.
function formatTagDisplayValue(
  ids: string[],
  list: { id: string; name: string }[],
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (ids.length === 0) return null;
  const lookup = (id: string) => list.find((x) => x.id === id)?.name ?? id;
  if (ids.length === 1) return lookup(ids[0]);
  if (ids.length === 2) return ids.map(lookup).join(', ');
  return t('common.selectedCount', { count: ids.length });
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // URL-driven filter state (same pattern as UsersPage).
  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const statuses = useMemo(() => readStatuses(searchParams), [searchParams]);
  const openBalanceFilter = readBool(searchParams.get('openBalance'));
  const openJobsFilter = readBool(searchParams.get('openJobs'));
  const agedFilter = readBool(searchParams.get('aged'));
  // Tag filter ids — URL writes repeated `?tag=uuid` params; the API serializes
  // to comma-separated `?tags=uuid1,uuid2` on the wire. getAll() returns a fresh
  // array each call, so memoize to keep the query key stable across renders.
  const tagIds = useMemo(() => searchParams.getAll('tag'), [searchParams]);

  // Local input mirrors the URL but lets typing feel instant.
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const canAddCustomers = useHasCapability('ADD_CUSTOMERS');
  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const canArchiveCustomers = useHasCapability('ARCHIVE_CUSTOMERS');

  const updateFilters = (
    updates: {
      search?: string;
      status?: CustomerStatusKey[];
      openBalance?: boolean;
      openJobs?: boolean;
      aged?: boolean;
      tag?: string[];
      page?: number;
    },
    options: { replace?: boolean } = {}
  ) => {
    const next = new URLSearchParams(searchParams);
    const resetPage = () => next.delete('page');

    if (updates.search !== undefined) {
      if (updates.search) next.set('search', updates.search);
      else next.delete('search');
      resetPage();
    }
    if (updates.status !== undefined) {
      next.delete('status');
      // Default-active scope stays implicit in the URL; only persist when the
      // selection diverges. Equal-length + same-members check is fine here
      // since the set is tiny and order is canonical.
      const isDefault =
        updates.status.length === DEFAULT_STATUSES.length &&
        updates.status.every((s) => DEFAULT_STATUSES.includes(s));
      if (!isDefault) {
        for (const s of updates.status) next.append('status', s);
      }
      resetPage();
    }
    if (updates.openBalance !== undefined) {
      if (updates.openBalance) next.set('openBalance', 'true');
      else next.delete('openBalance');
      resetPage();
    }
    if (updates.openJobs !== undefined) {
      if (updates.openJobs) next.set('openJobs', 'true');
      else next.delete('openJobs');
      resetPage();
    }
    if (updates.aged !== undefined) {
      if (updates.aged) next.set('aged', 'true');
      else next.delete('aged');
      resetPage();
    }
    if (updates.tag !== undefined) {
      next.delete('tag');
      for (const id of updates.tag) next.append('tag', id);
      resetPage();
    }
    if (updates.page !== undefined) {
      if (updates.page <= 1) next.delete('page');
      else next.set('page', String(updates.page));
    }
    setSearchParams(next, { replace: options.replace ?? false });
  };

  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  // Build the API status param: array of upper-case enum values, undefined
  // when both statuses are selected (BE treats that as "no filter").
  const apiStatuses = useMemo<Array<'ACTIVE' | 'INACTIVE'> | undefined>(() => {
    if (statuses.length === STATUS_KEYS.length) return undefined;
    return statuses.map((s) => s.toUpperCase() as 'ACTIVE' | 'INACTIVE');
  }, [statuses]);

  // Tag list for the filter picker. Tenants typically have <50 tags (hard cap
  // 200), so a single load + client-side filtering in the picker is fine.
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagApi.getAll(),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'customers',
      page,
      deferredSearch,
      statuses,
      openBalanceFilter,
      openJobsFilter,
      agedFilter,
      tagIds,
    ],
    queryFn: () => customerApi.getAllPaginated({
      page,
      limit: PAGE_SIZE,
      search: deferredSearch || undefined,
      status: apiStatuses,
      hasOpenBalance: openBalanceFilter || undefined,
      hasOpenJobs: openJobsFilter || undefined,
      hasAgedBalance: agedFilter || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
    }),
  });

  const customers = data?.content ?? [];
  const totalCustomers = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const counts = data?.counts;
  const showingStart = totalCustomers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, totalCustomers);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: unknown) => {
      showError(
        t('common.form.errorDelete', { entity: getName('customer') }),
        extractApiError(err) ?? undefined
      );
    },
  });

  const handleAdd = () => {
    // Create moved to a full-page form (/customers/new). Edit-from-list still
    // uses the dialog below (being redesigned separately).
    navigate('/customers/new');
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: customer.name }))) {
      deleteMutation.mutate(customer.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedCustomer(null);
  };

  const headerTotal = counts?.total ?? totalCustomers;
  const headerActive = counts?.active;
  const customerNoun =
    headerTotal === 1
      ? getName('customer').toLowerCase()
      : getName('customer', true).toLowerCase();
  const subtitle = (() => {
    if (headerTotal === 0 && !isLoading) return null;
    const parts: string[] = [`${headerTotal.toLocaleString()} ${customerNoun}`];
    if (typeof headerActive === 'number') {
      parts.push(`${headerActive.toLocaleString()} ${t('common.active').toLowerCase()}`);
    }
    return (
      <>
        {parts.join(' · ')}
        {' · '}
        <Link to="/payers" className="text-fg-accent hover:underline">
          {t('customers.viewPayers', { entities: getName('payer', true) })}
        </Link>
      </>
    );
  })();

  // Whether the current view diverges from the defaults (search, non-active
  // status scope, or any boolean chip). Drives the two-flavor empty state.
  const statusesAreDefault =
    statuses.length === DEFAULT_STATUSES.length &&
    statuses.every((s) => DEFAULT_STATUSES.includes(s));
  const hasFilters = Boolean(
    deferredSearch || !statusesAreDefault || openBalanceFilter || openJobsFilter || agedFilter || tagIds.length > 0
  );
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const statusOptions = [
    { id: 'active', label: t('customers.filter.statusActive'), count: counts?.active },
    { id: 'inactive', label: t('customers.filter.statusInactive'), count: counts?.inactive },
  ];

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('customer', true)}
          sub={subtitle}
          actions={
            canAddCustomers ? (
              <Button color="accent" onClick={handleAdd}>
                {t('common.actions.add', { entity: getName('customer') })}
              </Button>
            ) : null
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('customers.search.placeholder')}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                updateFilters({ search: value }, { replace: true });
              }}
            />
          }
        >
          <StatusPickerChip
            label={t('customers.filter.status')}
            options={statusOptions}
            selected={statuses}
            onChange={(next) => updateFilters({ status: next as CustomerStatusKey[] })}
            allLabel={t('customers.filter.all')}
            allShortcutLabel={t('customers.filter.allStatuses')}
          />
          {(tags?.length ?? 0) > 0 && (
            <FilterChipListbox
              multiple
              label={t('customers.filter.tags')}
              ariaLabel={t('customers.filter.tags')}
              value={tagIds}
              displayValue={formatTagDisplayValue(tagIds, tags ?? [], t)}
              onChange={(ids) => updateFilters({ tag: ids })}
              onClear={() => updateFilters({ tag: [] })}
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
              label={t('customers.filter.openBalance')}
              count={counts?.openBalance}
              active={openBalanceFilter}
              onToggle={() => updateFilters({ openBalance: !openBalanceFilter })}
            />
            <FilterChip
              label={t('customers.filter.openJobs')}
              count={counts?.openJobs}
              tone="info"
              active={openJobsFilter}
              onToggle={() => updateFilters({ openJobs: !openJobsFilter })}
            />
            <FilterChip
              label={t('customers.filter.aged')}
              count={counts?.aged}
              tone="warning"
              active={agedFilter}
              onToggle={() => updateFilters({ aged: !agedFilter })}
            />
          </FilterChipRow>
        </ListToolbar>

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState
                label={t('common.actions.loading', { entities: getName('customer', true) })}
              />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: getName('customer', true) })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : customers.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={<UserGroupIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noMatchFilters', { entities: getName('customer', true) })}
                  description={t('common.actions.tryAdjustingFilters')}
                  action={
                    <Button outline onClick={clearFilters}>
                      {t('users.filter.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<UserGroupIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noEntitiesYet', { entities: getName('customer', true) })}
                  action={
                    canAddCustomers ? (
                      <Button color="accent" onClick={handleAdd}>
                        {t('common.actions.add', { entity: getName('customer') })}
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{getName('customer')}</th>
                      <th>{t('customers.table.billingAddress')}</th>
                      <th>{t('customers.table.contact')}</th>
                      <th>{t('customers.table.openJobs')}</th>
                      <th>{t('customers.table.tags')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {customers.map((customer) => {
                      const isInactive = customer.status === 'INACTIVE';
                      return (
                        <DenseRow
                          key={customer.id}
                          className={`cursor-pointer ${isInactive ? 'opacity-55' : ''}`}
                          onClick={(e: React.MouseEvent) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('[role="menu"]') || target.closest('button[aria-label]') || target.closest('a')) return;
                            navigate(`/customers/${customer.id}`);
                          }}
                        >
                          <td>
                            <CellStack>
                              <CellTop>
                                <span className="font-semibold text-fg-strong">{customer.name}</span>
                                {customer.hasAgedBalance && (
                                  <Pill
                                    tone="warning"
                                    className="ml-1.5 align-middle text-[9.5px] font-bold uppercase tracking-[0.04em]"
                                    title={t('customers.agedBadgeAria')}
                                  >
                                    {t('customers.agedBadge')}
                                  </Pill>
                                )}
                                {isInactive && (
                                  <Pill
                                    tone="neutral"
                                    className="ml-1.5 align-middle text-[9.5px] font-bold uppercase tracking-[0.04em]"
                                  >
                                    {t('customers.inactiveBadge')}
                                  </Pill>
                                )}
                              </CellTop>
                              <CellSub>
                                {customer.customerNumber && (
                                  <span className="font-mono">{customer.customerNumber}</span>
                                )}
                                {customer.customerNumber && customer.serviceLocationCount > 1 && (
                                  <span className="text-fg-dim"> · </span>
                                )}
                                {customer.serviceLocationCount > 1
                                  ? t('customers.table.locationsCount', { count: customer.serviceLocationCount })
                                  : null}
                              </CellSub>
                            </CellStack>
                          </td>
                          <td>
                            <CellStack>
                              {/* No inline label — a street address is self-identifying by format. */}
                              <CellTop>
                                {titleCaseAddress(customer.billingAddress.streetAddress)}
                              </CellTop>
                              <CellSub>
                                {titleCaseAddress(customer.billingAddress.city)}, {customer.billingAddress.state} {customer.billingAddress.zipCode}
                              </CellSub>
                            </CellStack>
                          </td>
                          <td>
                            <CellStack>
                              <CellTop>
                                <span className="dt-inline-label">{t('customers.table.contact')}: </span>
                                {customer.phone ? (
                                  <a
                                    href={`tel:${customer.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-mono hover:underline"
                                  >
                                    {formatPhone(customer.phone)}
                                  </a>
                                ) : (
                                  <span className="text-fg-dim">—</span>
                                )}
                              </CellTop>
                              <CellSub>
                                <a
                                  href={`mailto:${customer.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:underline"
                                >
                                  {customer.email}
                                </a>
                              </CellSub>
                            </CellStack>
                          </td>
                          <td
                            className={clsx(!(customer.openJobsCount && customer.openJobsCount > 0) && 'dt-empty')}
                            data-label={t('customers.table.openJobs')}
                          >
                            {customer.openJobsCount && customer.openJobsCount > 0 ? (
                              <Pill tone="info" dot>
                                {t('customers.table.jobsCount', { count: customer.openJobsCount })}
                              </Pill>
                            ) : (
                              <span className="text-fg-dim">—</span>
                            )}
                          </td>
                          <td
                            className={clsx(!(customer.tags && customer.tags.length > 0) && 'dt-empty')}
                            data-label={t('customers.table.tags')}
                          >
                            <TagList tags={customer.tags} />
                          </td>
                          <td className="right">
                            {(canEditCustomers || canArchiveCustomers) && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <Dropdown>
                                  <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                                    <EllipsisVerticalIcon className="size-4" />
                                  </DropdownButton>
                                  <DropdownMenu anchor="bottom end">
                                    <DropdownItem onClick={() => navigate(`/customers/${customer.id}`)}>
                                      <DropdownLabel>{t('common.view')}</DropdownLabel>
                                    </DropdownItem>
                                    {canEditCustomers && (
                                      <DropdownItem
                                        onClick={async () => {
                                          const fullCustomer = await customerApi.getById(customer.id);
                                          handleEdit(fullCustomer);
                                        }}
                                      >
                                        <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                      </DropdownItem>
                                    )}
                                    {canArchiveCustomers && (
                                      <DropdownItem
                                        onClick={async () => {
                                          const fullCustomer = await customerApi.getById(customer.id);
                                          handleDelete(fullCustomer);
                                        }}
                                      >
                                        <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                      </DropdownItem>
                                    )}
                                  </DropdownMenu>
                                </Dropdown>
                              </div>
                            )}
                          </td>
                        </DenseRow>
                      );
                    })}
                  </tbody>
                </DenseTable>

                <ListFooter
                  page={page}
                  totalPages={totalPages}
                  pageHref={pageHref}
                  left={t('common.pagination.showing', {
                    start: showingStart,
                    end: showingEnd,
                    total: totalCustomers.toLocaleString(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <CustomerFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        customer={selectedCustomer}
      />
    </AppLayout>
  );
}

// Up to two tags visible + "+N" overflow. Color from tag.color isn't surfaced
// here — uniform muted treatment keeps the row scannable; per-tag color shows
// in the tag editor where it's actionable.
function TagList({ tags }: { tags?: TagSummary[] }) {
  if (!tags || tags.length === 0) return <span className="text-fg-dim">—</span>;
  const visible = tags.slice(0, 2);
  const overflow = tags.slice(2);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <TagPill key={tag.id} color={tag.color} name={tag.name} className="max-w-[140px]" />
      ))}
      {overflow.length > 0 && (
        <span title={overflow.map((tag) => tag.name).join(', ')}>
          <Pill tone="neutral">+{overflow.length}</Pill>
        </span>
      )}
    </div>
  );
}
