import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  notificationApi,
  dispatchRegionApi,
  equipmentApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentSummary,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import CustomerFormDialog from '../components/CustomerFormDialog';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import AdditionalContactsList from '../components/AdditionalContactsList';
import WorkOrdersList from '../components/WorkOrdersList';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import NotificationPreferencesDialog from '../components/NotificationPreferencesDialog';
import NotificationLogsList from '../components/NotificationLogsList';
import TabNavigation from '../components/TabNavigation';
import { formatPhone } from '../utils/formatPhone';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Text, Strong } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input, InputGroup } from '../components/catalyst/input';
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  CreditCardIcon,
  MapPinIcon,
  BellIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';

type TabId = 'overview' | 'work-orders' | 'financial' | 'equipment' | 'activity';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { key: routeKey } = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isAddLocationDialogOpen, setIsAddLocationDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Return to wherever we came from (could be the WO detail, service location, etc.).
  // Falls back to the list when there's no internal history (direct URL entry / new tab).
  const handleBack = () => {
    if (routeKey !== 'default') {
      navigate(-1);
    } else {
      navigate('/customers');
    }
  };
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [isEquipmentDialogOpen, setIsEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const queryClient = useQueryClient();

  // Permission checks
  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const canAddServiceLocations = useHasCapability('ADD_SERVICE_LOCATIONS');

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customerApi.getById(id!),
  });

  // Shared cache with the rendered list — one request, count + table both read it.
  // Disabled until the customer loads (id ?? '' is falsy → enabled: false).
  const { data: workOrdersData } = useQuery(
    workOrdersListQueryOptions({ customerId: customer?.id ?? '' })
  );

  // Equipment scoped to the customer (across all their service locations).
  const { data: equipmentPage, isLoading: equipmentLoading, error: equipmentError } = useQuery({
    queryKey: ['equipment', { customerId: id }],
    queryFn: () =>
      equipmentApi.list({
        customerId: id!,
        status: EquipmentStatus.ACTIVE,
        size: 100,
      }),
    enabled: !!id,
  });
  const equipment: EquipmentSummary[] = equipmentPage?.content ?? [];

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => equipmentApi.delete(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', { customerId: id }] });
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

  const formatAddress = (item: EquipmentSummary): string => {
    const parts: string[] = [];
    if (item.streetAddress) parts.push(item.streetAddress);
    const cityState = [item.city, item.state].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    const tail = parts.join(', ');
    return item.zipCode ? `${tail} ${item.zipCode}`.trim() : tail;
  };

  const equipmentTabContent = (
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
              <TableHeader>{getName('service_location')}</TableHeader>
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
                    <EquipmentThumbnail url={item.profileImageUrl} name={item.name} sizeClass="size-8" />
                    <span>{item.name}</span>
                  </RouterLink>
                </TableCell>
                <TableCell>
                  {item.serviceLocationId ? (
                    <RouterLink
                      to={`/service-locations/${item.serviceLocationId}`}
                      className="flex flex-col text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                    >
                      <span>{item.serviceLocationName || formatAddress(item) || '-'}</span>
                      {item.serviceLocationName && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                          {formatAddress(item)}
                        </span>
                      )}
                    </RouterLink>
                  ) : (
                    <span>-</span>
                  )}
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
  );

  // Fetch notification preferences to show opt-in count
  const { data: preferences = [] } = useQuery({
    queryKey: ['notification-preferences', 'customer', id],
    queryFn: () => notificationApi.getCustomerPreferences(id!),
    enabled: !!id && !!customer, // Only fetch when customer is loaded
  });

  // Count opted-in preferences
  const notificationOptInCount = preferences.filter((pref) => pref.optIn).length;

  // Fetch dispatch region for SIMPLE mode (primary location only)
  const primaryLocationRegionId = customer?.displayMode === 'SIMPLE' ? customer.serviceLocations[0]?.dispatchRegionId : undefined;
  const { data: dispatchRegion } = useQuery({
    queryKey: ['dispatch-regions', primaryLocationRegionId],
    queryFn: () => dispatchRegionApi.getById(primaryLocationRegionId!),
    enabled: !!primaryLocationRegionId,
  });

  // Filter service locations based on search query - MUST be before early returns
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const filteredLocations = useMemo(() => {
    if (!customer?.serviceLocations) return [];
    if (!locationSearchQuery.trim()) return customer.serviceLocations;

    const query = locationSearchQuery.toLowerCase();
    return customer.serviceLocations.filter(
      (location) =>
        location.locationName?.toLowerCase().includes(query) ||
        location.address.streetAddress.toLowerCase().includes(query) ||
        location.address.city.toLowerCase().includes(query) ||
        location.address.state.toLowerCase().includes(query) ||
        location.siteContactName?.toLowerCase().includes(query) ||
        location.siteContactPhone?.toLowerCase().includes(query)
    );
  }, [customer?.serviceLocations, locationSearchQuery]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <Text>{t('common.actions.loadingEntity', { entity: getName('customer') })}</Text>
        </div>
      </AppLayout>
    );
  }

  if (error || !customer) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('common.actions.errorLoadingEntity', { entity: getName('customer') })}
              {error && `: ${(error as Error).message}`}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/customers')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isSimple = customer.displayMode === 'SIMPLE';
  const primaryLocation = customer.serviceLocations[0];

  // Determine if we should show additional contacts section
  const shouldShowAdditionalContacts = () => {
    if (isSimple) {
      // For SIMPLE mode: show if contacts exist OR customer has primary contact info
      return customer.additionalContacts.length > 0 || customer.email || customer.phone;
    }
    // For STANDARD mode: always show
    return true;
  };

  // Tab configuration
  const tabs = [    { id: 'overview', label: t('customers.tabs.overview'), count: undefined },
    { id: 'work-orders', label: getName('work_order', true), count: workOrdersData?.totalElements ?? 0 },
    { id: 'financial', label: t('customers.tabs.financial'), count: undefined },
    { id: 'equipment', label: getName('equipment'), count: equipmentPage?.totalElements ?? 0 },
    { id: 'activity', label: t('customers.tabs.activity'), count: undefined },
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

        {isSimple ? (
          /* SIMPLE VIEW - Homeowner */
          <div>
            {/* Header - Compact */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <Heading className="text-2xl">{customer.name}</Heading>
                <Text className="mt-1 flex flex-wrap items-center gap-1">
                  <PhoneIcon className="inline h-4 w-4 text-zinc-400" />
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="hover:underline">
                      {formatPhone(customer.phone)}
                    </a>
                  ) : (
                    t('customers.detail.noPhone')
                  )}
                  <span className="mx-1">•</span>
                  <EnvelopeIcon className="inline h-4 w-4 text-zinc-400" />
                  <a href={`mailto:${customer.email}`} className="hover:underline">
                    {customer.email}
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsNotificationDialogOpen(true)}
                    className="ml-1 inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    title={t('notifications.preferences.manage')}
                  >
                    <BellIcon className="h-4 w-4" />
                    {notificationOptInCount > 0 && (
                      <span className="text-[10px] font-medium">{notificationOptInCount}</span>
                    )}
                  </button>
                </Text>
                <Text className="mt-1 flex items-start gap-1">
                  <MapPinIcon className="inline h-4 w-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                  <span className="break-words">
                    {primaryLocation.address.streetAddress}
                    {primaryLocation.address.streetAddressLine2 && `, ${primaryLocation.address.streetAddressLine2}`}
                    , {primaryLocation.address.city}, {primaryLocation.address.state} {primaryLocation.address.zipCode}
                  </span>
                </Text>
              </div>
              <div className="flex gap-2 sm:flex-shrink-0">
                {canAddServiceLocations && (
                  <Button plain onClick={() => setIsAddLocationDialogOpen(true)}>
                    <PlusIcon className="size-4" />
                    <span className="hidden sm:inline">{t('common.actions.add', { entity: getName('service_location') })}</span>
                    <span className="sm:hidden">{t('common.actions.add', { entity: '' }).trim()}</span>
                  </Button>
                )}
                {canEditCustomers && (
                  <Button color="zinc" onClick={() => setIsEditDialogOpen(true)}>
                    <PencilIcon className="size-4" />
                    {t('common.edit')}
                  </Button>
                )}
              </div>
            </div>

            {/* Quick Stats Bar - Compact for homeowner */}
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50 sm:flex sm:items-center sm:gap-4 sm:px-4 sm:py-2">
              <div className="flex items-center gap-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('common.form.status')}:</Text>
                <Badge color="lime">{t('common.active')}</Badge>
              </div>
              <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />
              <div className="flex items-center gap-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('entities.region')}:</Text>
                <Text className="text-xs font-medium">{dispatchRegion?.name || '-'}</Text>
              </div>
              <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />
              <div className="flex items-center gap-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('customers.detail.lastService')}:</Text>
                <Text className="text-xs font-medium">{t('customers.detail.never')}</Text>
              </div>
              <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />
              <div className="flex items-center gap-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('common.actions.open', { entities: getName('work_order', true) })}:</Text>
                <Text className="text-xs font-medium">0</Text>
              </div>
              <div className="hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />
              <div className="flex items-center gap-2">
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">{t('customers.detail.balance')}:</Text>
                <Text className="text-xs font-medium">$0.00</Text>
              </div>
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
                <>
                  {/* Additional Contacts */}
                  {shouldShowAdditionalContacts() && (
                    <div className="mt-3">
                      <AdditionalContactsList
                        contacts={customer.additionalContacts}
                        parentId={customer.id}
                        parentType="customer"
                        customerId={customer.id}
                        queryKey={['customers', id!]}
                        canEdit={canEditCustomers}
                        showAddButton={true}
                      />
                    </div>
                  )}

                  {/* Notes */}
                  {customer.notes && (
                    <div className="mt-3">
                      <div className="mb-2">
                        <Subheading>{t('common.form.notes')}</Subheading>
                      </div>
                      <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <Text className="text-sm">{customer.notes}</Text>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'work-orders' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Subheading>{t('common.recentEntities', { entities: getName('work_order', true) })}</Subheading>
                    <Button plain onClick={() => setIsNewWorkOrderOpen(true)}>
                      <PlusIcon className="size-4" />
                      {t('common.actions.new', { entity: getName('work_order') })}
                    </Button>
                  </div>
                  <WorkOrdersList customerId={customer.id} />
                </div>
              )}

              {activeTab === 'financial' && (
                <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
                  <Text className="text-zinc-500 dark:text-zinc-400">Coming soon...</Text>
                </div>
              )}

              {activeTab === 'equipment' && equipmentTabContent}

              {activeTab === 'activity' && (
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <NotificationLogsList customerId={customer.id} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* STANDARD VIEW - Business/Landlord */
          <div>
            {/* Header - Business */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <Heading className="text-2xl flex items-center gap-2">
                  <BuildingOfficeIcon className="h-6 w-6 text-zinc-400" />
                  {customer.name}
                </Heading>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {customer.paymentTermsDays > 0 && (
                    <Badge color="amber">{t('customers.detail.netTerms', { days: customer.paymentTermsDays })}</Badge>
                  )}
                  {customer.requiresPurchaseOrder && (
                    <Badge color="sky">{t('customers.detail.requiresPo')}</Badge>
                  )}
                  {customer.taxExempt && (
                    <Badge color="purple">{t('customers.detail.taxExemptBadge')}</Badge>
                  )}
                  {customer.contractPricingTier && (
                    <Badge color="blue">{customer.contractPricingTier}</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <Text className="flex flex-wrap items-center gap-1">
                    <PhoneIcon className="inline h-4 w-4 text-zinc-400" />
                    {customer.phone ? (
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {formatPhone(customer.phone)}
                      </a>
                    ) : (
                      t('customers.detail.noPhone')
                    )}
                    <span className="mx-1">•</span>
                    <EnvelopeIcon className="inline h-4 w-4 text-zinc-400" />
                    <a href={`mailto:${customer.email}`} className="hover:underline">
                      {customer.email}
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsNotificationDialogOpen(true)}
                      className="ml-1 inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      title={t('notifications.preferences.manage')}
                    >
                      <BellIcon className="h-4 w-4" />
                      {notificationOptInCount > 0 && (
                        <span className="text-[10px] font-medium">{notificationOptInCount}</span>
                      )}
                    </button>
                  </Text>
                  <Text className="mt-1 flex items-start gap-1">
                    <CreditCardIcon className="inline h-4 w-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                    <span className="break-words">
                      {t('customers.detail.billingAddressLabel')}: {customer.billingAddress.streetAddress}, {customer.billingAddress.city}, {customer.billingAddress.state} {customer.billingAddress.zipCode}
                    </span>
                  </Text>
                </div>
              </div>
              {canEditCustomers && (
                <Button color="zinc" onClick={() => setIsEditDialogOpen(true)} className="sm:flex-shrink-0">
                  <PencilIcon className="size-4" />
                  {t('common.edit')}
                </Button>
              )}
            </div>

            {/* Quick Stats Bar - Responsive Grid */}
            <div className="mt-4 grid grid-cols-2 gap-px rounded-lg border border-zinc-200 bg-zinc-200 overflow-hidden dark:border-zinc-700 dark:bg-zinc-700 lg:grid-cols-4">
              <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
                <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{getName('service_location', true)}</Text>
                <Strong className="mt-1 block text-2xl">{customer.serviceLocations.length}</Strong>
              </div>
              <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
                <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('common.actions.open', { entities: getName('work_order', true) })}</Text>
                <Strong className="mt-1 block text-2xl">0</Strong>
              </div>
              <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
                <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('customers.detail.balance')}</Text>
                <Strong className="mt-1 block text-2xl">$0.00</Strong>
              </div>
              <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-900/50">
                <Text className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('customers.detail.lastService')}</Text>
                <Strong className="mt-1 block text-base">{t('customers.detail.never')}</Strong>
              </div>
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
                <>
                  {/* Two-column layout: Locations (left) + Contacts/Notes (right) */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column - Service Locations (2/3 width) */}
              <div className="lg:col-span-2">
                <div className="flex flex-col gap-2 mb-2 sm:flex-row sm:items-center sm:justify-between">
                  <Subheading>{t('common.entitiesCount', { entities: getName('service_location', true), count: customer.serviceLocations.length })}</Subheading>
                {canAddServiceLocations && (
                  <Button plain onClick={() => setIsAddLocationDialogOpen(true)} className="text-sm sm:flex-shrink-0">
                    <PlusIcon className="size-4" />
                    {t('common.actions.add', { entity: getName('service_location') })}
                  </Button>
                )}
              </div>

              {customer.serviceLocations.length >= 5 && (
                <div className="mt-2 flex items-center gap-4">
                  <InputGroup className="flex-1 max-w-md">
                    <MagnifyingGlassIcon data-slot="icon" />
                    <Input
                      type="text"
                      placeholder="Search locations..."
                      value={locationSearchQuery}
                      onChange={(e) => setLocationSearchQuery(e.target.value)}
                    />
                  </InputGroup>
                  {filteredLocations.length !== customer.serviceLocations.length && (
                    <>
                      {/* eslint-disable i18next/no-literal-string */}
                      <Text className="text-sm">
                        {filteredLocations.length} of {customer.serviceLocations.length}
                      </Text>
                      {/* eslint-enable i18next/no-literal-string */}
                    </>
                  )}
                </div>
              )}

              {/* TABLE LAYOUT - STANDARD customers always use table */}
              <div className="mt-2">
                <Table dense className="[--gutter:theme(spacing.1)] text-sm">
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('common.form.name')}</TableHeader>
                      <TableHeader>{t('customers.table.locationAddress')}</TableHeader>
                      <TableHeader>{t('customers.table.locationContact')}</TableHeader>
                      <TableHeader>{t('common.form.status')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredLocations.map((location) => (
                      <TableRow key={location.id} href={`/service-locations/${location.id}`} className="cursor-pointer">
                        <TableCell className="font-medium">
                          {location.locationName || 'Unnamed Location'}
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
                          {location.siteContactName ? (
                            <>
                              <div className="text-xs">{location.siteContactName}</div>
                              {location.siteContactPhone && (
                                <div className="text-xs">{formatPhone(location.siteContactPhone)}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge color={location.status === 'ACTIVE' ? 'lime' : 'zinc'} className="text-xs">
                            {location.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </div>

              {/* Right column - Contacts & Notes (1/3 width) */}
              <div className="space-y-4">
                {/* Additional Contacts */}
                {shouldShowAdditionalContacts() && (
                  <div>
                    <AdditionalContactsList
                      contacts={customer.additionalContacts}
                      parentId={customer.id}
                      parentType="customer"
                      customerId={customer.id}
                      queryKey={['customers', id!]}
                      canEdit={canEditCustomers}
                      showAddButton={true}
                    />
                  </div>
                )}

                {/* Notes */}
                {customer.notes && (
                  <div>
                    <Subheading>{t('common.form.notes')}</Subheading>
                    <div className="mt-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                      <Text>{customer.notes}</Text>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'work-orders' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <Subheading>{t('common.recentEntities', { entities: getName('work_order', true) })}</Subheading>
              <Button plain onClick={() => setIsNewWorkOrderOpen(true)}>
                <PlusIcon className="size-4" />
                {t('common.actions.new', { entity: getName('work_order') })}
              </Button>
            </div>
            <WorkOrdersList customerId={customer.id} />
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
            <Text className="text-zinc-500 dark:text-zinc-400">Coming soon...</Text>
          </div>
        )}

        {activeTab === 'equipment' && equipmentTabContent}

        {activeTab === 'activity' && (
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <NotificationLogsList customerId={customer.id} />
          </div>
        )}
      </div>
    </div>
  )}
      </div>

      <ServiceLocationFormDialog
        isOpen={isAddLocationDialogOpen}
        onClose={() => setIsAddLocationDialogOpen(false)}
        customerId={id!}
      />
      <CustomerFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        customer={customer}
      />
      <NotificationPreferencesDialog
        isOpen={isNotificationDialogOpen}
        onClose={() => setIsNotificationDialogOpen(false)}
        customerId={customer.id}
        contactName={customer.name}
      />
      <WorkOrderFormDialog
        isOpen={isNewWorkOrderOpen}
        onClose={() => setIsNewWorkOrderOpen(false)}
        prefilledCustomer={{ id: customer.id, name: customer.name }}
      />
      <EquipmentFormDialog
        isOpen={isEquipmentDialogOpen}
        onClose={() => {
          setIsEquipmentDialogOpen(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        lockedCustomer={{ id: customer.id, name: customer.name }}
      />
    </AppLayout>
  );
}
