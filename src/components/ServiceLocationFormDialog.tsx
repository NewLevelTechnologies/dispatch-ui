import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { customerApi, dispatchRegionApi, type ServiceLocation } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Textarea } from './catalyst/textarea';
import { US_STATES } from '../constants/states';

interface ServiceLocationFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  serviceLocation?: ServiceLocation | null;
  customerId?: string | null;
}

interface FormData {
  dispatchRegionId: string;
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
  notes: string;
}

export default function ServiceLocationFormDialog({ isOpen, onClose, serviceLocation, customerId }: ServiceLocationFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const isEdit = !!serviceLocation;
  const effectiveCustomerId = serviceLocation?.customerId || customerId || '';

  const [formData, setFormData] = useState<FormData>({
    dispatchRegionId: '',
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
    notes: '',
  });

  // Fetch default dispatch region (for single-region tenants)
  const { data: defaultRegion } = useQuery({
    queryKey: ['dispatch-regions', 'default'],
    queryFn: () => dispatchRegionApi.getDefault(),
    enabled: isOpen && !isEdit,
  });

  // Fetch all active dispatch regions
  const { data: activeRegions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
    enabled: isOpen,
  });

  // Reset form when dialog opens or service location changes
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData(
      serviceLocation
        ? {
            dispatchRegionId: serviceLocation.dispatchRegionId,
            locationName: serviceLocation.locationName || '',
            streetAddress: serviceLocation.address.streetAddress,
            streetAddressLine2: serviceLocation.address.streetAddressLine2 || '',
            city: serviceLocation.address.city,
            state: serviceLocation.address.state,
            zipCode: serviceLocation.address.zipCode,
            siteContactName: serviceLocation.siteContactName || '',
            siteContactPhone: serviceLocation.siteContactPhone || '',
            siteContactEmail: serviceLocation.siteContactEmail || '',
            accessInstructions: serviceLocation.accessInstructions || '',
            notes: serviceLocation.notes || '',
          }
        : {
            dispatchRegionId: defaultRegion?.id || '',
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
            notes: '',
          }
    );
  }, [isOpen, serviceLocation, defaultRegion]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const request = {
        dispatchRegionId: data.dispatchRegionId,
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
        notes: data.notes || null,
      };

      return customerApi.addServiceLocation(effectiveCustomerId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', effectiveCustomerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      if (serviceLocation) {
        queryClient.invalidateQueries({ queryKey: ['service-location', serviceLocation.id] });
      }
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: getName('service_location') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!serviceLocation) throw new Error('No service location to update');

      // Update basic fields (not address)
      const updateRequest = {
        dispatchRegionId: data.dispatchRegionId !== serviceLocation.dispatchRegionId ? data.dispatchRegionId : undefined,
        locationName: data.locationName || null,
        siteContactName: data.siteContactName || null,
        siteContactPhone: data.siteContactPhone || null,
        siteContactEmail: data.siteContactEmail || null,
        accessInstructions: data.accessInstructions || null,
        notes: data.notes || null,
      };

      await customerApi.updateServiceLocation(serviceLocation.id, updateRequest);

      // Check if address changed, if so update it separately
      const addressChanged =
        data.streetAddress !== serviceLocation.address.streetAddress ||
        data.streetAddressLine2 !== (serviceLocation.address.streetAddressLine2 || '') ||
        data.city !== serviceLocation.address.city ||
        data.state !== serviceLocation.address.state ||
        data.zipCode !== serviceLocation.address.zipCode;

      if (addressChanged) {
        const addressRequest = {
          streetAddress: data.streetAddress,
          streetAddressLine2: data.streetAddressLine2 || null,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
        };
        await customerApi.updateServiceLocationAddress(serviceLocation.id, addressRequest);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', effectiveCustomerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      if (serviceLocation) {
        queryClient.invalidateQueries({ queryKey: ['service-location', serviceLocation.id] });
      }
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: getName('service_location') }));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} size="3xl">
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.create'),
          entity: getName('service_location'),
        })}
      </DialogTitle>
      <DialogDescription>
        {isEdit
          ? t('common.form.descriptionEdit', { entity: getName('service_location') })
          : t('common.form.descriptionCreate', { entity: getName('service_location') })}
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
              <Select
                name="state"
                value={formData.state}
                onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
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
                name="zipCode"
                value={formData.zipCode}
                onChange={(e) => setFormData((prev) => ({ ...prev, zipCode: e.target.value }))}
                required
              />
            </Field>
          </div>

          {/* Dispatch Region */}
          {activeRegions && activeRegions.length > 0 && (
            <Field>
              <Label className="text-xs">{getName('dispatch')} {t('entities.region')} *</Label>
              <Select
                name="dispatchRegionId"
                value={formData.dispatchRegionId}
                onChange={(e) => setFormData((prev) => ({ ...prev, dispatchRegionId: e.target.value }))}
                required
              >
                <option value="">{t('dispatchRegions.form.selectRegion')}</option>
                {activeRegions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name} ({region.abbreviation})
                  </option>
                ))}
              </Select>
            </Field>
          )}

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
              <PatternFormat
                format="(###) ###-####"
                mask="_"
                customInput={Input}
                name="siteContactPhone"
                value={formData.siteContactPhone}
                onValueChange={(values) => setFormData((prev) => ({ ...prev, siteContactPhone: values.value }))}
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

          {/* Notes */}
          <Field>
            <Label className="text-xs">{t('common.form.notes')}</Label>
            <Textarea
              name="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
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
          disabled={isPending}
        >
          {isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
