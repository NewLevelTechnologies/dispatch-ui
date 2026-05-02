import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentFiltersApi,
  type EquipmentFilter,
  type CreateEquipmentFilterRequest,
  type UpdateEquipmentFilterRequest,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface EquipmentFilterFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentId: string;
  /** Existing filter to edit. If null, dialog is in create mode. */
  filter?: EquipmentFilter | null;
  /**
   * When set in create mode, pre-populates length/width/thickness from a
   * tenant common-size chip the user clicked. User can still tweak before
   * saving.
   */
  prefilledSize?: { lengthIn: number; widthIn: number; thicknessIn: number } | null;
}

interface FormState {
  lengthIn: string;
  widthIn: string;
  thicknessIn: string;
  quantity: string;
  label: string;
}

const emptyForm: FormState = {
  lengthIn: '',
  widthIn: '',
  thicknessIn: '',
  quantity: '1',
  label: '',
};

export default function EquipmentFilterFormDialog({
  isOpen,
  onClose,
  equipmentId,
  filter,
  prefilledSize,
}: EquipmentFilterFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = Boolean(filter);

  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    if (filter) {
      setFormData({
        lengthIn: String(filter.lengthIn),
        widthIn: String(filter.widthIn),
        thicknessIn: String(filter.thicknessIn),
        quantity: String(filter.quantity),
        label: filter.label ?? '',
      });
    } else if (prefilledSize) {
      setFormData({
        ...emptyForm,
        lengthIn: String(prefilledSize.lengthIn),
        widthIn: String(prefilledSize.widthIn),
        thicknessIn: String(prefilledSize.thicknessIn),
      });
    } else {
      setFormData(emptyForm);
    }
  }, [isOpen, filter, prefilledSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-filters', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
  };

  const createMutation = useMutation({
    mutationFn: (request: CreateEquipmentFilterRequest) =>
      equipmentFiltersApi.create(equipmentId, request),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (error: unknown) => {
      setErrorMessage(extractErrorMessage(error, t('equipment.filters.errorCreate')));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEquipmentFilterRequest }) =>
      equipmentFiltersApi.update(equipmentId, id, data),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (error: unknown) => {
      setErrorMessage(extractErrorMessage(error, t('equipment.filters.errorUpdate')));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const lengthIn = Number(formData.lengthIn);
    const widthIn = Number(formData.widthIn);
    const thicknessIn = Number(formData.thicknessIn);
    const quantity = Number(formData.quantity || '1');

    if (!isPositiveNumber(lengthIn) || !isPositiveNumber(widthIn) || !isPositiveNumber(thicknessIn)) {
      setErrorMessage(t('equipment.filters.invalidDimensions'));
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setErrorMessage(t('equipment.filters.invalidQuantity'));
      return;
    }

    if (isEdit && filter) {
      updateMutation.mutate({
        id: filter.id,
        data: {
          lengthIn,
          widthIn,
          thicknessIn,
          quantity,
          label: formData.label.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        lengthIn,
        widthIn,
        thicknessIn,
        quantity,
        label: formData.label.trim() || null,
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>
        {isEdit ? t('equipment.filters.titleEdit') : t('equipment.filters.titleAdd')}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <Fieldset>
            <FieldGroup className="!space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label>{t('equipment.filters.length')} *</Label>
                  <Input
                    name="lengthIn"
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={formData.lengthIn}
                    onChange={(e) => setFormData({ ...formData, lengthIn: e.target.value })}
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <Label>{t('equipment.filters.width')} *</Label>
                  <Input
                    name="widthIn"
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={formData.widthIn}
                    onChange={(e) => setFormData({ ...formData, widthIn: e.target.value })}
                    required
                  />
                </Field>
                <Field>
                  <Label>{t('equipment.filters.thickness')} *</Label>
                  <Input
                    name="thicknessIn"
                    type="number"
                    inputMode="decimal"
                    step="0.25"
                    min="0"
                    value={formData.thicknessIn}
                    onChange={(e) => setFormData({ ...formData, thicknessIn: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field>
                  <Label>{t('equipment.filters.quantity')}</Label>
                  <Input
                    name="quantity"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <Label>{t('equipment.filters.label')}</Label>
                  <Input
                    name="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder={t('equipment.filters.labelPlaceholder')}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function isPositiveNumber(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && 'response' in error) {
    const data = (error as { response?: { data?: { message?: string } } }).response?.data;
    if (data?.message) return data.message;
  }
  return fallback;
}
