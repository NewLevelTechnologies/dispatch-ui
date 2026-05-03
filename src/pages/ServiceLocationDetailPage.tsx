import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  dispatchRegionApi,
  equipmentApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentSummary,
  type ServiceLocationSearchResult,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import AdditionalContactsList from '../components/AdditionalContactsList';
import WorkOrdersList from '../components/WorkOrdersList';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import NotificationLogsList from '../components/NotificationLogsList';
import TabNavigation from '../components/TabNavigation';
import { formatPhone } from '../utils/formatPhone';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Text, Strong } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { ArrowLeftIcon, EllipsisVerticalIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Divider } from '../components/catalyst/divider';

type TabId = 'overview' | 'work-orders' | 'equipment' | 'activity';

export default function ServiceLocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { key: routeKey } = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEquipmentDialogOpen, setIsEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const queryClient = useQueryClient();

  // Return to wherever we came from (could be the WO detail, customer detail, etc.).
  // Falls back to the list when there's no internal history (direct URL entry / new tab).
  const handleBack = () => {
    if (routeKey !== 'default') {
      navigate(-1);
    } else {
      navigate('/service-locations');
    }
  };

  // Permission checks
  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');

  // Fetch service location by ID (full details with customer info)
  const { data: location, isLoading, error } = useQuery({
    queryKey: ['service-location', id],
    queryFn: () => customerApi.getServiceLocationById(id!),
    enabled: !!id,
  });

  // Fetch dispatch regions to display region name
  const { data: dispatchRegions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  // Shared cache with the rendered list — one request, count + table both read it.
  // Scope by serviceLocationId only; sending customerId alongside risks the backend
  // treating the pair as OR and returning the customer's other locations' WOs.
  const { data: workOrdersData } = useQuery(
    workOrdersListQueryOptions({
      serviceLocationId: location?.id ?? '',
    })
  );

  // Equipment scoped to this service location.
  const { data: equipmentPage, isLoading: equipmentLoading, error: equipmentError } = useQuery({
    queryKey: ['equipment', { serviceLocationId: id }],
    queryFn: () =>
      equipmentApi.list({
        serviceLocationId: id!,
        status: EquipmentStatus.ACTIVE,
        size: 100,
      }),
    enabled: !!id,
  });
  const equipment: EquipmentSummary[] = equipmentPage?.content ?? [];

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => equipmentApi.delete(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', { serviceLocationId: id }] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorDelete', { entity: getName('equipment') }));
    },
  });

  const handleEditEquipment = async (item: EquipmentSummary) => {
    const full = await equipmentApi.getById(item.id);
    setEditingEquipment(full);
    setIsEquipmentDialogOpen(true);
  };

  const handleDeleteEquipment = (item: EquipmentSummary) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.name }))) {
      deleteEquipmentMutation.mutate(item.id);
    }
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

  const dispatchRegion = dispatchRegions?.find(r => r.id === location?.dispatchRegionId);

  // Create customer object from location data for display
  const customer = location ? {
    id: location.customerId,
    name: location.customerName,
    displayMode: location.customerDisplayMode,
  } : undefined;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <Text>{t('common.actions.loadingEntity', { entity: getName('service_location') })}</Text>
        </div>
      </AppLayout>
    );
  }

  if (error || !location || !customer) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('common.actions.errorLoadingEntity', { entity: getName('service_location') })}
              {error && `: ${(error as Error).message}`}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/service-locations')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.backTo', { entities: getName('service_location', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Show additional contacts section if there are contacts, site contact info, or user can add
  const shouldShowAdditionalContacts = (): boolean => {
    return !!(
      location.additionalContacts.length > 0 ||
      location.siteContactName ||
      location.siteContactPhone ||
      location.siteContactEmail ||
      canEditServiceLocations
    );
  };

  // Tab configuration
  const tabs = [
    { id: 'overview', label: t('serviceLocations.tabs.overview'), count: undefined },
    { id: 'work-orders', label: getName('work_order', true), count: workOrdersData?.totalElements ?? 0 },
    { id: 'equipment', label: getName('equipment'), count: equipmentPage?.totalElements ?? 0 },
    { id: 'activity', label: t('serviceLocations.tabs.activity'), count: undefined },
  ];

  return (
    <AppLayout>
      <div className="p-4">
        {/* Back Button */}
        <div className="mb-2">
          <Button plain onClick={handleBack}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        <div>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Heading className="text-2xl">
                  {location.locationName || t('serviceLocations.detail.unnamedLocation')}
                </Heading>
                <Badge
                  color={
                    location.status === 'ACTIVE'
                      ? 'lime'
                      : location.status === 'INACTIVE'
                      ? 'amber'
                      : 'zinc'
                  }
                >
                  {t(`serviceLocations.status.${location.status.toLowerCase()}`)}
                </Badge>
              </div>
              <Text className="mt-1">
                {t('serviceLocations.detail.belongsTo')}{' '}
                <a
                  href={`/customers/${customer.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/customers/${customer.id}`);
                  }}
                  className="font-medium hover:underline"
                >
                  {customer.name}
                </a>
              </Text>
            </div>
            {canEditServiceLocations && (
              <Button color="zinc" onClick={() => setIsEditDialogOpen(true)}>
                <PencilIcon className="size-4" />
                {t('common.edit')}
              </Button>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-4">
            <TabNavigation
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={(tabId) => setActiveTab(tabId as TabId)}
            />
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Left Column - Primary Info */}
            <div className="lg:col-span-2 space-y-4">
              {/* Address and Site Contact - Side by Side */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Address Section */}
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Subheading>{t('serviceLocations.detail.address')}</Subheading>
                  <div className="mt-2 space-y-1">
                    <Text className="font-medium">{location.address.streetAddress}</Text>
                    {location.address.streetAddressLine2 && (
                      <Text>{location.address.streetAddressLine2}</Text>
                    )}
                    <Text>
                      {location.address.city}, {location.address.state} {location.address.zipCode}
                    </Text>
                    {dispatchRegion && (
                      <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                        {t('entities.region')}: <Strong>{dispatchRegion.name}</Strong>
                      </Text>
                    )}
                    {location.address.validated && (
                      <div className="mt-2 flex items-center gap-2">
                        <Badge color="lime" className="text-xs">
                          {t('serviceLocations.detail.uspsValidated')}
                        </Badge>
                        {location.address.isBusiness && (
                          <Badge color="sky" className="text-xs">
                            {t('serviceLocations.detail.businessLocation')}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Site Contact Section */}
                {(location.siteContactName || location.siteContactPhone || location.siteContactEmail) && (
                  <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <Subheading>{t('serviceLocations.detail.siteContact')}</Subheading>
                    <div className="mt-2 space-y-1">
                      {location.siteContactName && (
                        <Text className="font-medium">{location.siteContactName}</Text>
                      )}
                      {location.siteContactPhone && (
                        <Text>
                          <a href={`tel:${location.siteContactPhone}`} className="hover:underline">
                            {formatPhone(location.siteContactPhone)}
                          </a>
                        </Text>
                      )}
                      {location.siteContactEmail && (
                        <Text>
                          <a href={`mailto:${location.siteContactEmail}`} className="hover:underline">
                            {location.siteContactEmail}
                          </a>
                        </Text>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Contacts */}
              {shouldShowAdditionalContacts() && (
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <AdditionalContactsList
                    contacts={location.additionalContacts}
                    parentId={location.id}
                    parentType="serviceLocation"
                    customerId={customer.id}
                    queryKey={['service-location', id!]}
                    canEdit={canEditServiceLocations}
                    showAddButton={true}
                  />
                </div>
              )}

              {/* Access Instructions */}
              {location.accessInstructions && (
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Subheading>{t('common.form.accessInstructions')}</Subheading>
                  <Text className="mt-2">{location.accessInstructions}</Text>
                </div>
              )}

              {/* Notes */}
              {location.notes && (
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Subheading>{t('common.form.notes')}</Subheading>
                  <Text className="mt-2">{location.notes}</Text>
                </div>
              )}
            </div>

            {/* Right Column - Quick Stats */}
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <Subheading>{t('serviceLocations.detail.quickStats')}</Subheading>
                <div className="mt-2 space-y-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('equipment')}
                    className="block w-full -m-2 rounded p-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Text className="text-xs">{getName('equipment', true)}</Text>
                    <Strong className="mt-1 block text-lg">{equipmentPage?.totalElements ?? 0}</Strong>
                  </button>
                  <Divider />
                  <button
                    type="button"
                    onClick={() => setActiveTab('work-orders')}
                    className="block w-full -m-2 rounded p-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Text className="text-xs">{getName('work_order', true)}</Text>
                    <Strong className="mt-1 block text-lg">{workOrdersData?.totalElements ?? 0}</Strong>
                  </button>
                  <Divider />
                  <div>
                    <Text className="text-xs">{t('serviceLocations.detail.lastService')}</Text>
                    <Strong className="mt-1 block text-sm">{t('serviceLocations.detail.never')}</Strong>
                  </div>
                  <Divider />
                  <div>
                    <Text className="text-xs">{t('serviceLocations.detail.totalRevenue')}</Text>
                    <Strong className="mt-1 block text-lg">$0.00</Strong>
                  </div>
                </div>
              </div>
            </div>
              </div>
            )}

            {activeTab === 'work-orders' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Subheading>{t('common.recentEntities', { entities: getName('work_order', true) })}</Subheading>
                  {/* TODO: Add work order permission check when work order management is implemented */}
                  <Button plain onClick={() => setIsNewWorkOrderOpen(true)}>
                    <PlusIcon className="size-4" />
                    {t('common.actions.new', { entity: getName('work_order') })}
                  </Button>
                </div>
                <WorkOrdersList
                  serviceLocationId={location.id}
                  showLocation={false}
                />
              </div>
            )}

            {activeTab === 'equipment' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Subheading>{getName('equipment')}</Subheading>
                  <Button
                    plain
                    onClick={() => {
                      setEditingEquipment(null);
                      setIsEquipmentDialogOpen(true);
                    }}
                  >
                    <PlusIcon className="size-4" />
                    {t('common.actions.add', { entity: getName('equipment') })}
                  </Button>
                </div>

                {equipmentError && (
                  <div className="mb-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
                    <Text className="text-sm text-red-800 dark:text-red-400">
                      {t('common.actions.errorLoading', { entities: getName('equipment', true) })}: {(equipmentError as Error).message}
                    </Text>
                  </div>
                )}

                {equipmentLoading ? (
                  <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
                    <Text className="text-zinc-500 dark:text-zinc-400">
                      {t('common.actions.loading', { entities: getName('equipment', true) })}
                    </Text>
                  </div>
                ) : equipment.length === 0 ? (
                  <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
                    <Text className="text-zinc-500 dark:text-zinc-400">
                      {t('common.actions.noEntitiesYet', { entities: getName('equipment', true) })}
                    </Text>
                  </div>
                ) : (
                  <Table dense className="[--gutter:theme(spacing.1)] text-sm">
                    <TableHead>
                      <TableRow>
                        <TableHeader>{t('common.form.name')}</TableHeader>
                        <TableHeader>{t('equipment.table.type')}</TableHeader>
                        <TableHeader>{t('equipment.table.makeModel')}</TableHeader>
                        <TableHeader>{t('equipment.form.serialNumber')}</TableHeader>
                        <TableHeader>{t('equipment.form.locationOnSite')}</TableHeader>
                        <TableHeader></TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {equipment.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <RouterLink
                              to={`/equipment/${item.id}`}
                              className="flex items-center gap-2 text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                            >
                              <EquipmentThumbnail
                                url={item.profileImageUrl}
                                name={item.name}
                                sizeClass="size-12"
                              />
                              <span>{item.name}</span>
                            </RouterLink>
                          </TableCell>
                          <TableCell>{formatTypeCategory(item)}</TableCell>
                          <TableCell>{formatMakeModel(item)}</TableCell>
                          <TableCell>{item.serialNumber || '-'}</TableCell>
                          <TableCell>{item.locationOnSite || '-'}</TableCell>
                          <TableCell>
                            <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                              <Dropdown>
                                <DropdownButton plain aria-label={t('common.moreOptions')}>
                                  <EllipsisVerticalIcon className="size-5" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <DropdownItem onClick={() => handleEditEquipment(item)}>
                                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                  </DropdownItem>
                                  <DropdownItem onClick={() => handleDeleteEquipment(item)}>
                                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                  </DropdownItem>
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <NotificationLogsList
                  entityType="SERVICE_LOCATION"
                  entityId={location.id}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <ServiceLocationFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        serviceLocation={location}
        customerId={customer.id}
      />

      <EquipmentFormDialog
        isOpen={isEquipmentDialogOpen}
        onClose={() => {
          setIsEquipmentDialogOpen(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        lockedServiceLocationId={location.id}
      />

      <WorkOrderFormDialog
        isOpen={isNewWorkOrderOpen}
        onClose={() => setIsNewWorkOrderOpen(false)}
        prefilledServiceLocation={
          {
            id: location.id,
            customerId: location.customerId,
            customerName: location.customerName,
            locationName: location.locationName ?? null,
            address: {
              streetAddress: location.address.streetAddress,
              city: location.address.city,
              state: location.address.state,
              zipCode: location.address.zipCode,
            },
            siteContactName: location.siteContactName ?? null,
            siteContactPhone: location.siteContactPhone ?? null,
            status: 'ACTIVE',
          } satisfies ServiceLocationSearchResult
        }
      />
    </AppLayout>
  );
}
