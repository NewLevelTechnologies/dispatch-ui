import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { customerApi, type Customer } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface CustomerFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

export default function CustomerFormDialog({ isOpen, onClose, customer }: CustomerFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!customer?.id;

  const [formData, setFormData] = useState<Customer>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    if (customer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(customer);
    } else {
       
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
      });
    }
  }, [customer, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: Customer) => customerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Customer) => customerApi.update(customer!.id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
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

  const handleChange = (field: keyof Customer, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
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
        <form onSubmit={handleSubmit} id="customer-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>{t('common.form.email')} *</Label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>{t('common.form.phone')}</Label>
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </Field>

              <Field>
                <Label>{t('common.form.address')}</Label>
                <Input
                  name="address"
                  value={formData.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('common.form.city')}</Label>
                  <Input
                    name="city"
                    value={formData.city || ''}
                    onChange={(e) => handleChange('city', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.state')}</Label>
                  <Input
                    name="state"
                    value={formData.state || ''}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder={t('common.form.stateHelper')}
                    maxLength={2}
                  />
                </Field>
              </div>

              <Field>
                <Label>{t('common.form.zipCode')}</Label>
                <Input
                  name="zipCode"
                  value={formData.zipCode || ''}
                  onChange={(e) => handleChange('zipCode', e.target.value)}
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
