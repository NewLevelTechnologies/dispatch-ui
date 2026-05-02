import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  EquipmentStatus,
  type Equipment,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type ServiceLocationSearchResult,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import ServiceLocationPicker from './ServiceLocationPicker';

interface EquipmentFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipment?: Equipment | null;
  /**
   * When provided in create mode, locks the equipment to this service location
   * and hides the location picker entirely. Used from a service-location detail
   * page where the location context is implicit.
   */
  lockedServiceLocationId?: string;
  /**
   * When provided in create mode, restricts the location picker to this
   * customer's locations (opens-on-focus, no min-char typing). Used from a
   * customer detail page where the customer is implicit.
   */
  lockedCustomer?: { id: string; name: string } | null;
}

interface FormState {
  serviceLocationId: string;
  name: string;
  description: string;
  make: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  equipmentTypeId: string;
  equipmentCategoryId: string;
  locationOnSite: string;
  installDate: string;
  status: EquipmentStatus;
}

const emptyForm: FormState = {
  serviceLocationId: '',
  name: '',
  description: '',
  make: '',
  model: '',
  serialNumber: '',
  assetTag: '',
  equipmentTypeId: '',
  equipmentCategoryId: '',
  locationOnSite: '',
  installDate: '',
  status: EquipmentStatus.ACTIVE,
};

export default function EquipmentFormDialog({
  isOpen,
  onClose,
  equipment,
  lockedServiceLocationId,
  lockedCustomer,
}: EquipmentFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const isEdit = Boolean(equipment);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocationSearchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset / hydrate when dialog opens. setState calls here are intentional form-init
  // synchronization with the `equipment` prop and dialog visibility.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setSelectedLocation(null);
    if (equipment) {
      setFormData({
        serviceLocationId: equipment.serviceLocationId,
        name: equipment.name,
        description: equipment.description ?? '',
        make: equipment.make ?? '',
        model: equipment.model ?? '',
        serialNumber: equipment.serialNumber ?? '',
        assetTag: equipment.assetTag ?? '',
        equipmentTypeId: equipment.equipmentTypeId ?? '',
        equipmentCategoryId: equipment.equipmentCategoryId ?? '',
        locationOnSite: equipment.locationOnSite ?? '',
        installDate: equipment.installDate ?? '',
        status: equipment.status,
      });
    } else {
      setFormData({
        ...emptyForm,
        serviceLocationId: lockedServiceLocationId ?? '',
      });
    }
  }, [isOpen, equipment, lockedServiceLocationId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ===== Reference data =====
  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
    enabled: isOpen,
  });

  const { data: equipmentCategories = [] } = useQuery({
    queryKey: ['equipment-categories', formData.equipmentTypeId],
    queryFn: () => equipmentCategoriesApi.getAll(formData.equipmentTypeId || undefined),
    enabled: isOpen && Boolean(formData.equipmentTypeId),
  });

  // ===== Mutations =====
  const createMutation = useMutation({
    mutationFn: (request: CreateEquipmentRequest) => equipmentApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      onClose();
    },
    onError: (error: unknown) => {
      setErrorMessage(extractErrorMessage(error, t('common.form.errorCreate', { entity: getName('equipment') })));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEquipmentRequest }) =>
      equipmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      onClose();
    },
    onError: (error: unknown) => {
      setErrorMessage(extractErrorMessage(error, t('common.form.errorUpdate', { entity: getName('equipment') })));
    },
  });

  const handleLocationChange = (location: ServiceLocationSearchResult | null) => {
    setSelectedLocation(location);
    setFormData((prev) => ({ ...prev, serviceLocationId: location?.id ?? '' }));
  };

  // ===== Submit =====
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isEdit && equipment) {
      const payload: UpdateEquipmentRequest = {
        name: formData.name,
        description: formData.description || null,
        make: formData.make || null,
        model: formData.model || null,
        serialNumber: formData.serialNumber || null,
        assetTag: formData.assetTag || null,
        equipmentTypeId: formData.equipmentTypeId || null,
        equipmentCategoryId: formData.equipmentCategoryId || null,
        locationOnSite: formData.locationOnSite || null,
        installDate: formData.installDate || null,
        status: formData.status,
      };
      updateMutation.mutate({ id: equipment.id, data: payload });
    } else {
      if (!formData.serviceLocationId) {
        setErrorMessage(t('common.form.required', { field: t('equipment.form.serviceLocation') }));
        return;
      }
      const payload: CreateEquipmentRequest = {
        name: formData.name,
        serviceLocationId: formData.serviceLocationId,
        description: formData.description || null,
        make: formData.make || null,
        model: formData.model || null,
        serialNumber: formData.serialNumber || null,
        assetTag: formData.assetTag || null,
        equipmentTypeId: formData.equipmentTypeId || null,
        equipmentCategoryId: formData.equipmentCategoryId || null,
        locationOnSite: formData.locationOnSite || null,
        installDate: formData.installDate || null,
        status: formData.status,
      };
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const showLocationPicker = !isEdit && !lockedServiceLocationId;

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>
        {isEdit
          ? t('common.actions.edit', { entity: getName('equipment') })
          : t('common.actions.add', { entity: getName('equipment') })}
      </DialogTitle>
      <DialogDescription>
        {isEdit
          ? t('common.form.descriptionEdit', { entity: getName('equipment') })
          : t('common.form.descriptionCreate', { entity: getName('equipment') })}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <Fieldset>
            <FieldGroup>
              {showLocationPicker && (
                <ServiceLocationPicker
                  value={selectedLocation}
                  onChange={handleLocationChange}
                  label={t('equipment.form.serviceLocation')}
                  required
                  restrictToCustomer={lockedCustomer ?? undefined}
                />
              )}

              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus={!isEdit && !showLocationPicker}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <Label>{t('equipment.form.type')}</Label>
                  <Select
                    name="equipmentTypeId"
                    value={formData.equipmentTypeId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        equipmentTypeId: e.target.value,
                        equipmentCategoryId: '',
                      })
                    }
                  >
                    <option value="">{t('common.none')}</option>
                    {equipmentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{t('equipment.form.category')}</Label>
                  <Select
                    name="equipmentCategoryId"
                    value={formData.equipmentCategoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, equipmentCategoryId: e.target.value })
                    }
                    disabled={!formData.equipmentTypeId}
                  >
                    <option value="">{t('common.none')}</option>
                    {equipmentCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{t('equipment.form.make')}</Label>
                  <Input
                    name="make"
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.model')}</Label>
                  <Input
                    name="model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.serialNumber')}</Label>
                  <Input
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.assetTag')}</Label>
                  <Input
                    name="assetTag"
                    value={formData.assetTag}
                    onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.locationOnSite')}</Label>
                  <Input
                    name="locationOnSite"
                    value={formData.locationOnSite}
                    onChange={(e) => setFormData({ ...formData, locationOnSite: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>{t('equipment.form.installDate')}</Label>
                  <Input
                    type="date"
                    name="installDate"
                    value={formData.installDate}
                    onChange={(e) => setFormData({ ...formData, installDate: e.target.value })}
                  />
                </Field>
              </div>

              <Field>
                <Label>{t('common.form.description')}</Label>
                <Input
                  name="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </Field>

              {isEdit && (
                <Field>
                  <Label>{t('common.form.status')}</Label>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as EquipmentStatus })
                    }
                  >
                    <option value={EquipmentStatus.ACTIVE}>{t('equipment.status.active')}</option>
                    <option value={EquipmentStatus.RETIRED}>{t('equipment.status.retired')}</option>
                  </Select>
                </Field>
              )}
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving
              ? t('common.saving')
              : isEdit
                ? t('common.update')
                : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string } } }).response?.data;
    if (data?.message) return data.message;
  }
  return fallback;
}
