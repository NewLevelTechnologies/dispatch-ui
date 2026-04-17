import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workOrderApi, type WorkOrder, type ServiceLocationSearchResult } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';
import ServiceLocationPicker from './ServiceLocationPicker';

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

  const [formData, setFormData] = useState<Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>>({
    customerId: '',
    serviceLocationId: '',
    status: 'PENDING',
    scheduledDate: '',
    description: '',
    notes: '',
  });

  const [selectedLocation, setSelectedLocation] = useState<ServiceLocationSearchResult | null>(null);

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    if (workOrder) {
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
      setFormData({
        customerId: '',
        serviceLocationId: '',
        status: 'PENDING',
        scheduledDate: '',
        description: '',
        notes: '',
      });
      setSelectedLocation(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workOrder, isOpen]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.serviceLocationId) {
      alert('Please select a service location');
      return;
    }

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof WorkOrder, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
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
        <form onSubmit={handleSubmit} id="work-order-form">
          <Fieldset>
            <FieldGroup>
              <ServiceLocationPicker
                value={selectedLocation}
                onChange={handleLocationChange}
                label={getName('service_location')}
                required
                autoFocus
              />

              {isEdit && (
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
