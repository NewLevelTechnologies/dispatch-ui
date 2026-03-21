import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customerApi, type Customer, type CreateCustomerRequest, type UpdateCustomerRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Description, Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
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
  const isEdit = !!customer?.id;

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

    if (customer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditFormData({
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
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
      alert(errorMessage || t('common.form.errorCreate', { entity: t('entities.customer') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCustomerRequest) => customerApi.update(customer!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('entities.customer') }));
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
          locationName: createFormData.locationName || null,
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

    const request: UpdateCustomerRequest = {
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

    updateMutation.mutate(request);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="4xl">
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.add'),
          entity: t('entities.customer')
        })}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'common.form.descriptionEdit' : 'common.form.descriptionCreate', {
          entity: t('entities.customer')
        })}
      </DialogDescription>
      <DialogBody>
        {!isEdit ? (
          <form onSubmit={handleCreateSubmit} id="customer-form">
            <Fieldset>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>{t('common.form.name')} *</Label>
                    <Input
                      name="name"
                      value={createFormData.name}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.email')} *</Label>
                    <Input
                      type="email"
                      name="email"
                      value={createFormData.email}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('common.form.phone')}</Label>
                  <Input
                    type="tel"
                    name="phone"
                    value={createFormData.phone}
                    onChange={(e) => setCreateFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>

            <Fieldset className="mt-6">
              <Subheading>{t('customers.form.serviceLocationSection')}</Subheading>
              <FieldGroup>
                <Field>
                  <Label>{t('common.form.locationName')}</Label>
                  <Description>{t('customers.form.locationNameHelp')}</Description>
                  <Input
                    name="locationName"
                    value={createFormData.locationName}
                    onChange={(e) => setCreateFormData((prev) => ({ ...prev, locationName: e.target.value }))}
                    placeholder="e.g., Downtown Location, Main Office"
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.streetAddress')} *</Label>
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

                <Field>
                  <Label>{t('common.form.addressLine2')}</Label>
                  <Input
                    name="serviceStreetAddressLine2"
                    value={createFormData.serviceAddress.streetAddressLine2}
                    onChange={(e) =>
                      setCreateFormData((prev) => ({
                        ...prev,
                        serviceAddress: { ...prev.serviceAddress, streetAddressLine2: e.target.value },
                      }))
                    }
                    placeholder="Apt, Suite, Unit, etc."
                  />
                </Field>

                <div className="grid grid-cols-6 gap-4">
                  <Field className="col-span-3">
                    <Label>{t('common.form.city')} *</Label>
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

                  <Field className="col-span-1">
                    <Label>{t('common.form.state')} *</Label>
                    <Input
                      name="serviceState"
                      value={createFormData.serviceAddress.state}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          serviceAddress: { ...prev.serviceAddress, state: e.target.value.toUpperCase() },
                        }))
                      }
                      placeholder={t('common.form.stateHelper')}
                      maxLength={2}
                      required
                    />
                  </Field>

                  <Field className="col-span-2">
                    <Label>{t('common.form.zipCode')} *</Label>
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field>
                    <Label>{t('common.form.siteContactName')}</Label>
                    <Input
                      name="siteContactName"
                      value={createFormData.siteContactName}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, siteContactName: e.target.value }))}
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.siteContactPhone')}</Label>
                    <Input
                      type="tel"
                      name="siteContactPhone"
                      value={createFormData.siteContactPhone}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, siteContactPhone: e.target.value }))}
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.siteContactEmail')}</Label>
                    <Input
                      type="email"
                      name="siteContactEmail"
                      value={createFormData.siteContactEmail}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, siteContactEmail: e.target.value }))}
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('common.form.accessInstructions')}</Label>
                  <Textarea
                    name="accessInstructions"
                    value={createFormData.accessInstructions}
                    onChange={(e) => setCreateFormData((prev) => ({ ...prev, accessInstructions: e.target.value }))}
                    placeholder="e.g., Use back entrance, gate code 1234"
                    rows={2}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>

            <div className="mt-6">
              <CheckboxField>
                <Checkbox
                  name="billingAddressSameAsService"
                  checked={createFormData.billingAddressSameAsService}
                  onChange={(checked) =>
                    setCreateFormData((prev) => ({ ...prev, billingAddressSameAsService: checked }))
                  }
                />
                <Label>{t('common.form.billingAddressSameAsService')}</Label>
                <Description>{t('customers.form.billingAddressHelp')}</Description>
              </CheckboxField>
            </div>

            {!createFormData.billingAddressSameAsService && (
              <Fieldset className="mt-6">
                <Subheading>{t('customers.form.billingAddressSection')}</Subheading>
                <FieldGroup>
                  <Field>
                    <Label>{t('common.form.streetAddress')} *</Label>
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

                  <Field>
                    <Label>{t('common.form.addressLine2')}</Label>
                    <Input
                      name="billingStreetAddressLine2"
                      value={createFormData.billingAddress.streetAddressLine2}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({
                          ...prev,
                          billingAddress: { ...prev.billingAddress, streetAddressLine2: e.target.value },
                        }))
                      }
                      placeholder="Apt, Suite, Unit, etc."
                    />
                  </Field>

                  <div className="grid grid-cols-6 gap-4">
                    <Field className="col-span-3">
                      <Label>{t('common.form.city')} *</Label>
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

                    <Field className="col-span-1">
                      <Label>{t('common.form.state')} *</Label>
                      <Input
                        name="billingState"
                        value={createFormData.billingAddress.state}
                        onChange={(e) =>
                          setCreateFormData((prev) => ({
                            ...prev,
                            billingAddress: { ...prev.billingAddress, state: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder={t('common.form.stateHelper')}
                        maxLength={2}
                        required
                      />
                    </Field>

                    <Field className="col-span-2">
                      <Label>{t('common.form.zipCode')} *</Label>
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
                </FieldGroup>
              </Fieldset>
            )}

            <Fieldset className="mt-6">
              <Subheading>{t('customers.form.businessDetails')}</Subheading>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>{t('common.form.paymentTermsDays')}</Label>
                    <Description>{t('customers.form.paymentTermsHelp')}</Description>
                    <Input
                      type="number"
                      name="paymentTermsDays"
                      value={createFormData.paymentTermsDays}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({ ...prev, paymentTermsDays: parseInt(e.target.value) || 0 }))
                      }
                      min="0"
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.contractPricingTier')}</Label>
                    <Input
                      name="contractPricingTier"
                      value={createFormData.contractPricingTier}
                      onChange={(e) => setCreateFormData((prev) => ({ ...prev, contractPricingTier: e.target.value }))}
                      placeholder="e.g., GOLD, SILVER"
                    />
                  </Field>
                </div>

                <div className="flex gap-6">
                  <CheckboxField>
                    <Checkbox
                      name="requiresPurchaseOrder"
                      checked={createFormData.requiresPurchaseOrder}
                      onChange={(checked) => setCreateFormData((prev) => ({ ...prev, requiresPurchaseOrder: checked }))}
                    />
                    <Label>{t('common.form.requiresPurchaseOrder')}</Label>
                  </CheckboxField>

                  <CheckboxField>
                    <Checkbox
                      name="taxExempt"
                      checked={createFormData.taxExempt}
                      onChange={(checked) => setCreateFormData((prev) => ({ ...prev, taxExempt: checked }))}
                    />
                    <Label>{t('common.form.taxExempt')}</Label>
                  </CheckboxField>
                </div>

                {createFormData.taxExempt && (
                  <Field>
                    <Label>{t('common.form.taxExemptCertificate')}</Label>
                    <Input
                      name="taxExemptCertificate"
                      value={createFormData.taxExemptCertificate}
                      onChange={(e) =>
                        setCreateFormData((prev) => ({ ...prev, taxExemptCertificate: e.target.value }))
                      }
                    />
                  </Field>
                )}

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    value={createFormData.notes}
                    onChange={(e) => setCreateFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          </form>
        ) : (
          <form onSubmit={handleEditSubmit} id="customer-form">
            <Fieldset>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>{t('common.form.name')} *</Label>
                    <Input
                      name="name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.email')} *</Label>
                    <Input
                      type="email"
                      name="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('common.form.phone')}</Label>
                  <Input
                    type="tel"
                    name="phone"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>

            <Fieldset className="mt-6">
              <Subheading>{t('customers.form.businessDetails')}</Subheading>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>{t('common.form.paymentTermsDays')}</Label>
                    <Description>{t('customers.form.paymentTermsHelp')}</Description>
                    <Input
                      type="number"
                      name="paymentTermsDays"
                      value={editFormData.paymentTermsDays}
                      onChange={(e) =>
                        setEditFormData((prev) => ({ ...prev, paymentTermsDays: parseInt(e.target.value) || 0 }))
                      }
                      min="0"
                    />
                  </Field>

                  <Field>
                    <Label>{t('common.form.contractPricingTier')}</Label>
                    <Input
                      name="contractPricingTier"
                      value={editFormData.contractPricingTier}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, contractPricingTier: e.target.value }))}
                      placeholder="e.g., GOLD, SILVER"
                    />
                  </Field>
                </div>

                <div className="flex gap-6">
                  <CheckboxField>
                    <Checkbox
                      name="requiresPurchaseOrder"
                      checked={editFormData.requiresPurchaseOrder}
                      onChange={(checked) => setEditFormData((prev) => ({ ...prev, requiresPurchaseOrder: checked }))}
                    />
                    <Label>{t('common.form.requiresPurchaseOrder')}</Label>
                  </CheckboxField>

                  <CheckboxField>
                    <Checkbox
                      name="taxExempt"
                      checked={editFormData.taxExempt}
                      onChange={(checked) => setEditFormData((prev) => ({ ...prev, taxExempt: checked }))}
                    />
                    <Label>{t('common.form.taxExempt')}</Label>
                  </CheckboxField>
                </div>

                {editFormData.taxExempt && (
                  <Field>
                    <Label>{t('common.form.taxExemptCertificate')}</Label>
                    <Input
                      name="taxExemptCertificate"
                      value={editFormData.taxExemptCertificate}
                      onChange={(e) => setEditFormData((prev) => ({ ...prev, taxExemptCertificate: e.target.value }))}
                    />
                  </Field>
                )}

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.status')}</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        value="ACTIVE"
                        checked={editFormData.status === 'ACTIVE'}
                        onChange={() => setEditFormData((prev) => ({ ...prev, status: 'ACTIVE' }))}
                      />
                      <span>{t('common.active')}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        value="INACTIVE"
                        checked={editFormData.status === 'INACTIVE'}
                        onChange={() => setEditFormData((prev) => ({ ...prev, status: 'INACTIVE' }))}
                      />
                      <span>{t('common.inactive')}</span>
                    </label>
                  </div>
                </Field>
              </FieldGroup>
            </Fieldset>
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
