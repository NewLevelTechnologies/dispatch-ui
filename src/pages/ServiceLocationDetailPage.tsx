import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customerApi } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import AdditionalContactsList from '../components/AdditionalContactsList';
import { formatPhone } from '../utils/formatPhone';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Text, Strong } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { ArrowLeftIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Divider } from '../components/catalyst/divider';

export default function ServiceLocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Permission checks
  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');

  // Fetch all customers to find the service location
  const { data: customers, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerApi.getAll(),
  });

  // Find the service location and its customer
  const locationData = customers
    ?.flatMap((customer) =>
      customer.serviceLocations.map((location) => ({
        location,
        customer,
      }))
    )
    .find((item) => item.location.id === id);

  const location = locationData?.location;
  const customer = locationData?.customer;

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  return (
    <AppLayout>
      <div className="p-4">
        {/* Back Button */}
        <div className="mb-2">
          <Button plain onClick={() => navigate('/service-locations')}>
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

          {/* Main Content - 2 Column Layout */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                    queryKey={['customers']}
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

              {/* Equipment Section */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <Subheading>{getName('equipment')}</Subheading>
                  {/* TODO: Add equipment permission check when equipment management is implemented */}
                  <Button plain>
                    <PlusIcon className="size-4" />
                    {t('common.actions.add', { entity: getName('equipment') })}
                  </Button>
                </div>
                <div className="mt-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">{t('common.actions.noEntitiesYet', { entities: getName('equipment', true) })}</Text>
                </div>
              </div>

              {/* Recent Work Orders */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <Subheading>{t('common.recentEntities', { entities: getName('work_order', true) })}</Subheading>
                  {/* TODO: Add work order permission check when work order management is implemented */}
                  <Button plain>
                    <PlusIcon className="size-4" />
                    {t('common.actions.new', { entity: getName('work_order') })}
                  </Button>
                </div>
                <div className="mt-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">{t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}</Text>
                </div>
              </div>
            </div>

            {/* Right Column - Stats and Metadata */}
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <Subheading>{t('serviceLocations.detail.quickStats')}</Subheading>
                <div className="mt-2 space-y-3">
                  <div>
                    <Text className="text-xs">{t('serviceLocations.detail.totalEquipment')}</Text>
                    <Strong className="mt-1 block text-lg">0</Strong>
                  </div>
                  <Divider />
                  <div>
                    <Text className="text-xs">{t('common.actions.open', { entities: getName('work_order', true) })}</Text>
                    <Strong className="mt-1 block text-lg">0</Strong>
                  </div>
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

              {/* System Metadata */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <Subheading>{t('serviceLocations.detail.systemInfo')}</Subheading>
                <div className="mt-2 space-y-2">
                  <div>
                    <Text className="text-xs text-zinc-500">{t('serviceLocations.detail.locationId')}</Text>
                    <Text className="text-xs font-mono">{location.id.substring(0, 8)}...</Text>
                  </div>
                  <Divider />
                  <div>
                    <Text className="text-xs text-zinc-500">{t('serviceLocations.detail.created')}</Text>
                    <Text className="text-xs">{formatDate(location.createdAt)}</Text>
                  </div>
                  <Divider />
                  <div>
                    <Text className="text-xs text-zinc-500">{t('serviceLocations.detail.lastUpdated')}</Text>
                    <Text className="text-xs">{formatDate(location.updatedAt)}</Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ServiceLocationFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        serviceLocation={location}
        customerId={customer.id}
      />
    </AppLayout>
  );
}
