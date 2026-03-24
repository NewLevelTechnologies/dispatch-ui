import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customerApi } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface ServiceLocationFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
}

interface FormData {
  locationName: string;
  streetAddress: string;
  streetAddressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
  accessInstructions: string;
}

export default function ServiceLocationFormDialog({ isOpen, onClose, customerId }: ServiceLocationFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [formData, setFormData] = useState<FormData>({
    locationName: '',
    streetAddress: '',
    streetAddressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    siteContactName: '',
    siteContactPhone: '',
    siteContactEmail: '',
    accessInstructions: '',
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        locationName: '',
        streetAddress: '',
        streetAddressLine2: '',
        city: '',
        state: '',
        zipCode: '',
        siteContactName: '',
        siteContactPhone: '',
        siteContactEmail: '',
        accessInstructions: '',
      });
    }
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const request = {
        locationName: data.locationName || null,
        address: {
          streetAddress: data.streetAddress,
          streetAddressLine2: data.streetAddressLine2 || null,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
        },
        siteContactName: data.siteContactName || null,
        siteContactPhone: data.siteContactPhone || null,
        siteContactEmail: data.siteContactEmail || null,
        accessInstructions: data.accessInstructions || null,
        notes: null,
      };

      // Using the API endpoint from the guide: POST /customers/{customerId}/service-locations
      return customerApi.addServiceLocation(customerId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to add service location');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="3xl">
      <DialogTitle>{t('customers.detail.addServiceLocation')}</DialogTitle>
      <DialogDescription>
        {t('customers.detail.addServiceLocationDescription')}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="service-location-form" className="space-y-3">
          {/* Location Name */}
          <Field>
            <Label className="text-xs">{t('common.form.locationName')} *</Label>
            <Input
              name="locationName"
              value={formData.locationName}
              onChange={(e) => setFormData((prev) => ({ ...prev, locationName: e.target.value }))}
              placeholder="e.g., Downtown Restaurant, Main Office"
              required
            />
          </Field>

          {/* Street + Apt */}
          <div className="grid grid-cols-4 gap-2">
            <Field className="col-span-3">
              <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
              <Input
                name="streetAddress"
                value={formData.streetAddress}
                onChange={(e) => setFormData((prev) => ({ ...prev, streetAddress: e.target.value }))}
                required
              />
            </Field>
            <Field className="col-span-1">
              <Label className="text-xs">{t('common.form.addressLine2')}</Label>
              <Input
                name="streetAddressLine2"
                value={formData.streetAddressLine2}
                onChange={(e) => setFormData((prev) => ({ ...prev, streetAddressLine2: e.target.value }))}
                placeholder="Apt"
              />
            </Field>
          </div>

          {/* City/State/Zip */}
          <div className="grid grid-cols-12 gap-2">
            <Field className="col-span-6">
              <Label className="text-xs">{t('common.form.city')} *</Label>
              <Input
                name="city"
                value={formData.city}
                onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                required
              />
            </Field>
            <Field className="col-span-2">
              <Label className="text-xs">{t('common.form.state')} *</Label>
              <Input
                name="state"
                value={formData.state}
                onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
                placeholder="CA"
                maxLength={2}
                required
              />
            </Field>
            <Field className="col-span-4">
              <Label className="text-xs">{t('common.form.zipCode')} *</Label>
              <Input
                name="zipCode"
                value={formData.zipCode}
                onChange={(e) => setFormData((prev) => ({ ...prev, zipCode: e.target.value }))}
                required
              />
            </Field>
          </div>

          {/* Site Contact (all on one row) */}
          <div className="grid grid-cols-3 gap-2">
            <Field>
              <Label className="text-xs">{t('common.form.siteContactName')}</Label>
              <Input
                name="siteContactName"
                value={formData.siteContactName}
                onChange={(e) => setFormData((prev) => ({ ...prev, siteContactName: e.target.value }))}
              />
            </Field>
            <Field>
              <Label className="text-xs">{t('common.form.siteContactPhone')}</Label>
              <Input
                type="tel"
                name="siteContactPhone"
                value={formData.siteContactPhone}
                onChange={(e) => setFormData((prev) => ({ ...prev, siteContactPhone: e.target.value }))}
              />
            </Field>
            <Field>
              <Label className="text-xs">{t('common.form.siteContactEmail')}</Label>
              <Input
                type="email"
                name="siteContactEmail"
                value={formData.siteContactEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, siteContactEmail: e.target.value }))}
              />
            </Field>
          </div>

          {/* Access Instructions */}
          <Field>
            <Label className="text-xs">{t('common.form.accessInstructions')}</Label>
            <Input
              name="accessInstructions"
              value={formData.accessInstructions}
              onChange={(e) => setFormData((prev) => ({ ...prev, accessInstructions: e.target.value }))}
              placeholder="e.g., Use back entrance, gate code 1234"
            />
          </Field>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="service-location-form"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? t('common.saving') : t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
