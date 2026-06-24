import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MapPinIcon } from '@heroicons/react/24/outline';
import {
  customerApi,
  dispatchRegionApi,
  tagApi,
  type ServiceLocation,
  type TagSummary,
  type PremiseType,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import { TimeAgo } from '../components/TimeAgo';
import { formatPhone } from '../utils/formatPhone';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { extractApiError, showError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { TagPill } from '../components/ui/TagPill';
import { PremiseMark } from '../components/ui/PremiseMark';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { StatusPickerChip } from '../components/ui/StatusPickerChip';
import { FilterChipRow, FilterChip } from '../components/ui/FilterChipRow';
import {
  DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub,
} from '../components/ui/DenseTable';
import { SortHeader, type SortDir, type SortState } from '../components/ui/SortHeader';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

const PAGE_SIZE = 50;

type LocationStatusKey = 'active' | 'inactive' | 'closed';
const STATUS_KEYS: readonly LocationStatusKey[] = ['active', 'inactive', 'closed'] as const;
const DEFAULT_STATUSES: LocationStatusKey[] = ['active'];

type PremiseFilter = '' | 'business' | 'residence';

function readStatuses(params: URLSearchParams): LocationStatusKey[] {
  const raw = params.getAll('status');
  if (raw.length === 0) return DEFAULT_STATUSES;
  const parsed = raw.filter((v): v is LocationStatusKey =>
    (STATUS_KEYS as readonly string[]).includes(v)
  );
  return parsed.length > 0 ? parsed : DEFAULT_STATUSES;
}

function readPremise(raw: string | null): PremiseFilter {
  return raw === 'business' || raw === 'residence' ? raw : '';
}

function readBool(raw: string | null): boolean {
  return raw === 'true' || raw === '1';
}

// Tag chip display: name for 1, "name1, name2" for 2, "N selected" for 3+.
// Same pattern as the customers page + WorkOrdersPage filter chips.
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

// Server-sortable columns (see FE_HANDOFF_list_sort_pagination). Default is
// customerName,asc — represented as "no sort param" so the BE applies its own
// default (which groups a customer's locations together).
const DEFAULT_SORT: SortState = { key: 'customerName', dir: 'asc' };
// Date columns read best most-recent-first on the first click; text columns
// default to asc.
const DESC_FIRST = new Set(['lastServiceAt']);

function parseSort(raw: string | null): SortState {
  if (raw) {
    const [key, dir] = raw.split(',');
    if (key) return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
  }
  return DEFAULT_SORT;
}

export default function ServiceLocationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Holds the detail DTO fetched for editing; `notes` is omitted because it
  // diverged to a NoteDto[] collection on the detail DTO (the form ignores it).
  const [selectedLocation, setSelectedLocation] = useState<Omit<ServiceLocation, 'notes'> | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // URL-driven filter state
  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const regionId = searchParams.get('region') ?? '';
  const statuses = useMemo(() => readStatuses(searchParams), [searchParams]);
  const premiseFilter = readPremise(searchParams.get('premise'));
  const liveFilter = readBool(searchParams.get('live'));
  const openJobsFilter = readBool(searchParams.get('openJobs'));
  const overdueFilter = readBool(searchParams.get('overdue'));
  // Tag filter ids — URL writes repeated `?tag=uuid`; API serializes to
  // comma-separated `?tags=uuid1,uuid2` on the wire.
  const tagIds = useMemo(() => searchParams.getAll('tag'), [searchParams]);
  const sortParam = searchParams.get('sort');
  const currentSort = parseSort(sortParam);

  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: regions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(),
  });
  const activeRegions = (Array.isArray(regions) ? regions : []).filter((r) => r.isActive !== false);

  // Tenant tag list — typically <50 tags, so a single load + client-side
  // filtering in the picker is fine. Shared cache key with CustomersPage.
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagApi.getAll(),
  });

  const canAddServiceLocations = useHasCapability('ADD_SERVICE_LOCATIONS');
  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');
  const canCloseServiceLocations = useHasCapability('CLOSE_SERVICE_LOCATIONS');

  const updateFilters = (
    updates: {
      search?: string;
      region?: string;
      status?: LocationStatusKey[];
      premise?: PremiseFilter;
      live?: boolean;
      openJobs?: boolean;
      overdue?: boolean;
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
    if (updates.region !== undefined) {
      if (updates.region) next.set('region', updates.region);
      else next.delete('region');
      resetPage();
    }
    if (updates.status !== undefined) {
      next.delete('status');
      const isDefault =
        updates.status.length === DEFAULT_STATUSES.length &&
        updates.status.every((s) => DEFAULT_STATUSES.includes(s));
      if (!isDefault) {
        for (const s of updates.status) next.append('status', s);
      }
      resetPage();
    }
    if (updates.premise !== undefined) {
      if (updates.premise) next.set('premise', updates.premise);
      else next.delete('premise');
      resetPage();
    }
    if (updates.live !== undefined) {
      if (updates.live) next.set('live', 'true');
      else next.delete('live');
      resetPage();
    }
    if (updates.openJobs !== undefined) {
      if (updates.openJobs) next.set('openJobs', 'true');
      else next.delete('openJobs');
      resetPage();
    }
    if (updates.overdue !== undefined) {
      if (updates.overdue) next.set('overdue', 'true');
      else next.delete('overdue');
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

  // Toggle dir when re-clicking the active column, else the column's default
  // dir. Resets to page 1. Writing the default (customerName,asc) back is
  // harmless — it equals the implicit default the BE applies when absent.
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

  const apiStatuses = useMemo<Array<'ACTIVE' | 'INACTIVE' | 'CLOSED'> | undefined>(() => {
    if (statuses.length === STATUS_KEYS.length) return undefined;
    return statuses.map((s) => s.toUpperCase() as 'ACTIVE' | 'INACTIVE' | 'CLOSED');
  }, [statuses]);

  const apiPremise: 'business' | 'residence' | undefined =
    premiseFilter === 'business' || premiseFilter === 'residence'
      ? premiseFilter
      : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'service-locations',
      page,
      deferredSearch,
      regionId,
      statuses,
      premiseFilter,
      liveFilter,
      openJobsFilter,
      overdueFilter,
      tagIds,
      sortParam,
    ],
    queryFn: () => customerApi.getAllServiceLocationsPaginated({
      page,
      size: PAGE_SIZE,
      search: deferredSearch || undefined,
      dispatchRegionId: regionId || undefined,
      status: apiStatuses,
      premise: apiPremise,
      live: liveFilter || undefined,
      hasOpenJobs: openJobsFilter || undefined,
      pmOverdue: overdueFilter || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      sort: sortParam || undefined,
    }),
  });

  const locations = data?.content ?? [];
  const totalLocations = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const counts = data?.counts;

  const closeLocationMutation = useMutation({
    mutationFn: (locationId: string) =>
      customerApi.closeServiceLocation(locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (locationId: string) =>
      customerApi.deleteServiceLocation(locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: unknown) => {
      showError(
        t('common.form.errorDelete', { entity: getName('service_location') }),
        extractApiError(err) ?? undefined
      );
    },
  });

  const handleAdd = () => {
    // Create moved to the full-page Add Location form (/service-locations/new),
    // which picks the customer first. Edit-from-list still uses the dialog below.
    navigate('/service-locations/new');
  };

  const handleEdit = async (locationId: string, customerId: string) => {
    const location = await customerApi.getServiceLocationById(locationId);
    setSelectedLocation(location);
    setSelectedCustomerId(customerId);
    setIsDialogOpen(true);
  };

  const handleClose = (locationId: string, locationName: string, streetAddress: string) => {
    if (window.confirm(t('serviceLocations.actions.closeConfirm', { name: locationName || streetAddress }))) {
      closeLocationMutation.mutate(locationId);
    }
  };

  const handleDelete = (locationId: string, locationName: string, streetAddress: string) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: locationName || streetAddress }))) {
      deleteLocationMutation.mutate(locationId);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedLocation(null);
    setSelectedCustomerId(null);
  };

  const showingStart = totalLocations === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, totalLocations);

  const headerTotal = counts?.total ?? totalLocations;
  const headerActive = counts?.active;
  const headerCustomerCount = counts?.customerCount;
  const locationNoun =
    headerTotal === 1
      ? getName('service_location').toLowerCase()
      : getName('service_location', true).toLowerCase();
  const customerNounPlural = getName('customer', true).toLowerCase();
  const subtitle = (() => {
    if (headerTotal === 0 && !isLoading) return null;
    const parts: string[] = [`${headerTotal.toLocaleString()} ${locationNoun}`];
    if (typeof headerActive === 'number') {
      parts.push(`${headerActive.toLocaleString()} ${t('common.active').toLowerCase()}`);
    }
    if (typeof headerCustomerCount === 'number') {
      parts.push(`across ${headerCustomerCount.toLocaleString()} ${customerNounPlural}`);
    }
    return parts.join(' · ');
  })();

  const statusesAreDefault =
    statuses.length === DEFAULT_STATUSES.length &&
    statuses.every((s) => DEFAULT_STATUSES.includes(s));
  const hasFilters = Boolean(
    deferredSearch || regionId || !statusesAreDefault || premiseFilter
    || liveFilter || openJobsFilter || overdueFilter || tagIds.length > 0
  );
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const statusOptions = [
    { id: 'active', label: t('serviceLocations.filter.statusActive'), count: counts?.active },
    { id: 'inactive', label: t('serviceLocations.filter.statusInactive'), count: counts?.inactive },
    { id: 'closed', label: t('serviceLocations.filter.statusClosed'), count: counts?.closed },
  ];

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('service_location', true)}
          sub={subtitle}
          actions={
            canAddServiceLocations ? (
              <Button color="accent" onClick={handleAdd}>
                {t('common.actions.add', { entity: getName('service_location') })}
              </Button>
            ) : null
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('serviceLocations.search.placeholder')}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                updateFilters({ search: value }, { replace: true });
              }}
            />
          }
        >
          <StatusPickerChip
            label={t('serviceLocations.filter.status')}
            options={statusOptions}
            selected={statuses}
            onChange={(next) => updateFilters({ status: next as LocationStatusKey[] })}
            allLabel={t('serviceLocations.filter.all')}
            allShortcutLabel={t('serviceLocations.filter.allStatuses')}
          />
          {(tags?.length ?? 0) > 0 && (
            <FilterChipListbox
              multiple
              label={t('serviceLocations.filter.tags')}
              ariaLabel={t('serviceLocations.filter.tags')}
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
          {activeRegions.length > 0 && (
            <FilterChipListbox
              label={t('serviceLocations.filter.region')}
              ariaLabel={t('serviceLocations.filter.region')}
              value={regionId || null}
              displayValue={regionId ? activeRegions.find((r) => r.id === regionId)?.name ?? null : null}
              resetLabel={t('serviceLocations.filter.allRegions')}
              onChange={(id) => updateFilters({ region: id ?? '' })}
              onClear={() => updateFilters({ region: '' })}
            >
              {activeRegions.map((r) => (
                <ChipListboxOption key={r.id} value={r.id}>{r.name}</ChipListboxOption>
              ))}
            </FilterChipListbox>
          )}
          <FilterChipRow>
            <FilterChip
              label={t('serviceLocations.filter.live')}
              count={counts?.live}
              tone="info"
              active={liveFilter}
              onToggle={() => updateFilters({ live: !liveFilter })}
            />
            <FilterChip
              label={t('serviceLocations.filter.openJobs')}
              count={counts?.openJobs}
              tone="info"
              active={openJobsFilter}
              onToggle={() => updateFilters({ openJobs: !openJobsFilter })}
            />
            <FilterChip
              label={t('serviceLocations.filter.overdue')}
              count={counts?.overdue}
              tone="warning"
              active={overdueFilter}
              onToggle={() => updateFilters({ overdue: !overdueFilter })}
            />
            <FilterChip
              label={t('serviceLocations.filter.business')}
              count={counts?.business}
              active={premiseFilter === 'business'}
              onToggle={() =>
                updateFilters({ premise: premiseFilter === 'business' ? '' : 'business' })
              }
            />
            <FilterChip
              label={t('serviceLocations.filter.residence')}
              count={counts?.residence}
              active={premiseFilter === 'residence'}
              onToggle={() =>
                updateFilters({ premise: premiseFilter === 'residence' ? '' : 'residence' })
              }
            />
          </FilterChipRow>
        </ListToolbar>

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState
                label={t('common.actions.loading', { entities: getName('service_location', true) })}
              />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: getName('service_location', true) })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : locations.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={<MapPinIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noMatchFilters', { entities: getName('service_location', true) })}
                  description={t('common.actions.tryAdjustingFilters')}
                  action={
                    <Button outline onClick={clearFilters}>
                      {t('users.filter.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<MapPinIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noEntitiesYet', { entities: getName('service_location', true) })}
                  action={
                    canAddServiceLocations ? (
                      <Button color="accent" onClick={handleAdd}>
                        {t('common.actions.add', { entity: getName('service_location') })}
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
                      <SortHeader sortKey="customerName" label={getName('service_location')} current={currentSort} onSort={onSort} />
                      <th>{t('serviceLocations.table.region')}</th>
                      <SortHeader sortKey="status" label={t('common.form.status')} current={currentSort} onSort={onSort} />
                      <SortHeader sortKey="lastServiceAt" label={t('serviceLocations.table.lastService')} current={currentSort} onSort={onSort} />
                      <th>{t('serviceLocations.table.contact')}</th>
                      <th>{t('serviceLocations.table.tags')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {locations.map((location) => {
                      // Premise drives the glyph. Default to BUSINESS when the
                      // field is missing (BE migration still in flight) — the
                      // visual remains stable across the rollout window.
                      const premise: PremiseType =
                        location.premiseType === 'RESIDENCE' ? 'RESIDENCE' : 'BUSINESS';
                      // Name-led for both premise types. Locations with an
                      // org-assigned label use it; locations without one borrow
                      // the owning customer's name as the headline. Address is
                      // supporting info either way.
                      const headline = location.locationName || location.customerName;
                      const street = [location.address.streetAddress, location.address.streetAddressLine2]
                        .filter(Boolean).join(' ');
                      const stateZip = [location.address.state, location.address.zipCode].filter(Boolean).join(' ');
                      const addressLine = [titleCaseAddress(street), titleCaseAddress(location.address.city), stateZip]
                        .filter(Boolean).join(', ');
                      const rowTint = location.techOnSite
                        ? 'bg-[color-mix(in_oklch,var(--info-500)_4%,var(--bg-elev))]'
                        : location.pmOverdue
                          ? 'bg-[color-mix(in_oklch,var(--warning-500)_4%,var(--bg-elev))]'
                          : '';
                      const dimmed = location.status === 'INACTIVE' || location.status === 'CLOSED'
                        ? 'opacity-55'
                        : '';
                      const statusKey = location.status.toLowerCase() as LocationStatusKey;

                      return (
                        <DenseRow
                          key={location.id}
                          className={`cursor-pointer ${rowTint} ${dimmed}`.trim()}
                          onClick={(e: React.MouseEvent) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('[role="menu"]') || target.closest('button[aria-label]') || target.closest('a')) return;
                            navigate(`/service-locations/${location.id}?from=locations`);
                          }}
                        >
                          <td>
                            <div className="flex items-center gap-2">
                              <PremiseMark premise={premise} />
                              <CellStack>
                                <CellTop>
                                  <span className="font-semibold text-fg-strong">{headline}</span>
                                </CellTop>
                                <CellSub>{addressLine}</CellSub>
                              </CellStack>
                            </div>
                          </td>
                          <td
                            className={clsx(!location.dispatchRegionName && 'dt-empty')}
                            data-label={t('serviceLocations.table.region')}
                          >
                            {location.dispatchRegionName ? (
                              <span className="text-[11.5px] text-fg-muted">
                                {location.dispatchRegionName}
                              </span>
                            ) : (
                              <span className="text-fg-dim">—</span>
                            )}
                          </td>
                          <td>
                            <StatusIndicator status={statusKey} />
                          </td>
                          <td data-label={t('serviceLocations.table.lastService')}>
                            {location.lastServiceAt ? (
                              <TimeAgo iso={location.lastServiceAt} className="text-[11.5px] text-fg-muted" />
                            ) : (
                              <span className="text-[11px] text-fg-dim">
                                {t('serviceLocations.table.newCustomer')}
                              </span>
                            )}
                          </td>
                          <td className={clsx(!(location.siteContactName || location.siteContactPhone) && 'dt-empty')}>
                            {location.siteContactName || location.siteContactPhone ? (
                              <CellStack>
                                {location.siteContactName ? (
                                  <CellTop>
                                    <span className="dt-inline-label">{t('serviceLocations.table.contact')}: </span>
                                    {location.siteContactName}
                                  </CellTop>
                                ) : null}
                                {location.siteContactPhone && (
                                  <CellSub>
                                    {!location.siteContactName && (
                                      <span className="dt-inline-label">{t('serviceLocations.table.contact')}: </span>
                                    )}
                                    <a
                                      href={`tel:${location.siteContactPhone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="font-mono hover:underline"
                                    >
                                      {formatPhone(location.siteContactPhone)}
                                    </a>
                                  </CellSub>
                                )}
                              </CellStack>
                            ) : (
                              <span className="text-fg-dim">—</span>
                            )}
                          </td>
                          <td
                            className={clsx(!(location.tags && location.tags.length > 0) && 'dt-empty')}
                            data-label={t('serviceLocations.table.tags')}
                          >
                            <TagList tags={location.tags} />
                          </td>
                          <td className="right">
                            {(canEditServiceLocations || canCloseServiceLocations) && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <Dropdown>
                                  <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                                    <EllipsisVerticalIcon className="size-4" />
                                  </DropdownButton>
                                  <DropdownMenu anchor="bottom end">
                                    <DropdownItem onClick={() => navigate(`/service-locations/${location.id}?from=locations`)}>
                                      <DropdownLabel>{t('common.view')}</DropdownLabel>
                                    </DropdownItem>
                                    {canEditServiceLocations && (
                                      <DropdownItem onClick={() => handleEdit(location.id, location.customerId)}>
                                        <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                      </DropdownItem>
                                    )}
                                    {canCloseServiceLocations && (
                                      <>
                                        {location.status !== 'CLOSED' && (
                                          <DropdownItem onClick={() => handleClose(location.id, location.locationName || '', location.address.streetAddress)}>
                                            <DropdownLabel>{t('serviceLocations.actions.close')}</DropdownLabel>
                                          </DropdownItem>
                                        )}
                                        <DropdownItem onClick={() => handleDelete(location.id, location.locationName || '', location.address.streetAddress)}>
                                          <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                        </DropdownItem>
                                      </>
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
                    total: totalLocations.toLocaleString(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <ServiceLocationFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        serviceLocation={selectedLocation}
        customerId={selectedCustomerId}
      />
    </AppLayout>
  );
}

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
