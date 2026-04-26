import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import {
  workOrderApi,
  customerApi,
  dispatchRegionApi,
  workOrderTypesApi,
  divisionsApi,
  workItemStatusesApi,
  type WorkOrder,
  type WorkOrderPriority,
  type ProgressCategory,
  type ServiceLocationSearchResult,
  type CreateCustomerRequest,
  type CreateWorkOrderRequest,
  type UpdateWorkOrderRequest,
  type WorkItemStatus,
  type WorkItemResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Field, FieldGroup, Fieldset, Label, Legend } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';
import { Radio, RadioField, RadioGroup } from './catalyst/radio';
import { Subheading } from './catalyst/heading';
import { Badge } from './catalyst/badge';
import ServiceLocationPicker from './ServiceLocationPicker';
import { US_STATES } from '../constants/states';

interface AddressData {
  streetAddress: string;
  streetAddressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

interface WorkOrderFormState {
  customerId: string;
  serviceLocationId: string;
  workOrderTypeId: string;
  divisionId: string;
  priority: WorkOrderPriority;
  scheduledDate: string;
  description: string;
  customerOrderNumber: string;
  internalNotes: string;
}

const EMPTY_FORM: WorkOrderFormState = {
  customerId: '',
  serviceLocationId: '',
  workOrderTypeId: '',
  divisionId: '',
  priority: 'NORMAL',
  scheduledDate: '',
  description: '',
  customerOrderNumber: '',
  internalNotes: '',
};

const PROGRESS_COLORS: Record<ProgressCategory, 'zinc' | 'blue' | 'amber' | 'lime'> = {
  NOT_STARTED: 'zinc',
  IN_PROGRESS: 'blue',
  BLOCKED: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

interface WorkOrderFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder?: WorkOrder | null;
}

export default function WorkOrderFormDialog({ isOpen, onClose, workOrder }: WorkOrderFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const isEdit = !!workOrder?.id;
  const isCancelled = workOrder?.lifecycleState === 'CANCELLED';
  const readOnly = isCancelled;

  // Customer mode: existing or new
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [formData, setFormData] = useState<WorkOrderFormState>(EMPTY_FORM);
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocationSearchResult | null>(null);

  // New customer form data
  const [locationName, setLocationName] = useState('');
  const [locationPhone, setLocationPhone] = useState('');
  const [locationEmail, setLocationEmail] = useState('');
  const [customerName, setCustomerName] = useState('');

  const [serviceAddress, setServiceAddress] = useState<AddressData>({
    streetAddress: '',
    streetAddressLine2: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const [billingAddress, setBillingAddress] = useState<AddressData>({
    streetAddress: '',
    streetAddressLine2: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const [billingAddressSameAsService, setBillingAddressSameAsService] = useState(true);
  const [showSiteContact, setShowSiteContact] = useState(false);
  const [showAccessInstructions, setShowAccessInstructions] = useState(false);
  const [showBusinessTerms, setShowBusinessTerms] = useState(false);

  const [siteContact, setSiteContact] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const [accessInstructions, setAccessInstructions] = useState('');

  const [businessTerms, setBusinessTerms] = useState({
    paymentTermsDays: 0,
    requiresPurchaseOrder: false,
    contractPricingTier: '',
    taxExempt: false,
    taxExemptCertificate: '',
    notes: '',
  });

  const [dispatchRegionId, setDispatchRegionId] = useState('');

  // Tenant config — work order types & divisions (Phase 4)
  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
    enabled: isOpen,
  });
  const activeTypes = Array.isArray(workOrderTypes) ? workOrderTypes.filter((tx) => tx.isActive) : [];

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => divisionsApi.getAll(),
    enabled: isOpen,
  });
  const activeDivisions = Array.isArray(divisions) ? divisions.filter((d) => d.isActive) : [];

  // Item statuses — only needed when editing an order that has items
  const hasWorkItems = !!workOrder?.workItems?.length;
  const { data: itemStatuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
    enabled: isOpen && isEdit && hasWorkItems,
  });

  // Active dispatch regions — for new-customer flow
  const { data: activeRegions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
    enabled: isOpen && !isEdit && customerMode === 'new',
  });

  // Auto-select single region
  const showRegionDropdown = activeRegions && activeRegions.length > 1;
  const defaultRegionId = activeRegions?.length === 1 ? activeRegions[0].id : '';

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    if (workOrder) {
      // Edit mode
      setFormData({
        customerId: workOrder.customerId,
        serviceLocationId: workOrder.serviceLocationId,
        workOrderTypeId: workOrder.workOrderTypeId ?? '',
        divisionId: workOrder.divisionId ?? '',
        priority: workOrder.priority ?? 'NORMAL',
        scheduledDate: workOrder.scheduledDate || '',
        description: workOrder.description || '',
        customerOrderNumber: workOrder.customerOrderNumber || '',
        internalNotes: workOrder.internalNotes || '',
      });
      setSelectedLocation(
        workOrder.serviceLocation
          ? {
              id: workOrder.serviceLocationId,
              customerId: workOrder.customerId,
              customerName: workOrder.customer?.name ?? '',
              locationName: workOrder.serviceLocation.locationName ?? null,
              address: workOrder.serviceLocation.address,
              siteContactName: workOrder.serviceLocation.siteContactName ?? null,
              siteContactPhone: workOrder.serviceLocation.siteContactPhone ?? null,
              status: 'ACTIVE',
            }
          : null
      );
    } else {
      // Create mode - reset everything
      setCustomerMode('existing');
      setIsCreatingCustomer(false);
      setFormData(EMPTY_FORM);
      setSelectedLocation(null);
      setLocationName('');
      setLocationPhone('');
      setLocationEmail('');
      setCustomerName('');
      setServiceAddress({ streetAddress: '', streetAddressLine2: '', city: '', state: '', zipCode: '' });
      setBillingAddress({ streetAddress: '', streetAddressLine2: '', city: '', state: '', zipCode: '' });
      setBillingAddressSameAsService(true);
      setShowSiteContact(false);
      setShowAccessInstructions(false);
      setShowBusinessTerms(false);
      setSiteContact({ name: '', phone: '', email: '' });
      setAccessInstructions('');
      setBusinessTerms({
        paymentTermsDays: 0,
        requiresPurchaseOrder: false,
        contractPricingTier: '',
        taxExempt: false,
        taxExemptCertificate: '',
        notes: '',
      });
      setDispatchRegionId(defaultRegionId);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workOrder, isOpen, defaultRegionId]);

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkOrderRequest) => workOrderApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      setIsCreatingCustomer(false);
      onClose();
    },
    onError: (error: unknown) => {
      setIsCreatingCustomer(false);
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: getName('work_order') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateWorkOrderRequest) =>
      workOrderApi.update(workOrder!.id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: getName('work_order') }));
    },
  });

  const handleLocationChange = (location: ServiceLocationSearchResult | null) => {
    setSelectedLocation(location);
    if (location) {
      setFormData((prev) => ({
        ...prev,
        customerId: location.customerId,
        serviceLocationId: location.id,
      }));
    }
  };

  const buildCreateRequest = (overrides?: Partial<CreateWorkOrderRequest>): CreateWorkOrderRequest => ({
    customerId: formData.customerId,
    serviceLocationId: formData.serviceLocationId,
    workOrderTypeId: formData.workOrderTypeId || undefined,
    divisionId: formData.divisionId || undefined,
    priority: formData.priority,
    scheduledDate: formData.scheduledDate || undefined,
    description: formData.description || undefined,
    customerOrderNumber: formData.customerOrderNumber || undefined,
    internalNotes: formData.internalNotes || undefined,
    ...overrides,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (isEdit) {
      const updateRequest: UpdateWorkOrderRequest = {
        workOrderTypeId: formData.workOrderTypeId || null,
        divisionId: formData.divisionId || null,
        priority: formData.priority,
        scheduledDate: formData.scheduledDate || undefined,
        description: formData.description,
        customerOrderNumber: formData.customerOrderNumber || undefined,
        internalNotes: formData.internalNotes,
      };
      updateMutation.mutate(updateRequest);
      return;
    }

    // Create mode
    if (customerMode === 'existing') {
      if (!formData.serviceLocationId) {
        alert(t('workOrders.form.selectServiceLocation', { entity: getName('service_location') }));
        return;
      }
      createMutation.mutate(buildCreateRequest());
    } else {
      // New customer mode - create customer first, then work order
      setIsCreatingCustomer(true);
      try {
        const customerRequest: CreateCustomerRequest = {
          name: billingAddressSameAsService ? locationName : customerName,
          email: locationEmail,
          phone: locationPhone || null,
          billingAddress: billingAddressSameAsService ? serviceAddress : billingAddress,
          serviceLocations: [
            {
              dispatchRegionId,
              locationName: locationName,
              address: serviceAddress,
              siteContactName: siteContact.name || null,
              siteContactPhone: siteContact.phone || null,
              siteContactEmail: siteContact.email || null,
              accessInstructions: accessInstructions || null,
              notes: businessTerms.notes || null,
            },
          ],
          billingAddressSameAsService,
          paymentTermsDays: businessTerms.paymentTermsDays,
          requiresPurchaseOrder: businessTerms.requiresPurchaseOrder,
          contractPricingTier: businessTerms.contractPricingTier || null,
          taxExempt: businessTerms.taxExempt,
          taxExemptCertificate: businessTerms.taxExemptCertificate || null,
          notes: businessTerms.notes || null,
        };

        const createdCustomer = await customerApi.create(customerRequest);
        const firstLocation = createdCustomer.serviceLocations[0];

        // Invalidate so new data shows in customers/locations pages
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['service-locations'] });

        createMutation.mutate(
          buildCreateRequest({
            customerId: createdCustomer.id,
            serviceLocationId: firstLocation.id,
          })
        );
      } catch (error) {
        setIsCreatingCustomer(false);
        const errorMessage = error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
          : undefined;
        alert(errorMessage || t('common.form.errorCreate', { entity: getName('customer') }));
      }
    }
  };

  const handleChange = <K extends keyof WorkOrderFormState>(field: K, value: WorkOrderFormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="4xl">
      <DialogTitle>
        <div className="flex items-center gap-2">
          <span>
            {t('common.form.titleCreate', {
              action: isEdit ? t('common.edit') : t('common.create'),
              entity: getName('work_order')
            })}
          </span>
          {isEdit && workOrder?.workOrderNumber && (
            <span className="font-mono text-sm font-normal text-zinc-500">{workOrder.workOrderNumber}</span>
          )}
          {isEdit && workOrder && !isCancelled && (
            <Badge color={PROGRESS_COLORS[workOrder.progressCategory]}>
              {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workOrder.progressCategory]}`)}
            </Badge>
          )}
        </div>
      </DialogTitle>
      {!isEdit && (
        <DialogDescription>
          {t('common.form.descriptionCreate', { entity: getName('work_order') })}
        </DialogDescription>
      )}
      <DialogBody>
        {isCancelled && (
          <div className="mb-4 rounded-md bg-zinc-100 p-3 ring-1 ring-zinc-200 dark:bg-zinc-800/40 dark:ring-zinc-700">
            <div className="flex items-center gap-2">
              <Badge color="zinc">{t('workOrders.actions.cancelledBadge')}</Badge>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {t('workOrders.actions.frozenHelper', { entity: getName('work_order') })}
              </span>
            </div>
            {workOrder?.cancellationReason && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">{t('workOrders.actions.cancelReasonLabel')}:</span>{' '}
                {workOrder.cancellationReason}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} id="work-order-form" className="space-y-3">
          {!isEdit && (
            <>
              {/* Radio Toggle: Existing vs New Customer */}
              <Fieldset>
                <Legend>{getName('customer')}</Legend>
                <RadioGroup
                  value={customerMode}
                  onChange={(value) => setCustomerMode(value as 'existing' | 'new')}
                  className="mt-2 flex gap-6"
                >
                  <RadioField>
                    <Radio value="existing" />
                    <Label>{t('workOrders.form.existingCustomer', { entity: getName('customer') })}</Label>
                  </RadioField>
                  <RadioField>
                    <Radio value="new" />
                    <Label>{t('workOrders.form.newCustomer', { entity: getName('customer') })}</Label>
                  </RadioField>
                </RadioGroup>
              </Fieldset>

              {/* Conditional: Existing Customer - Service Location Picker */}
              {customerMode === 'existing' && (
                <ServiceLocationPicker
                  value={selectedLocation}
                  onChange={handleLocationChange}
                  label={getName('service_location')}
                  required
                  autoFocus
                />
              )}

              {/* Conditional: New Customer - Inline Form */}
              {customerMode === 'new' && (
                <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  {/* PRIMARY SECTION: Service Location Info */}
                  <div>
                    <Subheading className="mb-3 text-base font-semibold">{t('customers.form.serviceLocationPrompt')}</Subheading>
                    <div className="space-y-2">
                      {/* Row 1: Name, Email, Phone (Service Location) */}
                    <div className="grid grid-cols-12 gap-2">
                      <Field className="col-span-5">
                        <Label className="text-xs">{t('common.form.name')} *</Label>
                        <Input
                          name="locationName"
                          value={locationName}
                          onChange={(e) => setLocationName(e.target.value)}
                          required
                        />
                      </Field>
                      <Field className="col-span-3">
                        <Label className="text-xs">{t('common.form.email')} *</Label>
                        <Input
                          type="email"
                          name="locationEmail"
                          value={locationEmail}
                          onChange={(e) => setLocationEmail(e.target.value)}
                          required
                        />
                      </Field>
                      <Field className="col-span-4">
                        <Label className="text-xs">{t('common.form.phone')}</Label>
                        <PatternFormat
                          format="(###) ###-####"
                          mask="_"
                          customInput={Input}
                          name="locationPhone"
                          value={locationPhone}
                          onValueChange={(values) => setLocationPhone(values.value)}
                        />
                      </Field>
                    </div>

                    {/* Row 2: Street + Apt */}
                    <div className="grid grid-cols-4 gap-2">
                      <Field className="col-span-3">
                        <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
                        <Input
                          name="serviceStreetAddress"
                          value={serviceAddress.streetAddress}
                          onChange={(e) =>
                            setServiceAddress((prev) => ({ ...prev, streetAddress: e.target.value }))
                          }
                          required
                        />
                      </Field>
                      <Field className="col-span-1">
                        <Label className="text-xs">{t('common.form.addressLine2')}</Label>
                        <Input
                          name="serviceStreetAddressLine2"
                          value={serviceAddress.streetAddressLine2}
                          onChange={(e) =>
                            setServiceAddress((prev) => ({ ...prev, streetAddressLine2: e.target.value }))
                          }
                          placeholder="Apt"
                        />
                      </Field>
                    </div>

                    {/* Row 3: City/State/Zip */}
                    <div className="grid grid-cols-12 gap-2">
                      <Field className="col-span-6">
                        <Label className="text-xs">{t('common.form.city')} *</Label>
                        <Input
                          name="serviceCity"
                          value={serviceAddress.city}
                          onChange={(e) =>
                            setServiceAddress((prev) => ({ ...prev, city: e.target.value }))
                          }
                          required
                        />
                      </Field>
                      <Field className="col-span-2">
                        <Label className="text-xs">{t('common.form.state')} *</Label>
                        <Select
                          name="serviceState"
                          value={serviceAddress.state}
                          onChange={(e) =>
                            setServiceAddress((prev) => ({ ...prev, state: e.target.value }))
                          }
                          required
                        >
                          <option value="">{t('common.form.select')}</option>
                          {US_STATES.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field className="col-span-4">
                        <Label className="text-xs">{t('common.form.zipCode')} *</Label>
                        <Input
                          name="serviceZipCode"
                          value={serviceAddress.zipCode}
                          onChange={(e) =>
                            setServiceAddress((prev) => ({ ...prev, zipCode: e.target.value }))
                          }
                          required
                        />
                      </Field>
                    </div>

                    {/* Dispatch Region - Only show if 2+ regions */}
                    {showRegionDropdown && (
                      <Field>
                        <Label className="text-xs">{getName('dispatch')} {t('entities.region')} *</Label>
                        <Select
                          name="dispatchRegionId"
                          value={dispatchRegionId}
                          onChange={(e) => setDispatchRegionId(e.target.value)}
                          required
                        >
                          <option value="">{t('dispatchRegions.form.selectRegion')}</option>
                          {activeRegions?.map((region) => (
                            <option key={region.id} value={region.id}>
                              {region.name} ({region.abbreviation})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    </div>
                  </div>

                  {/* BILLING CHECKBOX */}
                  <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <CheckboxField>
                      <Checkbox
                        name="billingAddressSameAsService"
                        checked={billingAddressSameAsService}
                        onChange={(checked) => setBillingAddressSameAsService(checked)}
                      />
                      <Label className="font-medium">{t('common.form.billingAddressSameAsService')}</Label>
                    </CheckboxField>
                  </div>

                  {/* CONDITIONAL: Billing Address (if different) */}
                  {!billingAddressSameAsService && (
                    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <Subheading className="mb-3 text-sm font-semibold">{t('customers.form.billingInvoiceRecipient')}</Subheading>
                      <div className="space-y-2">
                        {/* Billing Name */}
                        <Field>
                          <Label className="text-xs">{t('customers.form.companyName')}</Label>
                          <Input
                            name="billingName"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="e.g., Burger King Corporate"
                            required
                          />
                        </Field>

                        {/* Street + Apt */}
                      <div className="grid grid-cols-4 gap-2">
                        <Field className="col-span-3">
                          <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
                          <Input
                            name="billingStreetAddress"
                            value={billingAddress.streetAddress}
                            onChange={(e) =>
                              setBillingAddress((prev) => ({ ...prev, streetAddress: e.target.value }))
                            }
                            required
                          />
                        </Field>
                        <Field className="col-span-1">
                          <Label className="text-xs">{t('common.form.addressLine2')}</Label>
                          <Input
                            name="billingStreetAddressLine2"
                            value={billingAddress.streetAddressLine2}
                            onChange={(e) =>
                              setBillingAddress((prev) => ({ ...prev, streetAddressLine2: e.target.value }))
                            }
                            placeholder="Apt"
                          />
                        </Field>
                      </div>

                      {/* City/State/Zip */}
                      <div className="grid grid-cols-12 gap-2">
                        <Field className="col-span-6">
                          <Label className="text-xs">{t('common.form.city')} *</Label>
                          <Input
                            name="billingCity"
                            value={billingAddress.city}
                            onChange={(e) =>
                              setBillingAddress((prev) => ({ ...prev, city: e.target.value }))
                            }
                            required
                          />
                        </Field>
                        <Field className="col-span-2">
                          <Label className="text-xs">{t('common.form.state')} *</Label>
                          <Select
                            name="billingState"
                            value={billingAddress.state}
                            onChange={(e) =>
                              setBillingAddress((prev) => ({ ...prev, state: e.target.value }))
                            }
                            required
                          >
                            <option value="">{t('common.form.select')}</option>
                            {US_STATES.map((state) => (
                              <option key={state} value={state}>
                                {state}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field className="col-span-4">
                          <Label className="text-xs">{t('common.form.zipCode')} *</Label>
                          <Input
                            name="billingZipCode"
                            value={billingAddress.zipCode}
                            onChange={(e) =>
                              setBillingAddress((prev) => ({ ...prev, zipCode: e.target.value }))
                            }
                            required
                          />
                        </Field>
                      </div>
                      </div>
                    </div>
                  )}

                  {/* OPTIONAL SECTIONS - Collapsible */}
                  <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    {/* Site Contact - Collapsible */}
                    <div>
                    <button
                      type="button"
                      onClick={() => setShowSiteContact(!showSiteContact)}
                      className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      <svg className={`h-4 w-4 transition-transform ${showSiteContact ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {t('customers.detail.siteContact')}
                    </button>
                    {showSiteContact && (
                      <div className="mt-2 grid grid-cols-3 gap-2 pl-6">
                        <Field>
                          <Label className="text-xs">{t('common.form.name')}</Label>
                          <Input
                            name="siteContactName"
                            value={siteContact.name}
                            onChange={(e) => setSiteContact({ ...siteContact, name: e.target.value })}
                          />
                        </Field>
                        <Field>
                          <Label className="text-xs">{t('common.form.phone')}</Label>
                          <PatternFormat
                            format="(###) ###-####"
                            mask="_"
                            customInput={Input}
                            name="siteContactPhone"
                            value={siteContact.phone}
                            onValueChange={(values) => setSiteContact({ ...siteContact, phone: values.value })}
                          />
                        </Field>
                        <Field>
                          <Label className="text-xs">{t('common.form.email')}</Label>
                          <Input
                            type="email"
                            name="siteContactEmail"
                            value={siteContact.email}
                            onChange={(e) => setSiteContact({ ...siteContact, email: e.target.value })}
                          />
                        </Field>
                      </div>
                    )}
                  </div>

                    {/* Access Instructions - Collapsible */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowAccessInstructions(!showAccessInstructions)}
                        className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                      >
                        <svg className={`h-4 w-4 transition-transform ${showAccessInstructions ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {t('customers.form.accessInstructionsOptional')}
                      </button>
                      {showAccessInstructions && (
                        <div className="mt-2 pl-6">
                          <Input
                            name="accessInstructions"
                            value={accessInstructions}
                            onChange={(e) => setAccessInstructions(e.target.value)}
                            placeholder="e.g., Use back entrance, gate code 1234"
                          />
                        </div>
                      )}
                    </div>

                    {/* Business Terms - Collapsible */}
                    <div>
                    <button
                      type="button"
                      onClick={() => setShowBusinessTerms(!showBusinessTerms)}
                      className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      <svg className={`h-4 w-4 transition-transform ${showBusinessTerms ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {t('customers.detail.businessTermsOptional')}
                    </button>
                    {showBusinessTerms && (
                      <div className="mt-2 space-y-2 pl-6">
                        <div className="grid grid-cols-2 gap-2">
                          <Field>
                            <Label className="text-xs">{t('customers.detail.paymentTerms')}</Label>
                            <Input
                              type="number"
                              name="paymentTermsDays"
                              value={businessTerms.paymentTermsDays}
                              onChange={(e) => setBusinessTerms({ ...businessTerms, paymentTermsDays: parseInt(e.target.value) || 0 })}
                              min="0"
                              placeholder="0 = Due on receipt"
                            />
                          </Field>
                          <Field>
                            <Label className="text-xs">{t('customers.detail.contractTier')}</Label>
                            <Input
                              name="contractPricingTier"
                              value={businessTerms.contractPricingTier}
                              onChange={(e) => setBusinessTerms({ ...businessTerms, contractPricingTier: e.target.value })}
                              placeholder="e.g., GOLD"
                            />
                          </Field>
                        </div>

                        <div className="flex items-end gap-2">
                          <CheckboxField className="flex-none">
                            <Checkbox
                              name="requiresPurchaseOrder"
                              checked={businessTerms.requiresPurchaseOrder}
                              onChange={(checked) => setBusinessTerms({ ...businessTerms, requiresPurchaseOrder: checked })}
                            />
                            <Label className="text-xs">{t('common.form.requiresPurchaseOrder')}</Label>
                          </CheckboxField>

                          <CheckboxField className="flex-none">
                            <Checkbox
                              name="taxExempt"
                              checked={businessTerms.taxExempt}
                              onChange={(checked) => setBusinessTerms({ ...businessTerms, taxExempt: checked })}
                            />
                            <Label className="text-xs">{t('common.form.taxExempt')}</Label>
                          </CheckboxField>

                          {businessTerms.taxExempt && (
                            <Field className="flex-1">
                              <Label className="text-xs">{t('customers.detail.taxCert')}</Label>
                              <Input
                                name="taxExemptCertificate"
                                value={businessTerms.taxExemptCertificate}
                                onChange={(e) => setBusinessTerms({ ...businessTerms, taxExemptCertificate: e.target.value })}
                                placeholder="Certificate #"
                              />
                            </Field>
                          )}
                        </div>

                        <Field>
                          <Label className="text-xs">{t('common.form.notes')}</Label>
                          <Textarea
                            name="customerNotes"
                            value={businessTerms.notes}
                            onChange={(e) => setBusinessTerms({ ...businessTerms, notes: e.target.value })}
                            rows={2}
                            placeholder="Any special notes..."
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-200 dark:border-zinc-800" />
            </>
          )}

          {/* Work Order Fields */}
          <Fieldset disabled={readOnly}>
            <FieldGroup className="space-y-3">
              {isEdit && (
                <ServiceLocationPicker
                  value={selectedLocation}
                  onChange={handleLocationChange}
                  label={getName('service_location')}
                  required
                  autoFocus
                />
              )}

              {/* Type | Division | Priority — single dense row */}
              <div className="grid grid-cols-12 gap-3">
                {activeTypes.length > 0 && (
                  <Field className="col-span-3">
                    <Label className="text-xs">{t('workOrders.form.type')}</Label>
                    <Select
                      name="workOrderTypeId"
                      value={formData.workOrderTypeId}
                      onChange={(e) => handleChange('workOrderTypeId', e.target.value)}
                    >
                      <option value="">{t('workOrders.form.typePlaceholder')}</option>
                      {activeTypes.map((tx) => (
                        <option key={tx.id} value={tx.id}>{tx.name}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                {activeDivisions.length > 0 && (
                  <Field className="col-span-3">
                    <Label className="text-xs">{t('workOrders.form.division')}</Label>
                    <Select
                      name="divisionId"
                      value={formData.divisionId}
                      onChange={(e) => handleChange('divisionId', e.target.value)}
                    >
                      <option value="">{t('workOrders.form.divisionPlaceholder')}</option>
                      {activeDivisions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field className={
                  activeTypes.length > 0 && activeDivisions.length > 0
                    ? 'col-span-6'
                    : activeTypes.length > 0 || activeDivisions.length > 0
                      ? 'col-span-9'
                      : 'col-span-12'
                }>
                  <Label className="text-xs">{t('workOrders.form.priority')}</Label>
                  <div data-slot="control" className="flex h-9 gap-1">
                    {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleChange('priority', p)}
                        className={[
                          'flex flex-1 items-center justify-center rounded-lg px-2 text-xs font-medium ring-1 ring-inset transition-colors',
                          readOnly ? 'cursor-not-allowed opacity-50' : '',
                          formData.priority === p
                            ? p === 'LOW'    ? 'bg-zinc-100 text-zinc-800 ring-zinc-400 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-500'
                            : p === 'NORMAL' ? 'bg-sky-100 text-sky-800 ring-sky-400 dark:bg-sky-900 dark:text-sky-100 dark:ring-sky-600'
                            : p === 'HIGH'   ? 'bg-amber-100 text-amber-800 ring-amber-400 dark:bg-amber-900 dark:text-amber-100 dark:ring-amber-600'
                                             : 'bg-rose-100 text-rose-800 ring-rose-400 dark:bg-rose-900 dark:text-rose-100 dark:ring-rose-600'
                            : 'bg-white text-zinc-500 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800',
                        ].join(' ')}
                      >
                        {t(`workOrders.priority.${p.toLowerCase()}`)}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label className="text-xs">{t('workOrders.form.scheduledDate')}</Label>
                  <Input
                    type="date"
                    name="scheduledDate"
                    value={formData.scheduledDate}
                    onChange={(e) => handleChange('scheduledDate', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label className="text-xs">{t('workOrders.form.customerOrderNumber')}</Label>
                  <Input
                    name="customerOrderNumber"
                    value={formData.customerOrderNumber || ''}
                    onChange={(e) => handleChange('customerOrderNumber', e.target.value)}
                    placeholder={t('workOrders.form.customerOrderNumberPlaceholder')}
                    maxLength={100}
                  />
                </Field>
              </div>

              <Field>
                <Label className="text-xs">{t('common.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={2}
                />
              </Field>

              <Field>
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs">{t('workOrders.form.internalNotes')}</Label>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('workOrders.form.internalNotesHint')}</span>
                </div>
                <Textarea
                  name="internalNotes"
                  value={formData.internalNotes || ''}
                  onChange={(e) => handleChange('internalNotes', e.target.value)}
                  rows={2}
                />
              </Field>
            </FieldGroup>
          </Fieldset>

          {/* Work Items - edit mode only */}
          {isEdit && (
            <WorkItemsSection
              workOrderId={workOrder!.id}
              items={workOrder!.workItems ?? []}
              statuses={itemStatuses ?? []}
              readOnly={readOnly}
            />
          )}
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {readOnly ? t('common.close') : t('common.cancel')}
        </Button>
        {!readOnly && (
          <Button
            type="submit"
            form="work-order-form"
            disabled={createMutation.isPending || updateMutation.isPending || isCreatingCustomer}
          >
            {createMutation.isPending || updateMutation.isPending || isCreatingCustomer
              ? t('common.saving')
              : t(isEdit ? 'common.update' : 'common.create')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

interface WorkItemsSectionProps {
  workOrderId: string;
  items: WorkItemResponse[];
  statuses: WorkItemStatus[];
  readOnly: boolean;
}

function WorkItemsSection({ workOrderId, items, statuses, readOnly }: WorkItemsSectionProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const updateStatusMutation = useMutation({
    mutationFn: ({ workItemId, statusId }: { workItemId: string; statusId: string }) =>
      workOrderApi.updateWorkItemStatus(workOrderId, workItemId, { statusId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(msg || t('workOrders.workItems.statusUpdateError'));
    },
  });

  const activeStatuses = Array.isArray(statuses) ? statuses.filter((s) => s.isActive) : [];

  // Empty state: collapse to a thin one-liner so it doesn't dominate the dialog
  if (items.length === 0) {
    return (
      <div className="mt-1 flex items-center justify-between rounded-md border border-dashed border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span className="font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          {t('workOrders.workItems.title')}
        </span>
        <span>{t('workOrders.workItems.empty', { entity: getName('work_order') })}</span>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <Subheading className="mb-1.5 text-sm font-semibold">{t('workOrders.workItems.title')}</Subheading>
      {readOnly && (
        <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {t('workOrders.workItems.frozenHelper', { entity: getName('work_order') })}
        </p>
      )}
      <div className="overflow-hidden rounded-md ring-1 ring-zinc-200 dark:ring-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/40 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 text-left">{t('common.form.description')}</th>
                <th className="px-2 py-1.5 text-right">{t('workOrders.workItems.qtyHeader')}</th>
                <th className="px-2 py-1.5 text-right">{t('workOrders.workItems.unitHeader')}</th>
                <th className="px-2 py-1.5 text-right">{t('workOrders.workItems.totalHeader')}</th>
                <th className="px-2 py-1.5 text-left">{t('workOrders.table.statusHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">{item.description}</td>
                  <td className="px-2 py-1.5 text-right">{item.quantity}</td>
                  <td className="px-2 py-1.5 text-right">${item.unitPrice.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right">${item.totalPrice.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    {activeStatuses.length > 0 && !readOnly ? (
                      <Select
                        name={`item-status-${item.id}`}
                        value={item.statusId ?? ''}
                        disabled={updateStatusMutation.isPending}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next && next !== item.statusId) {
                            updateStatusMutation.mutate({ workItemId: item.id, statusId: next });
                          }
                        }}
                      >
                        <option value="" disabled>{t('common.form.select')}</option>
                        {activeStatuses.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge color={PROGRESS_COLORS[item.statusCategory]}>
                        {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[item.statusCategory]}`)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}
