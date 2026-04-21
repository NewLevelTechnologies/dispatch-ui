import { useState, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { customerApi, type ServiceLocation, type ServiceLocationListDto } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { formatPhone } from '../utils/formatPhone';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Pagination, PaginationGap, PaginationList, PaginationNext, PaginationPage, PaginationPrevious } from '../components/catalyst/pagination';

export default function ServiceLocationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocation | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const deferredSearch = useDeferredValue(searchQuery);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const statusFilter = searchParams.get('status') || 'all';

  const canAddServiceLocations = useHasCapability('ADD_SERVICE_LOCATIONS');
  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');
  const canCloseServiceLocations = useHasCapability('CLOSE_SERVICE_LOCATIONS');

  const updateFilters = (updates: { search?: string; status?: string }) => {
    const newParams = new URLSearchParams(searchParams);
    if (updates.search !== undefined) {
      if (updates.search) {
        newParams.set('search', updates.search);
      } else {
        newParams.delete('search');
      }
      newParams.set('page', '1');
    }
    if (updates.status !== undefined) {
      if (updates.status === 'all') {
        newParams.delete('status');
      } else {
        newParams.set('status', updates.status);
      }
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['service-locations', page, statusFilter, deferredSearch],
    queryFn: () => customerApi.getAllServiceLocationsPaginated({
      page,
      limit: 50,
      status: statusFilter === 'all' ? undefined : (statusFilter as 'ACTIVE' | 'INACTIVE' | 'CLOSED'),
      search: deferredSearch || undefined,
    }),
  });

  const locations = data?.content || [];
  const totalLocations = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;

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
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorDelete', { entity: getName('service_location') }));
    },
  });

  const handleAdd = () => {
    setSelectedLocation(null);
    setSelectedCustomerId(null);
    setIsDialogOpen(true);
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

  const columns: DataTableColumn<ServiceLocationListDto>[] = [
    {
      key: 'name',
      header: t('common.form.name'),
      cellClassName: 'font-medium',
      cell: (location) =>
        location.locationName || (
          <span className="text-zinc-400">{t('serviceLocations.detail.unnamedLocation')}</span>
        ),
    },
    {
      key: 'address',
      header: t('serviceLocations.table.address'),
      cellClassName: 'text-zinc-500',
      cell: (location) => (
        <>
          <div className="text-xs">
            {location.address.streetAddress}
            {location.address.streetAddressLine2 && ` ${location.address.streetAddressLine2}`}
          </div>
          <div className="text-xs text-zinc-400">
            {location.address.city}, {location.address.state} {location.address.zipCode}
          </div>
        </>
      ),
    },
    {
      key: 'contact',
      header: t('serviceLocations.table.contact'),
      cellClassName: 'text-zinc-500',
      cell: (location) =>
        location.siteContactName || location.siteContactPhone ? (
          <>
            {location.siteContactName && (
              <div className="text-xs">{location.siteContactName}</div>
            )}
            {location.siteContactPhone && (
              <div className="text-xs">
                <a
                  href={`tel:${location.siteContactPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-10 hover:underline"
                >
                  {formatPhone(location.siteContactPhone)}
                </a>
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-zinc-400">-</span>
        ),
    },
    {
      key: 'lastService',
      header: t('serviceLocations.table.lastService'),
      cellClassName: 'text-zinc-500',
      cell: () => (
        <span className="text-xs text-zinc-400">{t('serviceLocations.table.neverServiced')}</span>
      ),
    },
    {
      key: 'status',
      header: t('common.form.status'),
      cell: (location) => (
        <StatusBadge
          status={location.status.toLowerCase()}
          label={t(`serviceLocations.status.${location.status.toLowerCase()}`)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (location) =>
        (canEditServiceLocations || canCloseServiceLocations) && (
          <div className="-mx-3 -my-1.5 sm:-mx-2.5">
            <Dropdown>
              <DropdownButton plain aria-label={t('common.moreOptions')}>
                <EllipsisVerticalIcon className="size-5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                <DropdownItem onClick={() => navigate(`/service-locations/${location.id}`)}>
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
        ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={getName('service_location', true)}
        actions={canAddServiceLocations && (
          <Button color="accent" onClick={handleAdd}>{t('common.actions.add', { entity: getName('service_location') })}</Button>
        )}
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          updateFilters({ search: value });
        }}
        searchPlaceholder={t('common.search')}
        filters={
          <>
            <Button
              plain
              onClick={() => updateFilters({ status: 'all' })}
              className={statusFilter === 'all' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
            >
              {t('serviceLocations.filter.allStatuses')}
            </Button>
            <Button
              plain
              onClick={() => updateFilters({ status: 'ACTIVE' })}
              className={statusFilter === 'ACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
            >
              {t('serviceLocations.status.active')}
            </Button>
            <Button
              plain
              onClick={() => updateFilters({ status: 'INACTIVE' })}
              className={statusFilter === 'INACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
            >
              {t('serviceLocations.status.inactive')}
            </Button>
            <Button
              plain
              onClick={() => updateFilters({ status: 'CLOSED' })}
              className={statusFilter === 'CLOSED' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
            >
              {t('serviceLocations.status.closed')}
            </Button>
          </>
        }
        rowCount={totalLocations > 0 ? `${totalLocations} ${totalLocations === 1 ? getName('service_location').toLowerCase() : getName('service_location', true).toLowerCase()}` : undefined}
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('service_location', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {totalLocations === 0 && !isLoading && !deferredSearch && statusFilter === 'all' ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('service_location', true) })}
          </p>
          {canAddServiceLocations && (
            <Button className="mt-2" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: getName('service_location') })}
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={locations}
          isLoading={isLoading}
          getRowKey={(l) => l.id}
          getRowHref={(l) => `/service-locations/${l.id}`}
          getRowClassName={() => 'cursor-pointer'}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('service_location', true) })}
        />
      )}

      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationPrevious href={page > 1 ? `?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: (page - 1).toString() })}` : undefined} />
          <PaginationList>
            {(() => {
              const pages: (number | 'gap')[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push('gap');
                const start = Math.max(2, page - 1);
                const end = Math.min(totalPages - 1, page + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                if (page < totalPages - 2) pages.push('gap');
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === 'gap' ? (
                  <PaginationGap key={`gap-${idx}`} />
                ) : (
                  <PaginationPage
                    key={p}
                    href={`?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: p.toString() })}`}
                    current={p === page}
                  >
                    {p}
                  </PaginationPage>
                )
              );
            })()}
          </PaginationList>
          <PaginationNext href={page < totalPages ? `?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: (page + 1).toString() })}` : undefined} />
        </Pagination>
      )}

      <ServiceLocationFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        serviceLocation={selectedLocation}
        customerId={selectedCustomerId}
      />
    </AppLayout>
  );
}
