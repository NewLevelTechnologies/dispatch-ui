import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { workOrderApi, customerApi, dispatchRegionApi, type WorkOrder, type ServiceLocationSearchResult, type CreateCustomerRequest } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';
import { Radio, RadioField, RadioGroup } from './catalyst/radio';
import { Subheading } from './catalyst/heading';
import ServiceLocationPicker from './ServiceLocationPicker';
import AddressFields, { type AddressData } from './forms/AddressFields';
import ContactFields, { type ContactData } from './forms/ContactFields';

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
  const [newCustomer, setNewCustomer] = useState<ContactData>({
    name: '',
    phone: '',
    email: '',
  });

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
      setFormData({
        customerId: '',
        serviceLocationId: '',
        status: 'PENDING',
        scheduledDate: '',
        description: '',
        notes: '',
      });
      setSelectedLocation(null);
      setNewCustomer({ name: '', phone: '', email: '' });
      setServiceAddress({ streetAddress: '', streetAddressLine2: '', city: '', state: '', zipCode: '' });
      setBillingAddress({ streetAddress: '', streetAddressLine2: '', city: '', state: '', zipCode: '' });
      setBillingAddressSameAsService(true);
      setShowSiteContact(false);
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
      onClose();
    },
    onError: (error: unknown) => {
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
      try {
        const customerRequest: CreateCustomerRequest = {
          name: newCustomer.name,
          email: newCustomer.email,
          phone: newCustomer.phone || null,
          billingAddress: billingAddressSameAsService ? serviceAddress : billingAddress,
          serviceLocations: [
            {
              dispatchRegionId,
              locationName: newCustomer.name, // Default location name to customer name
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
              <Field>
                <Label>{getName('customer')}</Label>
                <RadioGroup
                  value={customerMode}
                  onChange={(value) => setCustomerMode(value as 'existing' | 'new')}
                  className="mt-2 flex gap-6"
                >
                  <RadioField>
                    <Radio value="existing" />
                    <Label className="text-sm">{t('workOrders.form.existingCustomer', { entity: getName('customer') })}</Label>
                  </RadioField>
                  <RadioField>
                    <Radio value="new" />
                    <Label className="text-sm">{t('workOrders.form.newCustomer', { entity: getName('customer') })}</Label>
                  </RadioField>
                </RadioGroup>
              </Field>

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
                  <Subheading className="text-sm font-semibold">{t('workOrders.form.newCustomerDetails', { entity: getName('customer') })}</Subheading>

                  {/* Contact Fields */}
                  <ContactFields
                    contact={newCustomer}
                    onChange={setNewCustomer}
                    namePrefix="customer-"
                  />

                  {/* Service Address */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">{t('common.form.serviceAddress')}</Label>
                    <AddressFields
                      address={serviceAddress}
                      onChange={setServiceAddress}
                      namePrefix="service-"
                    />
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

                  {/* Billing Address Checkbox */}
                  <CheckboxField>
                    <Checkbox
                      name="billingAddressSameAsService"
                      checked={billingAddressSameAsService}
                      onChange={(checked) => setBillingAddressSameAsService(checked)}
                    />
                    <Label className="text-xs">{t('common.form.billingAddressSameAsService')}</Label>
                  </CheckboxField>

                  {/* Conditional: Different Billing Address */}
                  {!billingAddressSameAsService && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">{t('common.form.billingAddress')}</Label>
                      <AddressFields
                        address={billingAddress}
                        onChange={setBillingAddress}
                        namePrefix="billing-"
                      />
                    </div>
                  )}

                  {/* Collapsible: Site Contact */}
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

                  {/* Access Instructions */}
                  <Field>
                    <Label className="text-xs">{t('common.form.accessInstructions')}</Label>
                    <Input
                      name="accessInstructions"
                      value={accessInstructions}
                      onChange={(e) => setAccessInstructions(e.target.value)}
                      placeholder={t('customers.form.accessInstructionsPlaceholder')}
                    />
                  </Field>

                  {/* Collapsible: Business Terms */}
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
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? t('common.saving')
            : t(isEdit ? 'common.update' : 'common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
