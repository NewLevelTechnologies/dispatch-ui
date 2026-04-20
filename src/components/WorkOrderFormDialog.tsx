import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { workOrderApi, customerApi, dispatchRegionApi, type WorkOrder, type ServiceLocationSearchResult, type CreateCustomerRequest } from '../api';
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
import ServiceLocationPicker from './ServiceLocationPicker';
import { US_STATES } from '../constants/states';

interface AddressData {
  streetAddress: string;
  streetAddressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

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

  // Customer mode: existing or new
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Work order form data
  const [formData, setFormData] = useState<Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>>({
    customerId: '',
    serviceLocationId: '',
    status: 'PENDING',
    scheduledDate: '',
    description: '',
    notes: '',
  });

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

  // Fetch active dispatch regions
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
        status: workOrder.status,
        scheduledDate: workOrder.scheduledDate || '',
        description: workOrder.description || '',
        notes: workOrder.notes || '',
      });
      setSelectedLocation(null); // TODO: Load from workOrder if editing
    } else {
      // Create mode - reset everything
      setCustomerMode('existing');
      setIsCreatingCustomer(false);
      setFormData({
        customerId: '',
        serviceLocationId: '',
        status: 'PENDING',
        scheduledDate: '',
        description: '',
        notes: '',
      });
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
    mutationFn: (data: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>) => workOrderApi.create(data),
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
    mutationFn: (data: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>) =>
      workOrderApi.update(workOrder!.id!, {
        status: data.status,
        scheduledDate: data.scheduledDate || undefined,
        description: data.description,
        notes: data.notes,
      }),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEdit) {
      updateMutation.mutate(formData);
      return;
    }

    // Create mode
    if (customerMode === 'existing') {
      if (!formData.serviceLocationId) {
        alert(t('workOrders.form.selectServiceLocation', { entity: getName('service_location') }));
        return;
      }
      createMutation.mutate(formData);
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

        // Invalidate customers and service-locations queries so the new data shows in those pages
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['service-locations'] });

        // Now create work order with the new customer's first location
        const workOrderData: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'> = {
          customerId: createdCustomer.id,
          serviceLocationId: firstLocation.id,
          status: 'PENDING',
          scheduledDate: formData.scheduledDate || '',
          description: formData.description,
          notes: formData.notes,
        };

        createMutation.mutate(workOrderData);
      } catch (error) {
        setIsCreatingCustomer(false);
        const errorMessage = error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
          : undefined;
        alert(errorMessage || t('common.form.errorCreate', { entity: getName('customer') }));
      }
    }
  };

  const handleChange = (field: keyof WorkOrder, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="4xl">
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.create'),
          entity: getName('work_order')
        })}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'common.form.descriptionEdit' : 'common.form.descriptionCreate', {
          entity: getName('work_order')
        })}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="work-order-form" className="space-y-4">
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
          <Fieldset>
            <FieldGroup>
              {isEdit && (
                <>
                  <ServiceLocationPicker
                    value={selectedLocation}
                    onChange={handleLocationChange}
                    label={getName('service_location')}
                    required
                    autoFocus
                  />

                  <Field>
                    <Label>{t('common.form.status')}</Label>
                    <Select
                      name="status"
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                    >
                      <option value="PENDING">{t('workOrders.status.pending')}</option>
                      <option value="SCHEDULED">{t('workOrders.status.scheduled')}</option>
                      <option value="IN_PROGRESS">{t('workOrders.status.inProgress')}</option>
                      <option value="COMPLETED">{t('workOrders.status.completed')}</option>
                      <option value="CANCELLED">{t('workOrders.status.cancelled')}</option>
                    </Select>
                  </Field>
                </>
              )}

              <Field>
                <Label>{t('workOrders.form.scheduledDate')}</Label>
                <Input
                  type="date"
                  name="scheduledDate"
                  value={formData.scheduledDate}
                  onChange={(e) => handleChange('scheduledDate', e.target.value)}
                />
              </Field>

              <Field>
                <Label>{t('common.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                />
              </Field>

              <Field>
                <Label>{t('common.form.notes')}</Label>
                <Textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
                />
              </Field>
            </FieldGroup>
          </Fieldset>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="work-order-form"
          disabled={createMutation.isPending || updateMutation.isPending || isCreatingCustomer}
        >
          {createMutation.isPending || updateMutation.isPending || isCreatingCustomer
            ? t('common.saving')
            : t(isEdit ? 'common.update' : 'common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
