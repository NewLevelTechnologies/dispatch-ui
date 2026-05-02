import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  customerApi,
  EquipmentStatus,
  type Equipment,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type CustomerListDto,
  type ServiceLocation,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Textarea } from './catalyst/textarea';

interface EquipmentFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipment?: Equipment | null;
  /**
   * When provided in create mode, locks the equipment to this service location
   * (skips the customer + service-location pickers). Used when adding equipment
   * from a service-location detail page where the location context is implicit.
   */
  lockedServiceLocationId?: string;
}

interface FormState {
  // Scope (create-only; immutable on edit)
  customerId: string;
  serviceLocationId: string;

  // Identification
  name: string;
  description: string;
  make: string;
  model: string;
  serialNumber: string;
  assetTag: string;

  // Taxonomy
  equipmentTypeId: string;
  equipmentCategoryId: string;

  // Location & lifecycle
  locationOnSite: string;
  installDate: string;
  status: EquipmentStatus;
}

const emptyForm: FormState = {
  customerId: '',
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

export default function EquipmentFormDialog({ isOpen, onClose, equipment, lockedServiceLocationId }: EquipmentFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const isEdit = Boolean(equipment);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset / hydrate when dialog opens. setState calls here are intentional form-init
  // synchronization with the `equipment` prop and dialog visibility — same pattern as
  // CustomerFormDialog.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    if (equipment) {
      setFormData({
        customerId: '',
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

  // Customers + locations only fetched when we need to drive the cascade pickers.
  // In edit mode the location is fixed; with a locked location it's implicit.
  const needsCustomerCascade = isOpen && !isEdit && !lockedServiceLocationId;

  const { data: customersPage } = useQuery({
    queryKey: ['equipment-form-customers'],
    queryFn: () => customerApi.getAllPaginated({ page: 1, limit: 200, status: 'ACTIVE' }),
    enabled: needsCustomerCascade,
  });
  const customers: CustomerListDto[] = customersPage?.content ?? [];

  const { data: customerLocations = [] } = useQuery({
    queryKey: ['customer-service-locations', formData.customerId],
    queryFn: () => customerApi.getServiceLocations(formData.customerId),
    enabled: needsCustomerCascade && Boolean(formData.customerId),
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
              {!isEdit && !lockedServiceLocationId && (
                <>
                  <Field>
                    <Label>{getName('customer')} *</Label>
                    <Select
                      name="customerId"
                      value={formData.customerId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customerId: e.target.value,
                          serviceLocationId: '',
                        })
                      }
                      required
                    >
                      <option value="">{t('common.form.select')}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field>
                    <Label>{t('equipment.form.serviceLocation')} *</Label>
                    <Select
                      name="serviceLocationId"
                      value={formData.serviceLocationId}
                      onChange={(e) =>
                        setFormData({ ...formData, serviceLocationId: e.target.value })
                      }
                      required
                      disabled={!formData.customerId}
                    >
                      <option value="">{t('common.form.select')}</option>
                      {customerLocations.map((loc: ServiceLocation) => (
                        <option key={loc.id} value={loc.id}>
                          {formatLocationLabel(loc)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus={!isEdit}
                />
              </Field>

              <Field>
                <Label>{t('common.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              </div>

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

function formatLocationLabel(loc: ServiceLocation): string {
  if (loc.locationName) return loc.locationName;
  const a = loc.address;
  return a ? `${a.streetAddress}, ${a.city}` : loc.id;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string } } }).response?.data;
    if (data?.message) return data.message;
  }
  return fallback;
}
