import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { contactApi, type AdditionalContact, type CreateAdditionalContactRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { validateEmail } from '../utils/validation';

interface AdditionalContactFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentId: string;
  parentType: 'customer' | 'serviceLocation';
  contact?: AdditionalContact | null;
  queryKey: string[];
}

export default function AdditionalContactFormDialog({
  isOpen,
  onClose,
  parentId,
  parentType,
  contact,
  queryKey,
}: AdditionalContactFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!contact;

  const [formData, setFormData] = useState<CreateAdditionalContactRequest>({
    name: '',
    phone: null,
    email: null,
    notes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data from contact prop or empty form
  const initialFormData: CreateAdditionalContactRequest = contact
    ? {
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
        notes: contact.notes || null,
      }
    : {
        name: '',
        phone: null,
        email: null,
        notes: null,
      };

  // Reset form when dialog opens/closes or contact changes
  useEffect(() => {
    if (isOpen) {
      setFormData(initialFormData);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contact?.id]);

  const createMutation = useMutation({
    mutationFn: (data: CreateAdditionalContactRequest) => {
      if (parentType === 'customer') {
        return contactApi.createCustomerContact(parentId, data);
      } else {
        return contactApi.createServiceLocationContact(parentId, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: t('contacts.entity') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateAdditionalContactRequest) => {
      if (!contact) throw new Error('No contact to update');
      if (parentType === 'customer') {
        return contactApi.updateCustomerContact(parentId, contact.id, data);
      } else {
        return contactApi.updateServiceLocationContact(parentId, contact.id, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('contacts.entity') }));
    },
  });

  const handleChange = (field: keyof CreateAdditionalContactRequest, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value || null }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = t('common.form.required', { field: t('common.form.name') });
    }

    if (formData.email && !validateEmail(formData.email)) {
      newErrors.email = t('common.form.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>
        {isEdit ? t('contacts.form.titleEdit') : t('contacts.form.titleCreate')}
      </DialogTitle>
      <DialogDescription>
        {isEdit ? t('contacts.form.descriptionEdit') : t('contacts.form.descriptionCreate')}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  invalid={!!errors.name}
                />
                {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name}</div>}
              </Field>

              <Field>
                <Label>{t('common.form.phone')}</Label>
                <Input
                  name="phone"
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </Field>

              <Field>
                <Label>{t('common.form.email')}</Label>
                <Input
                  name="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                  invalid={!!errors.email}
                />
                {errors.email && <div className="text-xs text-red-600 mt-1">{errors.email}</div>}
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
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
