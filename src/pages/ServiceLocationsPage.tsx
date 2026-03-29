import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { customerApi, type ServiceLocation, type Customer } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';

type ServiceLocationWithCustomer = ServiceLocation & {
  customerName: string;
  customerDisplayMode: 'SIMPLE' | 'STANDARD';
};

export default function ServiceLocationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocation | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Permission checks
  const canAddServiceLocations = useHasCapability('ADD_SERVICE_LOCATIONS');
  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');
  const canCloseServiceLocations = useHasCapability('CLOSE_SERVICE_LOCATIONS');

  // Fetch all customers (which includes their service locations)
  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerApi.getAll(),
  });

  // Flatten all service locations with customer info
  const allLocations = useMemo((): ServiceLocationWithCustomer[] => {
    if (!customers) return [];
    return customers.flatMap((customer: Customer) =>
      customer.serviceLocations.map((location: ServiceLocation): ServiceLocationWithCustomer => ({
        ...location,
        customerName: customer.name,
        customerDisplayMode: customer.displayMode,
      }))
    );
  }, [customers]);

  // Filter locations based on search query and status
  const filteredLocations = useMemo(() => {
    let filtered = allLocations;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((loc) => loc.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (location) =>
          location.locationName?.toLowerCase().includes(query) ||
          location.address.streetAddress.toLowerCase().includes(query) ||
          location.address.city.toLowerCase().includes(query) ||
          location.address.state.toLowerCase().includes(query) ||
          location.address.zipCode.toLowerCase().includes(query) ||
          location.siteContactName?.toLowerCase().includes(query) ||
          location.siteContactPhone?.toLowerCase().includes(query) ||
          location.customerName.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allLocations, searchQuery, statusFilter]);

  const closeLocationMutation = useMutation({
    mutationFn: ({ customerId, locationId }: { customerId: string; locationId: string }) =>
      customerApi.closeServiceLocation(customerId, locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const handleAdd = () => {
    setSelectedLocation(null);
    setSelectedCustomerId(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (location: ServiceLocation) => {
    setSelectedLocation(location);
    setSelectedCustomerId(location.customerId);
    setIsDialogOpen(true);
  };

  const handleClose = (location: ServiceLocation) => {
    if (window.confirm(t('serviceLocations.actions.closeConfirm', { name: location.locationName || location.address.streetAddress }))) {
      closeLocationMutation.mutate({ customerId: location.customerId, locationId: location.id });
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedLocation(null);
    setSelectedCustomerId(null);
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('service_location', true)}</Heading>
        {canAddServiceLocations && (
          <Button onClick={handleAdd}>{t('common.actions.add', { entity: getName('service_location') })}</Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Button
            plain
            onClick={() => setStatusFilter('all')}
            className={statusFilter === 'all' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('serviceLocations.filter.allStatuses')}
          </Button>
          <Button
            plain
            onClick={() => setStatusFilter('ACTIVE')}
            className={statusFilter === 'ACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('serviceLocations.status.active')}
          </Button>
          <Button
            plain
            onClick={() => setStatusFilter('INACTIVE')}
            className={statusFilter === 'INACTIVE' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('serviceLocations.status.inactive')}
          </Button>
          <Button
            plain
            onClick={() => setStatusFilter('CLOSED')}
            className={statusFilter === 'CLOSED' ? 'font-semibold text-zinc-950 dark:text-white' : ''}
          >
            {t('serviceLocations.status.closed')}
          </Button>
        </div>
        {allLocations.length > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredLocations.length === allLocations.length
              ? `${allLocations.length} ${allLocations.length === 1 ? getName('service_location').toLowerCase() : getName('service_location', true).toLowerCase()}`
              : `${filteredLocations.length} of ${allLocations.length}`}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: getName('service_location', true) })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: getName('service_location', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {allLocations.length === 0 && !isLoading && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.notFound', { entities: getName('service_location', true) })}</p>
          {canAddServiceLocations && (
            <Button className="mt-2" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: getName('service_location') })}
            </Button>
          )}
        </div>
      )}

      {filteredLocations.length === 0 && allLocations.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.noMatchSearch', { entities: getName('service_location', true) })}</p>
        </div>
      )}

      {filteredLocations.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('serviceLocations.table.locationName')}</TableHeader>
                <TableHeader>{t('serviceLocations.table.address')}</TableHeader>
                <TableHeader>{t('serviceLocations.table.contact')}</TableHeader>
                <TableHeader>{t('serviceLocations.table.lastService')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLocations.map((location) => {
                return (
                  <TableRow key={location.id} href={`/service-locations/${location.id}`} className="cursor-pointer">
                    <TableCell className="font-medium">
                      {location.locationName || <span className="text-zinc-400">{t('serviceLocations.detail.unnamedLocation')}</span>}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <div className="text-xs">
                        {location.address.streetAddress}
                        {location.address.streetAddressLine2 && ` ${location.address.streetAddressLine2}`}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {location.address.city}, {location.address.state} {location.address.zipCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {location.siteContactName || location.siteContactPhone ? (
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
                                {location.siteContactPhone}
                              </a>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-zinc-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <span className="text-xs text-zinc-400">{t('serviceLocations.table.neverServiced')}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={
                          location.status === 'ACTIVE'
                            ? 'lime'
                            : location.status === 'INACTIVE'
                            ? 'amber'
                            : 'zinc'
                        }
                        className="text-xs"
                      >
                        {t(`serviceLocations.status.${location.status.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(canEditServiceLocations || canCloseServiceLocations) && (
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
                                <DropdownItem onClick={() => handleEdit(location)}>
                                  <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                </DropdownItem>
                              )}
                              {location.status !== 'CLOSED' && canCloseServiceLocations && (
                                <DropdownItem onClick={() => handleClose(location)}>
                                  <DropdownLabel>{t('serviceLocations.actions.close')}</DropdownLabel>
                                </DropdownItem>
                              )}
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
