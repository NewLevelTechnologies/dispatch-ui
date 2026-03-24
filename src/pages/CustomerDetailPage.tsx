import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customerApi } from '../api';
import AppLayout from '../components/AppLayout';
import ServiceLocationFormDialog from '../components/ServiceLocationFormDialog';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Text, Strong } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Input, InputGroup } from '../components/catalyst/input';
import { ArrowLeftIcon, PencilIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isAddLocationDialogOpen, setIsAddLocationDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customerApi.getById(id!),
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
          <Text>Loading customer...</Text>
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
              {t('customers.detail.errorLoading')}
              {error && `: ${(error as Error).message}`}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/customers')}>
            <ArrowLeftIcon className="size-4" />
            {t('customers.detail.backToCustomers')}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isSimple = customer.displayMode === 'SIMPLE';
  const primaryLocation = customer.serviceLocations[0];

  // Adaptive layout: cards for ≤5 locations, table for >5
  const useTableLayout = customer.serviceLocations.length > 5;

  return (
    <AppLayout>
      <div className="p-4">
        {/* Back Button */}
        <div className="mb-2">
          <Button plain onClick={() => navigate('/customers')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        {isSimple ? (
          /* SIMPLE VIEW - Homeowner */
          <div className="max-w-4xl">
            {/* Header - Compact */}
            <div className="flex items-start justify-between">
              <div>
                <Heading className="text-2xl">{customer.name}</Heading>
                {/* eslint-disable i18next/no-literal-string */}
                <Text className="mt-1">
                  📞 {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="hover:underline">
                      {customer.phone}
                    </a>
                  ) : (
                    t('customers.detail.noPhone')
                  )} • 📧 <a href={`mailto:${customer.email}`} className="hover:underline">
                    {customer.email}
                  </a>
                </Text>
                {/* eslint-enable i18next/no-literal-string */}
                <Text className="mt-1">
                  📍 {primaryLocation.address.streetAddress}
                  {primaryLocation.address.streetAddressLine2 && `, ${primaryLocation.address.streetAddressLine2}`}
                  , {primaryLocation.address.city}, {primaryLocation.address.state} {primaryLocation.address.zipCode}
                </Text>
              </div>
              <div className="flex gap-2">
                <Button plain onClick={() => setIsAddLocationDialogOpen(true)}>
                  <PlusIcon className="size-4" />
                  {t('customers.detail.addLocation')}
                </Button>
                <Button color="zinc" onClick={() => setIsEditDialogOpen(true)}>
                  <PencilIcon className="size-4" />
                  {t('common.edit')}
                </Button>
              </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="mt-4 grid grid-cols-4 gap-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
              <div>
                <Text className="text-xs">{t('common.form.status')}</Text>
                <Badge color="lime" className="mt-1">{t('common.active')}</Badge>
              </div>
              <div>
                <Text className="text-xs">{t('customers.detail.lastService')}</Text>
                <Strong className="mt-1 block text-sm">{t('customers.detail.never')}</Strong>
              </div>
              <div>
                <Text className="text-xs">{t('customers.detail.openWorkOrders')}</Text>
                <Strong className="mt-1 block text-sm">0</Strong>
              </div>
              <div>
                <Text className="text-xs">{t('customers.detail.balance')}</Text>
                <Strong className="mt-1 block text-sm">$0.00</Strong>
              </div>
            </div>

            {/* Equipment Section */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Subheading>{t('customers.detail.equipment')}</Subheading>
                <Button plain>
                  <PlusIcon className="size-4" />
                  {t('customers.detail.addEquipment')}
                </Button>
              </div>
              <div className="mt-2 rounded-lg border border-zinc-200 p-4 text-center dark:border-zinc-800">
                <Text>{t('customers.detail.noEquipment')}</Text>
              </div>
            </div>

            {/* Recent Work Orders */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Subheading>{t('customers.detail.recentWorkOrders')}</Subheading>
                <Button plain>
                  <PlusIcon className="size-4" />
                  {t('customers.form.newWorkOrder')}
                </Button>
              </div>
              <div className="mt-2 rounded-lg border border-zinc-200 p-4 text-center dark:border-zinc-800">
                <Text>{t('customers.detail.noWorkOrders')}</Text>
              </div>
            </div>

            {/* Notes */}
            {customer.notes && (
              <div className="mt-4">
                <Subheading>{t('common.form.notes')}</Subheading>
                <div className="mt-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Text>{customer.notes}</Text>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* STANDARD VIEW - Business/Landlord */
          <div className="max-w-6xl">
            {/* Header - Business */}
            <div className="flex items-start justify-between">
              <div>
                <Heading className="text-2xl">
                  🏢 {customer.name}
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
                  {/* eslint-disable i18next/no-literal-string */}
                  <Text>
                    📞 {customer.phone ? (
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {customer.phone}
                      </a>
                    ) : (
                      t('customers.detail.noPhone')
                    )} • 📧 <a href={`mailto:${customer.email}`} className="hover:underline">
                      {customer.email}
                    </a>
                  </Text>
                  {/* eslint-enable i18next/no-literal-string */}
                  <Text className="mt-1">
                    💳 {t('customers.detail.billingAddressLabel')}: {customer.billingAddress.streetAddress}, {customer.billingAddress.city}, {customer.billingAddress.state} {customer.billingAddress.zipCode}
                  </Text>
                </div>
              </div>
              <Button color="zinc" onClick={() => setIsEditDialogOpen(true)}>
                <PencilIcon className="size-4" />
                {t('common.edit')}
              </Button>
            </div>

            {/* Service Locations */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Subheading>{t('customers.detail.serviceLocationsCount', { count: customer.serviceLocations.length })}</Subheading>
                {useTableLayout && (
                  <Button plain onClick={() => setIsAddLocationDialogOpen(true)}>
                    <PlusIcon className="size-4" />
                    {t('customers.detail.addLocation')}
                  </Button>
                )}
              </div>

              {useTableLayout && (
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

              {useTableLayout ? (
                /* TABLE LAYOUT for many locations */
                <div className="mt-2">
                  <Table dense className="[--gutter:theme(spacing.1)] text-sm">
                    <TableHead>
                      <TableRow>
                        <TableHeader>{t('customers.table.locationName')}</TableHeader>
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
                          <TableCell>
                            <Text className="text-xs">
                              {location.address.streetAddress}
                              {location.address.streetAddressLine2 && `, ${location.address.streetAddressLine2}`}
                            </Text>
                            <Text className="text-xs">
                              {location.address.city}, {location.address.state} {location.address.zipCode}
                            </Text>
                          </TableCell>
                          <TableCell>
                            {location.siteContactName ? (
                              <Text className="text-xs">
                                {location.siteContactName}
                                {location.siteContactPhone && ` • ${location.siteContactPhone}`}
                              </Text>
                            ) : (
                              <Text className="text-xs">-</Text>
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
              ) : (
                /* CARD LAYOUT for few locations */
                <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {customer.serviceLocations.map((location) => (
                  <div
                    key={location.id}
                    className="rounded-lg border border-zinc-200 p-3 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Strong className="text-sm">
                          {location.locationName || 'Unnamed Location'}
                        </Strong>
                        <Text className="mt-1 text-xs">
                          📍 {location.address.streetAddress}
                          {location.address.streetAddressLine2 && `, ${location.address.streetAddressLine2}`}
                        </Text>
                        <Text className="text-xs">
                          {location.address.city}, {location.address.state} {location.address.zipCode}
                        </Text>

                        {(location.siteContactName || location.siteContactPhone || location.siteContactEmail) && (
                          <Text className="mt-2 text-xs">
                            {location.siteContactName && <>👤 {location.siteContactName}</>}
                            {location.siteContactPhone && (
                              <>{location.siteContactName && ' • '}<a href={`tel:${location.siteContactPhone}`} className="hover:underline">
                                {location.siteContactPhone}
                              </a></>
                            )}
                            {location.siteContactEmail && (
                              <>{(location.siteContactName || location.siteContactPhone) && ' • '}<a href={`mailto:${location.siteContactEmail}`} className="hover:underline">
                                {location.siteContactEmail}
                              </a></>
                            )}
                          </Text>
                        )}

                        {location.accessInstructions && (
                          <Text className="mt-2 text-xs">
                            🔑 {location.accessInstructions}
                          </Text>
                        )}
                      </div>
                      <Badge color={location.status === 'ACTIVE' ? 'lime' : 'zinc'} className="text-xs">
                        {location.status}
                      </Badge>
                    </div>

                    <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <Text className="flex items-center justify-between text-xs">
                        <span>{t('customers.detail.equipmentCount', { count: 0 })}</span>
                        <span>{t('customers.detail.lastServiceNever')}</span>
                      </Text>
                    </div>

                    <Button
                      plain
                      className="mt-2 w-full text-xs"
                      onClick={() => navigate(`/service-locations/${location.id}`)}
                    >
                      {t('customers.detail.viewDetails')}
                    </Button>
                  </div>
                ))}

                  {/* Add Location Card */}
                  <button
                    type="button"
                    onClick={() => setIsAddLocationDialogOpen(true)}
                    className="flex min-h-[160px] items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-3 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                  >
                    <div className="text-center">
                      <PlusIcon className="mx-auto size-8 text-zinc-400" />
                      <Strong className="mt-2 block text-sm">
                        {t('customers.detail.addServiceLocation')}
                      </Strong>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            {customer.notes && (
              <div className="mt-4">
                <Subheading>{t('common.form.notes')}</Subheading>
                <div className="mt-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Text>{customer.notes}</Text>
                </div>
              </div>
            )}
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
    </AppLayout>
  );
}
