import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { customerApi, type Customer, type CreateCustomerRequest, type UpdateCustomerRequest } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Textarea } from './catalyst/textarea';
import { Radio, RadioField, RadioGroup } from './catalyst/radio';
import { US_STATES } from '../constants/states';
import { Subheading } from './catalyst/heading';

interface CustomerFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

interface CreateFormData {
  name: string;
  email: string;
  phone: string;
  serviceAddress: {
    streetAddress: string;
    streetAddressLine2: string;
    city: string;
    state: string;
    zipCode: string;
  };
  billingAddress: {
    streetAddress: string;
    streetAddressLine2: string;
    city: string;
    state: string;
    zipCode: string;
  };
  billingAddressSameAsService: boolean;
  locationName: string;
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
  accessInstructions: string;
  notes: string;
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier: string;
  taxExempt: boolean;
  taxExemptCertificate: string;
}

interface EditFormData {
  name: string;
  email: string;
  phone: string;
  billingAddress: {
    streetAddress: string;
    streetAddressLine2: string;
    city: string;
    state: string;
    zipCode: string;
  };
  paymentTermsDays: number;
  requiresPurchaseOrder: boolean;
  contractPricingTier: string;
  taxExempt: boolean;
  taxExemptCertificate: string;
  notes: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export default function CustomerFormDialog({ isOpen, onClose, customer }: CustomerFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const isEdit = !!customer?.id;

  // Collapsible sections state
  const [showSiteContact, setShowSiteContact] = useState(false);
  const [showAccessInstructions, setShowAccessInstructions] = useState(false);
  const [showBusinessTerms, setShowBusinessTerms] = useState(false);

  const [createFormData, setCreateFormData] = useState<CreateFormData>({
    name: '',
    email: '',
    phone: '',
    serviceAddress: {
      streetAddress: '',
      streetAddressLine2: '',
      city: '',
      state: '',
      zipCode: '',
    },
    billingAddress: {
      streetAddress: '',
      streetAddressLine2: '',
      city: '',
      state: '',
      zipCode: '',
    },
    billingAddressSameAsService: true,
    locationName: '',
    siteContactName: '',
    siteContactPhone: '',
    siteContactEmail: '',
    accessInstructions: '',
    notes: '',
    paymentTermsDays: 0,
    requiresPurchaseOrder: false,
    contractPricingTier: '',
    taxExempt: false,
    taxExemptCertificate: '',
  });

  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '',
    email: '',
    phone: '',
    billingAddress: {
      streetAddress: '',
      streetAddressLine2: '',
      city: '',
      state: '',
      zipCode: '',
    },
    paymentTermsDays: 0,
    requiresPurchaseOrder: false,
    contractPricingTier: '',
    taxExempt: false,
    taxExemptCertificate: '',
    notes: '',
    status: 'ACTIVE',
  });

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    // Reset collapsible sections
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSiteContact(false);
     
    setShowAccessInstructions(false);
     
    setShowBusinessTerms(false);

    if (customer) {
       
      setEditFormData({
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        billingAddress: {
          streetAddress: customer.billingAddress.streetAddress,
          streetAddressLine2: customer.billingAddress.streetAddressLine2 || '',
          city: customer.billingAddress.city,
          state: customer.billingAddress.state,
          zipCode: customer.billingAddress.zipCode,
        },
        paymentTermsDays: customer.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: customer.contractPricingTier || '',
        taxExempt: customer.taxExempt,
        taxExemptCertificate: customer.taxExemptCertificate || '',
        notes: customer.notes || '',
        status: customer.status,
      });
    } else {
      setCreateFormData({
        name: '',
        email: '',
        phone: '',
        serviceAddress: {
          streetAddress: '',
          streetAddressLine2: '',
          city: '',
          state: '',
          zipCode: '',
        },
        billingAddress: {
          streetAddress: '',
          streetAddressLine2: '',
          city: '',
          state: '',
          zipCode: '',
        },
        billingAddressSameAsService: true,
        locationName: '',
        siteContactName: '',
        siteContactPhone: '',
        siteContactEmail: '',
        accessInstructions: '',
        notes: '',
        paymentTermsDays: 0,
        requiresPurchaseOrder: false,
        contractPricingTier: '',
        taxExempt: false,
        taxExemptCertificate: '',
      });
    }
  }, [customer, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerRequest) => customerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: getName('customer') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ customerRequest, billingAddressRequest }: {
      customerRequest: UpdateCustomerRequest;
      billingAddressRequest?: { billingAddress: typeof editFormData.billingAddress }
    }) => {
      await customerApi.update(customer!.id, customerRequest);
      if (billingAddressRequest) {
        await customerApi.updateBillingAddress(customer!.id, billingAddressRequest);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: getName('customer') }));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const request: CreateCustomerRequest = {
      name: createFormData.name,
      email: createFormData.email,
      phone: createFormData.phone || null,
      billingAddress: createFormData.billingAddressSameAsService
        ? createFormData.serviceAddress
        : createFormData.billingAddress,
      serviceLocations: [
        {
          // Location name is the same as customer name (homeowner) or business name
          locationName: createFormData.locationName || createFormData.name,
          address: createFormData.serviceAddress,
          siteContactName: createFormData.siteContactName || null,
          siteContactPhone: createFormData.siteContactPhone || null,
          siteContactEmail: createFormData.siteContactEmail || null,
          accessInstructions: createFormData.accessInstructions || null,
          notes: createFormData.notes || null,
        },
      ],
      billingAddressSameAsService: createFormData.billingAddressSameAsService,
      paymentTermsDays: createFormData.paymentTermsDays,
      requiresPurchaseOrder: createFormData.requiresPurchaseOrder,
      contractPricingTier: createFormData.contractPricingTier || null,
      taxExempt: createFormData.taxExempt,
      taxExemptCertificate: createFormData.taxExemptCertificate || null,
      notes: createFormData.notes || null,
    };

    createMutation.mutate(request);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const customerRequest: UpdateCustomerRequest = {
      name: editFormData.name,
      email: editFormData.email,
      phone: editFormData.phone || null,
      paymentTermsDays: editFormData.paymentTermsDays,
      requiresPurchaseOrder: editFormData.requiresPurchaseOrder,
      contractPricingTier: editFormData.contractPricingTier || null,
      taxExempt: editFormData.taxExempt,
      taxExemptCertificate: editFormData.taxExemptCertificate || null,
      notes: editFormData.notes || null,
      status: editFormData.status,
    };

    // Check if billing address changed
    const billingAddressChanged = customer && (
      editFormData.billingAddress.streetAddress !== customer.billingAddress.streetAddress ||
      (editFormData.billingAddress.streetAddressLine2 || '') !== (customer.billingAddress.streetAddressLine2 || '') ||
      editFormData.billingAddress.city !== customer.billingAddress.city ||
      editFormData.billingAddress.state !== customer.billingAddress.state ||
      editFormData.billingAddress.zipCode !== customer.billingAddress.zipCode
    );

    updateMutation.mutate({
      customerRequest,
      billingAddressRequest: billingAddressChanged ? { billingAddress: editFormData.billingAddress } : undefined
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="4xl">
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.add'),
          entity: getName('customer')
        })}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'common.form.descriptionEdit' : 'common.form.descriptionCreate', {
          entity: getName('customer')
        })}
      </DialogDescription>
      <DialogBody>
        {!isEdit ? (
          <form onSubmit={handleCreateSubmit} id="customer-form" className="space-y-4">
            {/* PRIMARY SECTION: Where do you need service? */}
            <div>
              <Subheading className="mb-3 text-base font-semibold">{t('customers.form.serviceLocationPrompt')}</Subheading>
              <div className="space-y-2">
                {/* Row 1: Name, Phone, Email */}
                <div className="grid grid-cols-12 gap-2">
                  <Field className="col-span-5">
                    <Label className="text-xs">{t('common.form.name')} *</Label>
                    <Input
                      name="name"
                      value={createFormData.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setCreateFormData((prev) => ({
                          ...prev,
                          name,
                          locationName: prev.locationName === '' || prev.locationName === prev.name ? name : prev.locationName
                        }));
                      }}
                      required
                    />
                  </Field>
                  <Field className="col-span-4">
                    <Label className="text-xs">{t('common.form.phone')}</Label>
                    <PatternFormat
                      format="(###) ###-####"
                      mask="_"
                      customInput={Input}
                      name="phone"
                      value={createFormData.phone}
                      onValueChange={(values) => setCreateFormData((prev) => ({ ...prev, phone: values.value }))}
                    />
                  </Field>
                  <Field className="col-span-3">
                    <Label className="text-xs">{t('common.form.email')} *</Label>
                    <Input
                      type="email"
                      name="email"
                      value={createFormData.email}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </Field>
                </div>

                {/* Row 2: Street + Apt */}
                <div className="grid grid-cols-4 gap-2">
                  <Field className="col-span-3">
                    <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
                    <Input
                      name="serviceStreetAddress"
                      value={createFormData.serviceAddress.streetAddress}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, streetAddress: e.target.value },
                        }))
                      }
                      required
                    />
                  </Field>
                  <Field className="col-span-1">
                    <Label className="text-xs">{t('common.form.addressLine2')}</Label>
                    <Input
                      name="serviceStreetAddressLine2"
                      value={createFormData.serviceAddress.streetAddressLine2}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, streetAddressLine2: e.target.value },
                        }))
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
                      value={createFormData.serviceAddress.city}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, city: e.target.value },
                        }))
                      }
                      required
                    />
                  </Field>
                  <Field className="col-span-2">
                    <Label className="text-xs">{t('common.form.state')} *</Label>
                    <Select
                      name="serviceState"
                      value={createFormData.serviceAddress.state}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, state: e.target.value },
                        }))
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
                      value={createFormData.serviceAddress.zipCode}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, zipCode: e.target.value },
                        }))
                      }
                      required
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* BILLING CHECKBOX */}
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <CheckboxField>
                <Checkbox
                  name="billingAddressSameAsService"
                  checked={createFormData.billingAddressSameAsService}
                  onChange={(checked) =>
                    setCreateFormData((prev) => ({ ...prev, billingAddressSameAsService: checked }))
                  }
                />
                <Label className="font-medium">{t('common.form.billingAddressSameAsService')}</Label>
              </CheckboxField>
            </div>

            {/* CONDITIONAL: Billing Address (if different) */}
            {!createFormData.billingAddressSameAsService && (
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Subheading className="mb-3 text-sm font-semibold">{t('customers.form.billingInvoiceRecipient')}</Subheading>
                <div className="space-y-2">
                  {/* Billing Name */}
                  <Field>
                    <Label className="text-xs">{t('customers.form.companyName')}</Label>
                    <Input
                      name="billingName"
                      value={createFormData.name}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, name: e.target.value }))}
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
                        value={createFormData.billingAddress.streetAddress}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, streetAddress: e.target.value },
                          }))
                        }
                        required
                      />
                    </Field>
                    <Field className="col-span-1">
                      <Label className="text-xs">{t('common.form.addressLine2')}</Label>
                      <Input
                        name="billingStreetAddressLine2"
                        value={createFormData.billingAddress.streetAddressLine2}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, streetAddressLine2: e.target.value },
                          }))
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
                        value={createFormData.billingAddress.city}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, city: e.target.value },
                          }))
                        }
                        required
                      />
                    </Field>
                    <Field className="col-span-2">
                      <Label className="text-xs">{t('common.form.state')} *</Label>
                      <Select
                        name="billingState"
                        value={createFormData.billingAddress.state}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, state: e.target.value },
                          }))
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
                        value={createFormData.billingAddress.zipCode}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, zipCode: e.target.value },
                          }))
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
                        value={createFormData.siteContactName}
                        onChange={(e) => setCreateFormData((prev) => ({ ...prev, siteContactName: e.target.value }))}
                      />
                    </Field>
                    <Field>
                      <Label className="text-xs">{t('common.form.phone')}</Label>
                      <PatternFormat
                        format="(###) ###-####"
                        mask="_"
                        customInput={Input}
                        name="siteContactPhone"
                        value={createFormData.siteContactPhone}
                        onValueChange={(values) => setCreateFormData((prev) => ({ ...prev, siteContactPhone: values.value }))}
                      />
                    </Field>
                    <Field>
                      <Label className="text-xs">{t('common.form.email')}</Label>
                      <Input
                        type="email"
                        name="siteContactEmail"
                        value={createFormData.siteContactEmail}
                        onChange={(e) => setCreateFormData((prev) => ({ ...prev, siteContactEmail: e.target.value }))}
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
                      value={createFormData.accessInstructions}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, accessInstructions: e.target.value }))}
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
                    {/* Payment Terms + Contract Tier */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field>
                        <Label className="text-xs">{t('customers.detail.paymentTerms')}</Label>
                        <Input
                          type="number"
                          name="paymentTermsDays"
                          value={createFormData.paymentTermsDays}
                          onChange={(e) =>
                            setCreateFormData((prev) => ({ ...prev, paymentTermsDays: parseInt(e.target.value) || 0 }))
                          }
                          min="0"
                          placeholder="0 = Due on receipt"
                        />
                      </Field>
                      <Field>
                        <Label className="text-xs">{t('customers.detail.contractTier')}</Label>
                        <Input
                          name="contractPricingTier"
                          value={createFormData.contractPricingTier}
                          onChange={(e) => setCreateFormData((prev) => ({ ...prev, contractPricingTier: e.target.value }))}
                          placeholder="e.g., GOLD"
                        />
                      </Field>
                    </div>

                    {/* Checkboxes + Tax Cert */}
                    <div className="flex items-end gap-2">
                      <CheckboxField className="flex-none">
                        <Checkbox
                          name="requiresPurchaseOrder"
                          checked={createFormData.requiresPurchaseOrder}
                          onChange={(checked) => setCreateFormData((prev) => ({ ...prev, requiresPurchaseOrder: checked }))}
                        />
                        <Label className="text-xs">{t('common.form.requiresPurchaseOrder')}</Label>
                      </CheckboxField>

                      <CheckboxField className="flex-none">
                        <Checkbox
                          name="taxExempt"
                          checked={createFormData.taxExempt}
                          onChange={(checked) => setCreateFormData((prev) => ({ ...prev, taxExempt: checked }))}
                        />
                        <Label className="text-xs">{t('common.form.taxExempt')}</Label>
                      </CheckboxField>

                      {createFormData.taxExempt && (
                        <Field className="flex-1">
                          <Label className="text-xs">{t('customers.detail.taxCert')}</Label>
                          <Input
                            name="taxExemptCertificate"
                            value={createFormData.taxExemptCertificate}
                            onChange={(e) =>
                              setCreateFormData((prev) => ({ ...prev, taxExemptCertificate: e.target.value }))
                            }
                            placeholder="Certificate #"
                          />
                        </Field>
                      )}
                    </div>

                    {/* Notes */}
                    <Field>
                      <Label className="text-xs">{t('common.form.notes')}</Label>
                      <Textarea
                        name="notes"
                        value={createFormData.notes}
                        onChange={(e) => setCreateFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        placeholder="Any special notes..."
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleEditSubmit} id="customer-form" className="space-y-4">
            {/* PRIMARY SECTION */}
            <div className="grid grid-cols-12 gap-2">
              <Field className="col-span-5">
                <Label className="text-xs">{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Field>
              <Field className="col-span-4">
                <Label className="text-xs">{t('common.form.phone')}</Label>
                <PatternFormat
                  format="(###) ###-####"
                  mask="_"
                  customInput={Input}
                  name="phone"
                  value={editFormData.phone}
                  onValueChange={(values) => setEditFormData((prev) => ({ ...prev, phone: values.value }))}
                />
              </Field>
              <Field className="col-span-3">
                <Label className="text-xs">{t('common.form.email')} *</Label>
                <Input
                  type="email"
                  name="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </Field>
            </div>

            {/* BILLING ADDRESS - Always Visible */}
            <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Subheading className="text-sm font-semibold">{t('common.form.billingAddress')}</Subheading>
              {/* Street + Apt */}
              <div className="grid grid-cols-4 gap-2">
                <Field className="col-span-3">
                  <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
                  <Input
                    name="billingStreetAddress"
                    value={editFormData.billingAddress.streetAddress}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, streetAddress: e.target.value },
                      }))
                    }
                    required
                  />
                </Field>
                <Field className="col-span-1">
                  <Label className="text-xs">{t('common.form.addressLine2')}</Label>
                  <Input
                    name="billingStreetAddressLine2"
                    value={editFormData.billingAddress.streetAddressLine2}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, streetAddressLine2: e.target.value },
                      }))
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
                    value={editFormData.billingAddress.city}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, city: e.target.value },
                      }))
                    }
                    required
                  />
                </Field>
                <Field className="col-span-2">
                  <Label className="text-xs">{t('common.form.state')} *</Label>
                  <Select
                    name="billingState"
                    value={editFormData.billingAddress.state}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, state: e.target.value },
                      }))
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
                    value={editFormData.billingAddress.zipCode}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, zipCode: e.target.value },
                      }))
                    }
                    required
                  />
                </Field>
              </div>
            </div>

            {/* OPTIONAL SECTIONS - Collapsible */}
            <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">

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
                  {t('customers.detail.businessTerms')}
                </button>
                {showBusinessTerms && (
                  <div className="mt-2 space-y-2 pl-6">
                    {/* Payment Terms + Contract Tier */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field>
                        <Label className="text-xs">{t('customers.detail.paymentTerms')}</Label>
                        <Input
                          type="number"
                          name="paymentTermsDays"
                          value={editFormData.paymentTermsDays}
                          onChange={(e) =>
                            setEditFormData((prev) => ({ ...prev, paymentTermsDays: parseInt(e.target.value) || 0 }))
                          }
                          min="0"
                          placeholder="0 = Due on receipt"
                        />
                      </Field>
                      <Field>
                        <Label className="text-xs">{t('customers.detail.contractTier')}</Label>
                        <Input
                          name="contractPricingTier"
                          value={editFormData.contractPricingTier}
                          onChange={(e) => setEditFormData((prev) => ({ ...prev, contractPricingTier: e.target.value }))}
                          placeholder="e.g., GOLD"
                        />
                      </Field>
                    </div>

                    {/* Checkboxes + Tax Cert */}
                    <div className="flex items-end gap-2">
                      <CheckboxField className="flex-none">
                        <Checkbox
                          name="requiresPurchaseOrder"
                          checked={editFormData.requiresPurchaseOrder}
                          onChange={(checked) => setEditFormData((prev) => ({ ...prev, requiresPurchaseOrder: checked }))}
                        />
                        <Label className="text-xs">{t('common.form.requiresPurchaseOrder')}</Label>
                      </CheckboxField>

                      <CheckboxField className="flex-none">
                        <Checkbox
                          name="taxExempt"
                          checked={editFormData.taxExempt}
                          onChange={(checked) => setEditFormData((prev) => ({ ...prev, taxExempt: checked }))}
                        />
                        <Label className="text-xs">{t('common.form.taxExempt')}</Label>
                      </CheckboxField>

                      {editFormData.taxExempt && (
                        <Field className="flex-1">
                          <Label className="text-xs">{t('customers.detail.taxCert')}</Label>
                          <Input
                            name="taxExemptCertificate"
                            value={editFormData.taxExemptCertificate}
                            onChange={(e) =>
                              setEditFormData((prev) => ({ ...prev, taxExemptCertificate: e.target.value }))
                            }
                            placeholder="Certificate #"
                          />
                        </Field>
                      )}
                    </div>

                    {/* Notes */}
                    <Field>
                      <Label className="text-xs">{t('common.form.notes')}</Label>
                      <Textarea
                        name="notes"
                        value={editFormData.notes}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        placeholder="Any special notes..."
                      />
                    </Field>

                    {/* Status */}
                    <Field>
                      <Label className="text-xs">{t('common.form.status')}</Label>
                      <RadioGroup
                        value={editFormData.status}
                        onChange={(value) => setEditFormData((prev) => ({ ...prev, status: value as 'ACTIVE' | 'INACTIVE' }))}
                        className="mt-1 flex gap-4"
                      >
                        <RadioField>
                          <Radio value="ACTIVE" />
                          <Label className="text-sm">{t('common.active')}</Label>
                        </RadioField>
                        <RadioField>
                          <Radio value="INACTIVE" />
                          <Label className="text-sm">{t('common.inactive')}</Label>
                        </RadioField>
                      </RadioGroup>
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </form>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="customer-form"
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
