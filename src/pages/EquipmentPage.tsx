import { useState, useDeferredValue } from 'react';
import clsx from 'clsx';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { withBackContext } from '../lib/backContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  EquipmentStatus,
  type EquipmentSummary,
  type EquipmentSortField,
  type EquipmentSortDirection,
} from '../api';
import AppLayout from '../components/AppLayout';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill } from '../components/ui/Pill';
import { ViewTabs } from '../components/ui/Tabs';
import {
  DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub,
} from '../components/ui/DenseTable';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import IconButton from '../components/IconButton';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';

const PAGE_SIZE = 50;

export default function EquipmentPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  // Empty string = "All" (both ACTIVE and RETIRED). Default lands on ACTIVE so
  // retired equipment doesn't crowd the day-to-day view.
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | ''>(EquipmentStatus.ACTIVE);
  // Page lives in the URL (1-based) so middle-click on pagination opens the
  // right page in a new tab. Internal `page` here stays 0-based to match the
  // backend Spring Page contract.
  const [searchParams, setSearchParams] = useSearchParams();
  // Links off the list carry its filter state, so a detail page's back-link
  // returns to this queue rather than a default view (see lib/backContext).
  const detailHref = (equipmentId: string): string =>
    withBackContext(`/equipment/${equipmentId}`, 'equipment', searchParams.toString());
  const locationHref = (locationId: string): string =>
    withBackContext(`/service-locations/${locationId}`, 'equipment', searchParams.toString());
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '1', 10) - 1);
  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 0) params.delete('page');
    else params.set('page', String(next + 1));
    setSearchParams(params);
  };
  const [sortBy] = useState<EquipmentSortField>('name');
  const [sortDir] = useState<EquipmentSortDirection>('asc');

  // Defer the search input so we don't fire a request on every keystroke
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
  });

  const { data: equipmentCategories = [] } = useQuery({
    queryKey: ['equipment-categories', typeFilter],
    queryFn: () => equipmentCategoriesApi.getAll(typeFilter || undefined),
    enabled: Boolean(typeFilter),
  });

  const {
    data: equipmentPage,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['equipment', { search: deferredSearch, typeFilter, categoryFilter, statusFilter, page, sortBy, sortDir }],
    queryFn: () =>
      equipmentApi.list({
        search: deferredSearch || undefined,
        equipmentTypeId: typeFilter || undefined,
        equipmentCategoryId: categoryFilter || undefined,
        status: statusFilter || undefined,
        page,
        size: PAGE_SIZE,
        sortBy,
        sortDir,
      }),
  });

  const equipment: EquipmentSummary[] = equipmentPage?.content ?? [];
  const totalElements = equipmentPage?.totalElements ?? 0;
  const totalPages = equipmentPage?.totalPages ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => equipmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      // Equipment summaries are embedded on workItems[].equipment in WO
      // detail and list responses — refresh both so deleted equipment
      // disappears from row expansions / service history.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorDelete', { entity: getName('equipment') }));
    },
  });

  const handleAdd = () => {
    navigate('/equipment/new');
  };

  const handleEdit = (item: EquipmentSummary) => {
    navigate(`/equipment/${item.id}/edit`);
  };

  const handleDelete = (item: EquipmentSummary) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.name }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const getStatusBadge = (status: EquipmentStatus | undefined) => {
    if (status === EquipmentStatus.RETIRED) {
      return <Pill tone="neutral">{t('equipment.status.retired')}</Pill>;
    }
    // Default to active when the backend omits status (older payloads). Most
    // equipment is active, so this avoids a misleading "Retired" badge.
    return <Pill tone="success">{t('equipment.status.active')}</Pill>;
  };

  const formatTypeCategory = (item: EquipmentSummary) => {
    if (item.equipmentTypeName && item.equipmentCategoryName) {
      return `${item.equipmentTypeName} / ${item.equipmentCategoryName}`;
    }
    return item.equipmentTypeName || item.equipmentCategoryName || '-';
  };

  const formatMakeModel = (item: EquipmentSummary) => {
    if (item.make && item.model) return `${item.make} ${item.model}`;
    return item.make || item.model || '-';
  };

  // Compose the address line from the discrete fields the backend returns.
  // Street + city run through titleCaseAddress (db is uppercase); state and
  // zip stay raw. "City, ST ZIP" tail uses a space between state and zip.
  const formatAddress = (item: EquipmentSummary): string => {
    const parts: string[] = [];
    if (item.streetAddress) parts.push(titleCaseAddress(item.streetAddress));
    const stateZip = [item.state, item.zipCode].filter(Boolean).join(' ');
    const cityState = [titleCaseAddress(item.city), stateZip].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    return parts.join(', ');
  };

  // Primary line of the location cell: the site's name, else its address.
  // Either one NAMES the location, so either one carries the link (unlike the
  // work-order list, whose fallback is the customer — a different entity).
  const locationLabel = (item: EquipmentSummary): string =>
    item.serviceLocationName || formatAddress(item);

  const statusViewTabs = [
    { id: EquipmentStatus.ACTIVE, label: t('equipment.status.active') },
    { id: EquipmentStatus.RETIRED, label: t('equipment.status.retired') },
    { id: '', label: t('equipment.status.all') },
  ];

  const equipmentNoun = totalElements === 1
    ? getName('equipment').toLowerCase()
    : getName('equipment', true).toLowerCase();
  const subtitle = totalElements > 0
    ? (statusFilter === EquipmentStatus.ACTIVE
        ? `${totalElements.toLocaleString()} ${t('equipment.status.active').toLowerCase()} ${equipmentNoun}`
        : statusFilter === EquipmentStatus.RETIRED
          ? `${totalElements.toLocaleString()} ${t('equipment.status.retired').toLowerCase()} ${equipmentNoun}`
          : `${totalElements.toLocaleString()} ${equipmentNoun}`)
    : null;

  const pageHref = (oneBased: number): string => {
    const next = new URLSearchParams(searchParams);
    if (oneBased <= 1) next.delete('page');
    else next.set('page', String(oneBased));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };
  const showingStart = totalElements === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingEnd = Math.min((page + 1) * PAGE_SIZE, totalElements);

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('equipment', true)}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={handleAdd}>
              {t('common.actions.add', { entity: getName('equipment') })}
            </Button>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('equipment.search.placeholder')}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setPage(0);
              }}
            />
          }
        >
          <FilterChipListbox
            label={t('equipment.form.type')}
            ariaLabel={t('equipment.form.type')}
            value={typeFilter || null}
            displayValue={typeFilter ? equipmentTypes.find((tx) => tx.id === typeFilter)?.name ?? null : null}
            resetLabel={t('equipment.filter.allTypes')}
            onChange={(id) => {
              setTypeFilter(id ?? '');
              setCategoryFilter('');
              setPage(0);
            }}
            onClear={() => {
              setTypeFilter('');
              setCategoryFilter('');
              setPage(0);
            }}
          >
            {equipmentTypes.map((tx) => (
              <ChipListboxOption key={tx.id} value={tx.id}>{tx.name}</ChipListboxOption>
            ))}
          </FilterChipListbox>

          {/* Category chip only appears once a type is chosen — categories
              are scoped to a type, so the picker is meaningless without one. */}
          {typeFilter && (
            <FilterChipListbox
              label={t('equipment.form.category')}
              ariaLabel={t('equipment.form.category')}
              value={categoryFilter || null}
              displayValue={categoryFilter ? equipmentCategories.find((c) => c.id === categoryFilter)?.name ?? null : null}
              resetLabel={t('equipment.filter.allCategories')}
              onChange={(id) => {
                setCategoryFilter(id ?? '');
                setPage(0);
              }}
              onClear={() => {
                setCategoryFilter('');
                setPage(0);
              }}
            >
              {equipmentCategories.map((cat) => (
                <ChipListboxOption key={cat.id} value={cat.id}>{cat.name}</ChipListboxOption>
              ))}
            </FilterChipListbox>
          )}
        </ListToolbar>

        <ViewTabs
          className="mb-3"
          value={statusFilter}
          onChange={(id) => {
            setStatusFilter(id as EquipmentStatus | '');
            setPage(0);
          }}
          tabs={statusViewTabs}
        />

        {error && (
          <Card className="border-danger-500/40 bg-danger-100/40">
            <CardBody>
              <p className="text-[12.5px] text-danger-500">
                {t('common.actions.errorLoading', { entities: getName('equipment', true) })}: {(error as Error).message}
              </p>
            </CardBody>
          </Card>
        )}

        {isLoading ? (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: getName('equipment', true) })} />
            </CardBody>
          </Card>
        ) : equipment.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {deferredSearch || typeFilter || categoryFilter
                  ? t('common.actions.noMatchSearch', { entities: getName('equipment', true) })
                  : t('common.actions.notFound', { entities: getName('equipment', true) })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('common.form.name')}</th>
                    <th>{getName('service_location')}</th>
                    <th>{t('equipment.table.type')}</th>
                    <th>{t('equipment.table.makeModel')}</th>
                    <th>{t('equipment.form.serialNumber')}</th>
                    <th>{t('equipment.form.locationOnSite')}</th>
                    <th>{t('common.form.status')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {equipment.map((item) => (
                    <DenseRow key={item.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <RouterLink to={detailHref(item.id)}>
                            <EquipmentThumbnail
                              url={item.profileImageUrl}
                              name={item.name}
                              category={item.equipmentCategoryName}
                              type={item.equipmentTypeName}
                              monogram
                              sizeClass="size-12"
                              fit="contain"
                            />
                          </RouterLink>
                          <CellStack>
                            <CellTop>
                              <RouterLink
                                to={detailHref(item.id)}
                                className="hover:text-accent-500 hover:underline"
                              >
                                {item.name}
                              </RouterLink>
                            </CellTop>
                            {item.parentId && item.parentName && (
                              <CellSub>
                                <RouterLink
                                  to={detailHref(item.parentId)}
                                  className="hover:text-accent-500 hover:underline"
                                >
                                  {t('equipment.table.componentOf', {
                                    entity: getName('equipment_component'),
                                    parent: item.parentName,
                                  })}
                                </RouterLink>
                              </CellSub>
                            )}
                          </CellStack>
                        </div>
                      </td>
                      <td className={clsx(!item.serviceLocationId && 'dt-empty')}>
                        {item.serviceLocationId ? (
                          <CellStack>
                            <CellTop>
                              <span className="dt-inline-label">{getName('service_location')}: </span>
                              {/* The link goes INSIDE the cell primitive — around
                                  CellStack it can't tint anything, since .top/.bot
                                  declare their own color. Accent at rest because
                                  this leaves the list's own entity; the address
                                  below stays plain text so it drag-selects. */}
                              {locationLabel(item) ? (
                                <RouterLink
                                  to={locationHref(item.serviceLocationId)}
                                  className="text-fg-accent hover:underline"
                                >
                                  {locationLabel(item)}
                                </RouterLink>
                              ) : (
                                '-'
                              )}
                            </CellTop>
                            <CellSub>
                              {[
                                item.serviceLocationName ? formatAddress(item) : null,
                                item.customerName,
                              ].filter(Boolean).join(' · ')}
                            </CellSub>
                          </CellStack>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className={clsx(formatTypeCategory(item) === '-' && 'dt-empty')} data-label={t('equipment.table.type')}>{formatTypeCategory(item)}</td>
                      <td className={clsx(formatMakeModel(item) === '-' && 'dt-empty')} data-label={t('equipment.table.makeModel')}>{formatMakeModel(item)}</td>
                      <td className={clsx(!item.serialNumber && 'dt-empty')} data-label={t('equipment.form.serialNumber')}>{item.serialNumber || '-'}</td>
                      <td className={clsx(!item.locationOnSite && 'dt-empty')} data-label={t('equipment.form.locationOnSite')}>{item.locationOnSite || '-'}</td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>
                        <Dropdown>
                          <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                            <EllipsisVerticalIcon className="size-4" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => handleEdit(item)}>
                              <DropdownLabel>{t('common.edit')}</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDelete(item)}>
                              <DropdownLabel>{t('common.delete')}</DropdownLabel>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>

              <ListFooter
                page={page + 1}
                totalPages={totalPages}
                pageHref={pageHref}
                left={t('common.pagination.showing', {
                  start: showingStart,
                  end: showingEnd,
                  total: totalElements.toLocaleString(),
                })}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
